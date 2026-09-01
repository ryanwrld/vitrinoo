-- Migration: importação em lote do marketplace, em uma única chamada.
--
-- POR QUE: a importação item a item (src/lib/marketplace/import-actions.ts) faz
-- ~4 idas ao banco por produto. Serve para 1 ou 20 itens; para o botão que o
-- pack inteiro exige — "adicionar as 990 à minha loja", ou só o álbum Nike com
-- 468 — daria ~4.000 round-trips e minutos de espera, com a página presa e sem
-- nenhuma garantia de atomicidade se cair no meio.
--
-- Esta função resolve tudo em UMA transação, com inserções em conjunto. Ou o
-- lote inteiro entra, ou nada entra.
--
-- `security invoker` (e não definer) de propósito: a RLS precisa continuar
-- valendo. Uma loja sem acesso ao pack só enxerga os 100 do preview, e é o banco
-- que garante isso — a função não recebe nenhum privilégio extra para contornar.

create or replace function public.importar_marketplace_em_lote(p_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  -- Espelha TAMANHO_AMOSTRA_GRATUITA do app e o limite do trigger da 0025.
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

  -- Quantos dos pedidos a loja JÁ tem ativos. Não é erro: o usuário clicou
  -- "adicionar álbum" e parte dele já estava lá. Vira informação, não falha.
  select count(*) into v_ja_tinha
  from marketplace_imports mi
  where mi.store_id = v_store_id
    and mi.product_id is not null
    and mi.marketplace_product_id = any(p_ids);

  -- Vagas restantes da amostra, para quem ainda não liberou o pack. Conta
  -- DISTINTOS: excluir um produto e reimportá-lo não consome vaga nova.
  if coalesce(v_acesso, false) then
    v_disponiveis := null; -- sem teto
  else
    select count(distinct mi.marketplace_product_id) into v_usadas
    from marketplace_imports mi
    where mi.store_id = v_store_id;
    v_disponiveis := greatest(0, v_limite - v_usadas);
  end if;

  -- Elegíveis: publicados, visíveis para esta loja (a RLS filtra sozinha) e
  -- ainda sem produto vivo. Ordenados por lançamento para que, quando o teto
  -- cortar, sobrem os mais novos — que é o que melhor representa o acervo.
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
    limit v_disponiveis   -- NULL = sem limite
  ) elegiveis;

  if v_permitidos is null or cardinality(v_permitidos) = 0 then
    return jsonb_build_object(
      'ok', true, 'importados', 0, 'ja_tinha', v_ja_tinha,
      'bloqueados', greatest(0, cardinality(p_ids) - v_ja_tinha)
    );
  end if;

  -- Rastro primeiro: é onde o trigger de quota da 0025 age. Só para pares que
  -- ainda não têm linha — rastro órfão (produto excluído pelo lojista) é
  -- reaproveitado, e é isso que impede a vaga de ser cobrada duas vezes.
  insert into marketplace_imports (store_id, marketplace_product_id)
  select v_store_id, x
  from unnest(v_permitidos) x
  where not exists (
    select 1 from marketplace_imports mi
    where mi.store_id = v_store_id and mi.marketplace_product_id = x
  );

  -- COMANDOS SEPARADOS, e não um único CTE encadeado. A primeira versão fazia
  -- `with novos as (insert into products ... returning ...)` e inseria grade e
  -- fotos a partir desse CTE — e falhava com
  -- "new row violates row-level security policy for table product_photos".
  --
  -- O motivo: as policies de `product_sizes`/`product_photos` (migration 0003)
  -- validam a posse via `product_id in (select id from products where ...)`, e
  -- dentro de UM comando todas as partes enxergam o mesmo snapshot — as linhas
  -- de `products` criadas no mesmo comando ainda não existem para aquela
  -- subconsulta. Em comandos separados dentro da função, cada um enxerga o que o
  -- anterior gravou, e a checagem passa.
  --
  -- `security definer` resolveria contornando a RLS, mas é a solução errada:
  -- tiraria justamente a barreira que impede uma loja sem acesso de importar
  -- fora do preview.
  insert into products (
    store_id, name, brand, brand_other, sole, category,
    fulfillment, price, status, marketplace_product_id
  )
  select
    v_store_id, mp.name, mp.brand, mp.brand_other, mp.sole,
    coalesce(mp.category, 'Chuteira'),
    -- O pacote existe para quem vende por encomenda; quem tem pronta entrega
    -- ajusta produto a produto depois.
    'sob_encomenda',
    mp.suggested_price,
    -- Rascunho: publicar centenas de itens com preço não conferido é
    -- irreversível aos olhos do cliente final.
    'draft',
    mp.id
  from marketplace_products mp
  where mp.id = any(v_permitidos);

  get diagnostics v_importados = row_count;

  -- Grade do fornecedor, toda disponível: no modelo por encomenda "disponível"
  -- significa "o fornecedor tem essa numeração".
  --
  -- `::int` explícito: size_min/size_max são `smallint`, e `generate_series` tem
  -- sobrecargas para int/bigint/numeric — chamar com smallint é ambíguo e o
  -- Postgres recusa com "function generate_series(smallint, smallint) is not
  -- unique".
  insert into product_sizes (product_id, size, available)
  select p.id, t, true
  from products p
  join marketplace_products mp on mp.id = p.marketplace_product_id
  cross join lateral generate_series(mp.size_min::int, mp.size_max::int) as t
  where p.store_id = v_store_id
    and p.marketplace_product_id = any(v_permitidos);

  -- Sem cópia de arquivo: aponta para o bucket global e marca a origem, que é o
  -- que faz a vitrine montar a URL no bucket certo.
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

grant execute on function public.importar_marketplace_em_lote(uuid[]) to authenticated;
