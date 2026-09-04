-- Migration: a regra de preço da loja.
--
-- POR QUE EXISTE: até aqui, todo produto importado do marketplace nascia com
-- `suggested_price` — o preço que a CURADORIA achou justo, não o que o lojista cobra.
-- Publicar isso por engano é dinheiro perdido de verdade. A partir do fluxo de
-- precificação (Etapa 1: preço por solado; Etapa 2: adicional de lançamento), o produto
-- nasce com o preço do dono da loja e o `suggested_price` vira só um fallback.
--
-- A REGRA SOBREVIVE AO LOTE, de propósito: quem pega as 10 sorteadas e depois compra o
-- pacote passa pelo fluxo duas vezes. Na segunda ele reabre PRÉ-PREENCHIDO com o que
-- definiu antes — preço muda em seis meses, e obrigar a redigitar do zero é pior do que
-- mostrar o anterior para ele confirmar ou corrigir.

create table if not exists store_pricing (
  store_id uuid primary key references stores(id) on delete cascade,

  -- jsonb e não cinco linhas numa tabela filha: a lista de solados é regra de aplicação
  -- (`SOLES` em src/lib/products/constants.ts), e o schema deste projeto não enumera lista
  -- fixa em constraint (convenção de 0003). Guardado por SIGLA — {"FG":430,"SG":520,...} —
  -- que é o que sai direto no `p_precos->>mp.sole` do RPC de importação, sem o SQL
  -- precisar saber que a interface junta AG e MG num item só chamado "Multigramados".
  sole_prices jsonb not null default '{}'::jsonb,

  -- Quanto a mais por par de LANÇAMENTO (marketplace_products.is_lancamento).
  -- Zero é resposta válida: o lojista que não diferencia lançamento passa reto na etapa 2.
  launch_surcharge numeric(10,2) not null default 0,

  updated_at timestamptz not null default now()
);

alter table store_pricing enable row level security;

drop policy if exists "owner_full_access_store_pricing" on store_pricing;
create policy "owner_full_access_store_pricing" on store_pricing
  for all using (store_id in (select id from stores where owner_id = auth.uid()));

comment on table store_pricing is
  'Preço por solado e adicional de lançamento de cada loja. Vale para as PRÓXIMAS importações — produto já criado é do lojista e nunca é reescrito por mudança de regra.';

-- Arma e desarma o disparo automático do fluxo. Quando o acesso ao pacote é liberado
-- (`marketplace_access`), a próxima visita ao painel abre a precificação sozinha; concluir
-- grava este carimbo e o fluxo para de aparecer.
--
-- Fica em `stores`, ao lado de `marketplace_access_granted_at`, que é onde o ciclo de vida
-- do pacote já mora — e não em `store_pricing`, que é sobre preço, não sobre importação.
alter table stores add column if not exists pack_imported_at timestamptz;

comment on column stores.pack_imported_at is
  'Quando o lojista concluiu a precificação e importou o pacote inteiro. NULL + marketplace_access = o fluxo abre sozinho na próxima visita ao painel.';
