-- Migration: preço promocional por produto (gatilho de conversão na vitrine
-- pública — "de/por" com selo de desconto).
--
-- `numeric(10,2) null` (mesma precisão de `price`), sem `check` de relação
-- promotional_price < price no banco: a mesma convenção já documentada em
-- 0003_products_schema_rls.sql (regras de negócio validadas na camada de
-- aplicação, nunca em constraint de schema) — `parseBRLPrice` +
-- `updateProductPromotionalPrice`/`parseProductFormData` são a fronteira
-- real de validação (Server Action), não o Postgres.
alter table products add column promotional_price numeric(10,2);
