-- Migration: a importação em lote passa a receber o preço do LOJISTA.
--
-- A função da 0028 gravava `mp.suggested_price` — o preço da curadoria. Com o fluxo de
-- precificação, o produto tem que nascer já com o preço que o dono da loja digitou: nunca
-- deve existir uma janela em que ele tem centenas de rascunhos com um preço que não
-- escolheu, porque publicar um deles por engano é dinheiro perdido de verdade.
--
-- Assinatura NOVA em vez de `create or replace` da antiga: mudar a lista de parâmetros de
-- uma função existente exigiria `drop function` antes (o Postgres trata a assinatura como
-- parte da identidade), e derrubar a função de importação enquanto alguém importa é o tipo
-- de janela que não vale economizar. A de um argumento é removida no fim, quando nada mais
-- a chama.
--
-- Todo o resto é idêntico à 0028 e pelos mesmos motivos, que continuam valendo:
--   * transação única — ou as 990 entram, ou nenhuma entra;
--   * `security invoker` — a RLS continua sendo quem decide o alcance de cada loja;
--   * rastro em `marketplace_imports` ANTES do produto — é onde o trigger de quota da 0025
--     age, e inverter deixaria produto criado sem rastro;
--   * comandos separados, nunca um CTE encadeado — as policies de product_sizes/photos
--     validam posse contra `products`, e dentro de UM comando as linhas recém-inseridas
--     ainda não existem para aquela subconsulta.

create or replace function public.importar_marketplace_em_lote(
  p_ids       uuid[],
  p_precos    jsonb,
  p_adicional numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
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
    -- Rascunho mesmo com o preço certo: são centenas de produtos entrando de uma vez, e
    -- deixar o lojista escolher a hora de aparecer na vitrine continua sendo o certo.
    'draft',
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

-- A de um argumento sai agora que a nova está no lugar: manter as duas deixaria vivo um
-- caminho que grava o preço da curadoria, que é exatamente o que esta migration existe
-- para fechar.
drop function if exists public.importar_marketplace_em_lote(uuid[]);
