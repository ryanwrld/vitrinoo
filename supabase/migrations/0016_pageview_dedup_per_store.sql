-- =============================================================================
-- 0016 — Deduplicação de visita ao GRID passa a ser por LOJA
-- =============================================================================
--
-- BUG CORRIGIDO
--
-- A migration 0010 criou o índice de deduplicação da visita ao grid como:
--
--   create unique index pageviews_dedup_grid_idx
--     on pageviews (visitor_id, view_date) where product_id is null;
--
-- Faltou `store_id`. Como a chave era global, um visitante que abrisse a
-- vitrine da loja A e depois a da loja B no MESMO dia colidia: a segunda
-- inserção violava o índice e voltava 23505. E `logPageview` trata 23505 como
-- sucesso silencioso (o que é correto para deduplicação de verdade), então a
-- visita da loja B era descartada sem erro em lugar nenhum.
--
-- Ou seja: a loja B perdia o visitante, e ninguém ficava sabendo. Modo de
-- falha pior possível — subcontagem silenciosa numa métrica que o revendedor
-- usa para decidir o que anunciar.
--
-- Não é hipotético neste produto: revendedores compartilham link nos mesmos
-- grupos de WhatsApp e nos mesmos nichos do Instagram, então cliente em comum
-- entre duas lojas é o caso normal, não a exceção. Reproduzido no projeto
-- principal com duas lojas reais antes desta correção.
--
-- O índice de visita a PRODUTO (`pageviews_dedup_product_idx`) NÃO tem o
-- problema e fica intocado: `product_id` já pertence a uma única loja, então
-- a chave (visitor_id, product_id, view_date) nunca cruza lojas. O mesmo vale
-- para `order_clicks_dedup_idx` (0014), cuja chave inclui `product_id`.
--
-- SEGURANÇA DA MIGRATION
--
-- Trocar a chave por uma MAIS ESPECÍFICA nunca pode falhar por dado
-- existente: toda linha única em (visitor_id, view_date) continua única em
-- (store_id, visitor_id, view_date). Não há DELETE, não há backfill, e
-- nenhuma linha já gravada muda. A partir daqui, visitas que antes eram
-- engolidas passam a ser gravadas — a contagem sobe, e o que subiu era
-- sempre real.
--
-- Nenhuma policy RLS muda: o WITH CHECK de `public_insert_pageviews` já
-- cruzava store_id/product_id e continua valendo igual.
-- =============================================================================

drop index if exists pageviews_dedup_grid_idx;

create unique index pageviews_dedup_grid_idx
  on pageviews (store_id, visitor_id, view_date)
  where product_id is null;

comment on index pageviews_dedup_grid_idx is
  'Dedup da visita ao grid: 1 por (loja, visitante, dia). O store_id é obrigatorio na chave — sem ele, o mesmo visitante em duas lojas no mesmo dia colidia e a segunda loja perdia a visita silenciosamente (corrigido na 0016).';
