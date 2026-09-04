-- Migration: o produto importado nasce PUBLICADO na vitrine.
--
-- A 0033 gravava 'draft' e o motivo era bom NA ÉPOCA: o produto entrava com
-- `suggested_price` — o preço da curadoria — e publicar centenas por engano vendia pelo
-- preço errado. O fluxo de precificação matou esse risco: o preço agora é o que o lojista
-- digitou e conferiu no resumo, minutos antes de a importação rodar.
--
-- O que sobrou do rascunho foi um beco sem saída. NÃO EXISTE PUBLICAR EM LOTE no painel:
-- `publishProduct` é um por vez e a lista de produtos não tem esse botão — tirar um
-- rascunho do escuro exige abrir o produto e salvar. Para as 990 do pacote são quase três
-- horas de cliques. Na prática "rascunho" não era "reviso depois", era NUNCA PUBLICADO: o
-- lojista precificava, via a tela de sucesso e a vitrine que ele manda no WhatsApp
-- continuava vazia.
--
-- Publicar direto não mente sobre estoque: o importado entra como `sob_encomenda`
-- (7-25 dias), nada é reservado.
--
-- RISCOS ACEITOS pelo dono, registrados aqui porque continuam de pé:
--   * sem ação em lote, despublicar em massa também não existe — quem se arrepender não
--     tem caminho de volta hoje;
--   * a vitrine ordena por `created_at desc`, então o catálogo importado passa na frente
--     dos produtos que a loja já tinha cadastrado.
--
-- Fora a palavra do status, o corpo é idêntico ao da 0034 — inclusive o
-- `statement_timeout` de 30s, que é o que impede o pacote de 990 de estourar o corte de 8s
-- do role `authenticated`.

create or replace function public.importar_marketplace_em_lote(
  p_ids       uuid[],
  p_precos    jsonb,
  p_adicional numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
-- O role `authenticated` do Supabase corta qualquer statement em 8s, e o pacote inteiro
-- leva ~10s: medido em 1,2s para 100 produtos, 3,0s para 300 e 5,9s para 600 — linear,
-- ~10ms por par. Não é lógica ruim, é volume: 990 produtos arrastam ~10.000 linhas de
-- grade e ~7.000 de foto. A importação do pacote FALHAVA SEMPRE com 57014.
--
-- `set` na definição da função, e não `SET LOCAL` no corpo: vale só enquanto esta função
-- roda e volta ao normal ao sair, sem precisar lembrar de restaurar em cada caminho de
-- saída. 30s dá folga para o acervo dobrar de tamanho antes de isto voltar a apertar.
--
-- A alternativa era quebrar em lotes no app, e ela custava caro: a transação única é o que
-- garante "ou as 990 entram, ou nenhuma entra" — cinco chamadas separadas podem deixar a
-- loja com 600 produtos e um erro na tela.
set statement_timeout = '30s'
as $$
declare
  v_limite constant int := 10;   -- espelha TAMANHO_AMOSTRA e o trigger da 0025
  v_store_id uuid;
  v_acesso boolean;
  v_ja_tinha int := 0;
  v_usadas int := 0;
  v_disponiveis int;
  v_permitidos uuid[];
  v_importados int := 0;
  v_adicional numeric := coalesce(p_adicional, 0);
  v_precos jsonb := coalesce(p_precos, '{}'::jsonb);
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
    v_disponiveis := null;  -- sem teto
  else
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
    order by mp.source_rank desc nulls last
    limit v_disponiveis
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

  insert into products (
    store_id, name, brand, brand_other, sole, category,
    fulfillment, price, status, marketplace_product_id
  )
  select
    v_store_id, mp.name, mp.brand, mp.brand_other, mp.sole,
    coalesce(mp.category, 'Chuteira'),
    'sob_encomenda',
    -- ESTE é o único ponto que difere da 0028.
    --
    -- `coalesce` para o suggested_price porque `products.price` é NOT NULL: um solado que
    -- a loja não precificou (o acervo ganhou uma sigla nova, o lojista deixou o campo em
    -- branco) não pode derrubar a importação inteira nem gravar preço nulo.
    --
    -- A chave é a SIGLA do solado. A interface junta AG e MG num item só ("Multigramados"),
    -- mas grava o mesmo número nas duas siglas — então aqui não existe conceito de grupo.
    coalesce((v_precos ->> mp.sole)::numeric, mp.suggested_price)
      + case when mp.is_lancamento then v_adicional else 0 end,
    -- PUBLICADO. Ver o cabeçalho desta migration: o rascunho existia para proteger o
    -- lojista de um preço que não era dele, e esse preço não existe mais.
    'published',
    mp.id
  from marketplace_products mp
  where mp.id = any(v_permitidos);

  get diagnostics v_importados = row_count;

  insert into product_sizes (product_id, size, available)
  select p.id, t, true
  from products p
  join marketplace_products mp on mp.id = p.marketplace_product_id
  cross join lateral generate_series(mp.size_min::int, mp.size_max::int) as t
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

grant execute on function public.importar_marketplace_em_lote(uuid[], jsonb, numeric) to authenticated;
