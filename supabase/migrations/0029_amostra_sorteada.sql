-- Migration: a amostra grátis passa a ser SORTEADA de verdade.
--
-- POR QUE: a decisão de produto (docs/marketplace/02-RESPOSTAS.md, D-amostra) é
-- "10 produtos sorteados", não "10 escolhidos". A razão é comercial: se o
-- lojista escolhe a dedo, ele leva as 10 melhores e o pacote perde o motivo de
-- existir.
--
-- O código não implementava isso. O sorteio vivia só no pop-up, em JavaScript, e
-- nenhuma camada validava QUAIS itens entravam:
--
--   * o trigger da 0025 checava count(distinct ...) >= 10 — quantidade;
--   * a função da 0028 cortava o excedente por source_rank — os melhores;
--   * a RLS limitava ao pool `preview` (~100 itens), não a 10.
--
-- O direito real era "10 quaisquer entre 100". Esta migration transforma o
-- sorteio de encenação em fato gravado, e o torna a autorização.

-- =============================================================================
-- Tabela: marketplace_sample_draws
-- =============================================================================
-- O sorteio deixa de ser derivado e vira linha no banco.
--
-- Persistir (em vez de recomputar um hash de store_id a cada carregamento, que é
-- o que src/lib/marketplace/amostra.ts fazia) resolve duas coisas que a versão
-- derivada não resistia:
--
--   1. o admin mexer no pool `preview` DEPOIS do sorteio mudaria, em silêncio, a
--      amostra de quem já estava decidindo;
--   2. qualquer divergência entre a recomputação do app e a do banco viraria uma
--      brecha de autorização, não um bug cosmético.
create table if not exists marketplace_sample_draws (
  store_id uuid not null references stores(id) on delete cascade,
  marketplace_product_id uuid not null references marketplace_products(id) on delete cascade,

  -- Ordem em que saíram no sorteio. É o que faz a animação de revelação mostrar
  -- sempre a mesma sequência, em vez de reembaralhar a cada abertura.
  position smallint not null,

  created_at timestamptz not null default now(),

  primary key (store_id, marketplace_product_id)
);

create index if not exists marketplace_sample_draws_store_idx
  on marketplace_sample_draws (store_id, position);

alter table marketplace_sample_draws enable row level security;

-- SÓ LEITURA, e só da própria loja. Não existe policy de insert/update/delete de
-- propósito: a única escrita permitida é a da função abaixo, que é
-- `security definer`. Se houvesse policy de insert, o lojista poderia montar a
-- própria "amostra sorteada" pela REST — que é exatamente o buraco que esta
-- migration fecha.
drop policy if exists "owner_read_marketplace_sample_draws" on marketplace_sample_draws;
create policy "owner_read_marketplace_sample_draws" on marketplace_sample_draws
  for select
  to authenticated
  using (store_id in (select id from stores where owner_id = auth.uid()));

-- =============================================================================
-- Função: sortear_amostra_da_loja
-- =============================================================================
-- Sorteia UMA VEZ e nunca mais. Chamar de novo devolve o mesmo resultado.
--
-- É o ponto onde a regra "o sorteio nunca é refeito" existe de fato: sem isso,
-- recarregar a página ou limpar o navegador viraria uma forma de garimpar até
-- gostar do resultado, e "sortear" seria só um jeito lento de escolher.
--
-- `security definer` porque a tabela não tem policy de escrita para ninguém.
--
-- Os nomes de saída (`produto_id`, `posicao`) são deliberadamente diferentes dos
-- nomes das colunas: em plpgsql, um parâmetro OUT homônimo de uma coluna
-- referenciada no corpo dispara "column reference is ambiguous".
create or replace function public.sortear_amostra_da_loja(p_store_id uuid default null)
returns table (produto_id uuid, posicao smallint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Tamanho da amostra. Mesmo número do trigger da 0025 e da função da 0028;
  -- mudar a regra exige mudar os três (ver comentário no fim deste arquivo).
  v_limite constant int := 10;
  v_store_id uuid;
  v_existentes int;
begin
  -- Sem argumento, resolve a loja do próprio usuário. Com argumento, confere a
  -- posse aqui mesmo — a função é `definer`, então a RLS não faz isso por ela.
  if p_store_id is null then
    select s.id into v_store_id from stores s where s.owner_id = auth.uid() limit 1;
  else
    -- `auth.uid() is null` cobre a chamada vinda do trigger sob service_role (e
    -- de scripts de manutenção): ali não há sessão, e exigir posse travaria a
    -- importação em vez de protegê-la.
    select s.id into v_store_id
    from stores s
    where s.id = p_store_id
      and (auth.uid() is null or s.owner_id = auth.uid());
  end if;

  if v_store_id is null then
    return;
  end if;

  select count(*) into v_existentes
  from marketplace_sample_draws d
  where d.store_id = v_store_id;

  -- SÓ COMPLETA, NUNCA REFAZ. O que já foi sorteado é intocável; o que falta
  -- para chegar a `v_limite` é sorteado agora.
  --
  -- A distinção importa por causa do backfill logo abaixo: uma loja que já tinha
  -- importado 3 itens à mão entra aqui com 3 linhas, e um "já tem alguma, então
  -- não mexe" a deixaria com uma amostra de 3 para sempre. Ela tem direito às 10.
  if v_existentes < v_limite then
    -- O peso é estável por par (loja, produto): duas lojas diferentes tiram
    -- conjuntos diferentes, e o resultado não depende da ordem em que as linhas
    -- voltam do planejador. É a porta do FNV-1a que vivia em amostra.ts, agora
    -- do lado que manda.
    --
    -- Sorteia dentro do POOL DE DESTAQUES (`preview`), não do acervo inteiro: a
    -- amostra é a peça que vende o pacote, e um sorteio cego poderia entregar os
    -- modelos mais fracos como cartão de visita.
    insert into marketplace_sample_draws (store_id, marketplace_product_id, position)
    select v_store_id,
           s.id,
           (v_existentes + row_number() over (order by s.peso))::smallint
    from (
      select mp.id, hashtext(v_store_id::text || ':' || mp.id::text) as peso
      from marketplace_products mp
      where mp.status = 'published'
        and mp.preview
        and not exists (
          select 1 from marketplace_sample_draws d
          where d.store_id = v_store_id and d.marketplace_product_id = mp.id
        )
      order by peso
      limit (v_limite - v_existentes)
    ) s
    on conflict do nothing;
  end if;

  return query
    select d.marketplace_product_id, d.position
    from marketplace_sample_draws d
    where d.store_id = v_store_id
    order by d.position;
end;
$$;

revoke all on function public.sortear_amostra_da_loja(uuid) from public;
grant execute on function public.sortear_amostra_da_loja(uuid) to authenticated;

-- =============================================================================
-- Backfill: quem já importou antes desta migration
-- =============================================================================
-- As lojas que já levaram itens escolhendo a dedo mantêm o que levaram.
--
-- Sem isto, os produtos que o lojista já tem na vitrine passariam a estar "fora
-- da amostra": a interface acusaria incoerência e uma reimportação depois de
-- excluir seria rejeitada. Tirar produto de quem já está com a loja montada é
-- pior do que perdoar uma escolha feita quando escolher era permitido.
--
-- Se ele tem menos de 10, as vagas restantes são sorteadas na primeira chamada
-- de `sortear_amostra_da_loja` — que completa em vez de refazer, justamente por
-- causa deste caso.
insert into marketplace_sample_draws (store_id, marketplace_product_id, position)
select mi.store_id,
       mi.marketplace_product_id,
       (row_number() over (partition by mi.store_id order by mi.created_at))::smallint
from marketplace_imports mi
join stores s on s.id = mi.store_id
where not coalesce(s.marketplace_access, false)
on conflict do nothing;

-- =============================================================================
-- Trigger de quota: passa a validar QUAIS, não só QUANTOS
-- =============================================================================
-- Substitui a função da 0025 mantendo tudo o que ela já fazia — o teto de 10 e a
-- isenção do rastro órfão continuam, agora como rede de segunda linha — e
-- acrescenta a checagem que faltava: o item precisa estar na amostra sorteada.
--
-- A barreira vive aqui, no banco, e não na aplicação, porque a chave
-- `authenticated` do Supabase está no bundle do cliente: qualquer regra que só
-- exista no TypeScript é contornável com um POST direto na REST. Mesma defesa em
-- profundidade já aplicada em `public_insert_order_clicks` (migration 0005).
create or replace function public.enforce_marketplace_import_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  limite constant int := 10;
  tem_acesso boolean;
  distintos int;
  na_amostra boolean;
begin
  select marketplace_access into tem_acesso from stores where id = new.store_id;
  if coalesce(tem_acesso, false) then
    return new;
  end if;

  -- Reimportar um item que a loja já conheceu não consome vaga nova, e também
  -- não é reexaminado contra a amostra: ele já passou por aqui uma vez.
  if exists (
    select 1 from marketplace_imports
    where store_id = new.store_id
      and marketplace_product_id = new.marketplace_product_id
  ) then
    return new;
  end if;

  -- Materializa o sorteio se ainda não houve nenhum. Cobre o caso de um insert
  -- chegar sem que o pop-up tenha rodado — inclusive um vindo da REST, que é
  -- justamente o caminho que precisa ser barrado.
  if not exists (select 1 from marketplace_sample_draws where store_id = new.store_id) then
    perform public.sortear_amostra_da_loja(new.store_id);
  end if;

  select exists (
    select 1 from marketplace_sample_draws d
    where d.store_id = new.store_id
      and d.marketplace_product_id = new.marketplace_product_id
  ) into na_amostra;

  if not na_amostra then
    raise exception
      'Esta chuteira não faz parte da sua amostra sorteada. Libere o pacote para escolher o que quiser.'
      using errcode = 'check_violation';
  end if;

  -- Teto por contagem, mantido. Com a amostra tendo exatamente `limite` linhas,
  -- a checagem acima já implica esta — ela fica como rede de segurança para o
  -- caso de um backfill ou uma correção manual deixarem mais linhas do que o
  -- previsto.
  select count(distinct marketplace_product_id) into distintos
  from marketplace_imports
  where store_id = new.store_id;

  if distintos >= limite then
    raise exception
      'Limite da amostra gratuita atingido (% produtos). Libere o pacote para importar o catálogo completo.',
      limite
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- Importação em lote: corrigir o critério de corte
-- =============================================================================
-- A versão da 0028 cortava o excedente por `source_rank desc` — ou seja, quando
-- o teto batia, o BANCO escolhia os mais bem ranqueados. Era a mesma falha do
-- app, só que automatizada: um lojista sem acesso mandava os 990 ids e recebia
-- de volta os 10 melhores do acervo.
--
-- Agora, sem acesso, os elegíveis são a interseção com a amostra sorteada. Com
-- acesso, nada muda.
create or replace function public.importar_marketplace_em_lote(p_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_limite constant int := 10;
  v_store_id uuid;
  v_acesso boolean;
  v_ja_tinha int := 0;
  v_usadas int := 0;
  v_disponiveis int;
  v_permitidos uuid[];
  v_importados int := 0;
begin
  select s.id, s.marketplace_access into v_store_id, v_acesso
  from stores s
  where s.owner_id = auth.uid()
  limit 1;

  if v_store_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Loja não encontrada.');
  end if;

  select count(*) into v_ja_tinha
  from marketplace_imports mi
  where mi.store_id = v_store_id
    and mi.product_id is not null
    and mi.marketplace_product_id = any(p_ids);

  if coalesce(v_acesso, false) then
    v_disponiveis := null; -- sem teto
  else
    -- Garante que a amostra existe antes de filtrar por ela.
    perform public.sortear_amostra_da_loja(v_store_id);

    select count(distinct mi.marketplace_product_id) into v_usadas
    from marketplace_imports mi
    where mi.store_id = v_store_id;
    v_disponiveis := greatest(0, v_limite - v_usadas);
  end if;

  select array_agg(id) into v_permitidos
  from (
    select mp.id
    from marketplace_products mp
    where mp.id = any(p_ids)
      and mp.status = 'published'
      and not exists (
        select 1 from marketplace_imports mi
        where mi.store_id = v_store_id
          and mi.marketplace_product_id = mp.id
          and mi.product_id is not null
      )
      -- A trava: sem acesso, só o que foi sorteado para esta loja.
      and (
        coalesce(v_acesso, false)
        or exists (
          select 1 from marketplace_sample_draws d
          where d.store_id = v_store_id
            and d.marketplace_product_id = mp.id
        )
      )
    order by mp.source_rank desc nulls last
    limit v_disponiveis   -- NULL = sem limite
  ) elegiveis;

  if v_permitidos is null or cardinality(v_permitidos) = 0 then
    return jsonb_build_object(
      'ok', true, 'importados', 0, 'ja_tinha', v_ja_tinha,
      'bloqueados', greatest(0, cardinality(p_ids) - v_ja_tinha)
    );
  end if;

  insert into marketplace_imports (store_id, marketplace_product_id)
  select v_store_id, x
  from unnest(v_permitidos) x
  where not exists (
    select 1 from marketplace_imports mi
    where mi.store_id = v_store_id and mi.marketplace_product_id = x
  );

  -- Daqui para baixo é idêntico à 0028; ver lá o porquê dos comandos separados
  -- (a RLS de product_photos não enxerga linhas de products criadas no MESMO
  -- comando).
  insert into products (
    store_id, name, brand, brand_other, sole, category,
    fulfillment, price, status, marketplace_product_id
  )
  select v_store_id, mp.name, mp.brand, mp.brand_other, mp.sole,
         coalesce(mp.category, 'Chuteira'),
         'sob_encomenda', mp.suggested_price, 'draft', mp.id
  from marketplace_products mp
  where mp.id = any(v_permitidos);

  -- Conta o que REALMENTE entrou, não o tamanho da lista de permitidos: se o
  -- trigger barrar uma linha, os dois números divergem.
  get diagnostics v_importados = row_count;

  insert into product_sizes (product_id, size, available)
  select p.id, t, true
  from products p
  join marketplace_products mp on mp.id = p.marketplace_product_id
  cross join lateral generate_series(mp.size_min::int, mp.size_max::int) t
  where p.store_id = v_store_id
    and p.marketplace_product_id = any(v_permitidos);

  insert into product_photos (product_id, storage_path, position, source)
  select p.id, ph.storage_path, ph.position, 'marketplace'
  from products p
  join marketplace_photos ph on ph.marketplace_product_id = p.marketplace_product_id
  where p.store_id = v_store_id
    and p.marketplace_product_id = any(v_permitidos);

  update marketplace_imports mi
  set product_id = p.id
  from products p
  where p.store_id = v_store_id
    and p.marketplace_product_id = any(v_permitidos)
    and mi.store_id = v_store_id
    and mi.marketplace_product_id = p.marketplace_product_id;

  return jsonb_build_object(
    'ok', true,
    'importados', v_importados,
    'ja_tinha', v_ja_tinha,
    'bloqueados', greatest(0, cardinality(p_ids) - v_ja_tinha - v_importados)
  );
end;
$$;

-- O número 10 aparece em três lugares no banco (aqui, no trigger acima e na
-- função de sorteio) e em TAMANHO_AMOSTRA no app. Mudar a regra exige mudar os
-- quatro — não há como um constant de plpgsql ser lido do TypeScript, e uma
-- tabela de configuração para um único número custaria mais do que resolve.

grant execute on function public.importar_marketplace_em_lote(uuid[]) to authenticated;
