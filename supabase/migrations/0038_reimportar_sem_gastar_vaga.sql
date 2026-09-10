-- Migration: trazer de volta o que foi apagado deixa de consumir vaga da amostra.
--
-- PROBLEMA: apagar um produto era irreversível para quem só tem a amostra. Quem
-- resgatou as 10 e apagou uma ficava sem caminho de volta — só comprando o pacote
-- inteiro por causa de um item.
--
-- E não era regra, era efeito colateral de uma conta. Tudo o mais nesta função já
-- estava pronto para a reimportação:
--
--   * o filtro de elegíveis ignora rastro órfão (`and mi.product_id is not null`),
--     então o item apagado PASSA;
--   * `v_ja_tinha` também só conta rastro vivo;
--   * o `update` do fim religa `marketplace_imports.product_id` ao produto novo;
--   * e o trigger de quota da 0029 diz, em cláusula explícita, que "reimportar um
--     item que a loja já conheceu não consome vaga nova".
--
-- O que barrava era `v_usadas`, que contava TODOS os rastros — inclusive o órfão da
-- exclusão. Com 10 rastros e teto 10, `v_disponiveis` dava 0 e o `limit 0` esvaziava
-- a lista de elegíveis. A função recusava em silêncio: devolvia `importados: 0`, sem
-- erro nenhum.
--
-- Quem tem `marketplace_access` nunca sentiu isso: `v_disponiveis` fica nulo e o
-- `limit null` não corta nada. Esta migration só alcança o caso da amostra.
--
-- A CORREÇÃO: a cota passa a valer apenas para o que é NOVO para a loja. Reimportar
-- o que ela já teve não disputa vaga, porque a vaga já foi gasta uma vez e nunca foi
-- devolvida — é o mesmo raciocínio que o trigger já aplicava, agora também aqui.
--
-- O teto continua de pé para aquisição: uma loja sem acesso segue sem conseguir levar
-- uma décima primeira chuteira diferente. E o trigger da 0029 continua sendo a última
-- palavra, então nem uma chamada direta pela REST contorna isso.

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
    -- Vagas gastas: só o que a loja TEM. O rastro órfão que a exclusão deixa não
    -- entra na conta aqui — ele é justamente o que autoriza a volta, e contá-lo
    -- fazia a loja competir consigo mesma por uma vaga que ela já pagou.
    select count(distinct mi.marketplace_product_id) into v_usadas
    from marketplace_imports mi
    where mi.store_id = v_store_id
      and mi.product_id is not null;
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
