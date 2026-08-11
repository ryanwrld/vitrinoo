-- Migration: preserva histórico de métricas quando um produto é excluído
-- (achado do check de lógica de negócio, 2026-08-11).
--
-- PROBLEMA: `order_clicks.product_id` e `pageviews.product_id` referenciavam
-- `products(id) on delete cascade`. Excluir um produto — rotina normal num
-- catálogo de chuteiras importadas, onde modelo sai de linha e o anúncio é
-- recriado do zero com frequência — apagava SILENCIOSAMENTE todo o
-- histórico de cliques/visualizações daquele produto, inclusive eventos de
-- dias/semanas atrás, sem nenhum aviso na tela de confirmação.
--
-- Isso corrompia retroativamente agregados por LOJA INTEIRA que não deveriam
-- depender da existência contínua de nenhum produto específico. O pior caso
-- é `querySizeDemand` ("Tamanhos mais pedidos", src/lib/dashboard/metrics.ts):
-- o sinal "o 42 sempre falta" perdia pedaços toda vez que o revendedor fazia
-- limpeza de catálogo — exatamente quando esse dado seria mais útil pra
-- decidir a próxima importação.
--
-- DECISÃO: trocar `on delete cascade` por `on delete set null` nas duas FKs
-- de produto. A LINHA do evento sobrevive à exclusão (size, created_at,
-- store_id, visitor_id continuam intactos) — só o vínculo com um produto que
-- não existe mais é desfeito. `product_id` passa a ser NULLABLE em
-- `order_clicks` (já era em `pageviews`, onde NULL sempre teve outro
-- significado — acesso ao grid, D-01/0006). Os dois significados de NULL
-- (grid vs. produto excluído) passam a coexistir na mesma coluna de
-- `pageviews` sem conflito: nenhuma métrica hoje distingue os dois, e ambos
-- já eram corretamente tratados como "sem produto específico associado".
--
-- ESCOPO DELIBERADAMENTE LIMITADO: `store_id` em order_clicks/pageviews
-- CONTINUA `on delete cascade`, sem alteração — a exclusão de uma LOJA
-- INTEIRA (fluxo de exclusão de conta, src/lib/account/actions.ts) precisa
-- continuar apagando 100% dos dados daquele tenant, sem deixar nenhuma
-- linha órfã fora dele. Esta migration relaxa só a FK de PRODUTO.
--
-- SEGURANÇA (verificado antes de aplicar, não é suposição): a policy
-- `public_insert_order_clicks` (migration 0005) exige
-- `product_id in (select id from products where store_id = ... and
-- status = 'published')`. Uma tentativa de INSERT com `product_id` NULL —
-- por exemplo um agente malicioso chamando a REST do Supabase direto,
-- contornando `logOrderClick`, já que a anon key é pública no bundle do
-- cliente — falha esse WITH CHECK, porque `NULL IN (...)` nunca avalia como
-- verdadeiro no Postgres (é a mesma lógica que já protegia a policy de
-- `pageviews`, que sempre teve `product_id` nullable). Tornar a coluna
-- NULLABLE no schema NÃO abre nenhuma via de escrita nova para o papel
-- `anon`: um NULL em `order_clicks.product_id` só pode nascer da própria
-- ação ON DELETE SET NULL do banco, nunca de um INSERT arbitrário.

-- =============================================================================
-- 1. order_clicks.product_id passa a aceitar NULL
-- =============================================================================
alter table order_clicks alter column product_id drop not null;

-- =============================================================================
-- 2. Troca das duas FKs de produto: CASCADE -> SET NULL
-- =============================================================================
alter table order_clicks
  drop constraint order_clicks_product_id_fkey,
  add constraint order_clicks_product_id_fkey
    foreign key (product_id) references products(id) on delete set null;

alter table pageviews
  drop constraint pageviews_product_id_fkey,
  add constraint pageviews_product_id_fkey
    foreign key (product_id) references products(id) on delete set null;

-- =============================================================================
-- 3. `product_order_click_counts` precisa do MESMO filtro que
--    `product_pageview_counts` já tinha desde a 0006 (`where product_id is
--    not null`). Sem isso, cliques órfãos (produto excluído) formariam um
--    grupo `product_id = NULL` dentro da própria view — e como a view é
--    ordenada/limitada a Top-10 por quem a consome (`queryTopOrderClickProducts`,
--    metrics.ts), um produto MUITO clicado antes de ser excluído poderia
--    ocupar uma vaga do ranking com um `product_id` que não resolve a
--    nome nenhum, empurrando um produto ainda existente pra fora do Top-10.
--    `product_pageview_counts` já filtrava porque, para ELA, NULL sempre
--    teve outro significado (grid) que nunca deveria entrar num ranking POR
--    produto; agora as duas views compartilham a mesma regra pelo mesmo
--    motivo de fundo: ranking por produto nunca lista um produto inexistente.
-- =============================================================================
create or replace view product_order_click_counts
  with (security_invoker = true) as
select store_id, product_id, count(*) as clicks
from order_clicks
where product_id is not null
group by store_id, product_id;

comment on column order_clicks.product_id is
  'Produto do clique. NULL = produto excluído pelo revendedor após o clique (ON DELETE SET NULL, migration 0021) — a linha permanece para não corromper agregados por loja (ex.: tamanhos mais pedidos), mas some de qualquer ranking/lista POR PRODUTO.';

comment on column pageviews.product_id is
  'NULL tem dois significados: (a) acesso ao grid principal da vitrine (D-01, original da 0006), ou (b) visualização de um produto excluído depois do acesso (ON DELETE SET NULL, migration 0021). Nenhuma métrica distingue os dois — ambos já eram tratados como "sem produto específico associado".';
