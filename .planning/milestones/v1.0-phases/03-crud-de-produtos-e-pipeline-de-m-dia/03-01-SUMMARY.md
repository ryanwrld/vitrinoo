---
phase: 03-crud-de-produtos-e-pipeline-de-m-dia
plan: 01
subsystem: database
tags: [postgres, supabase, rls, migrations, storage, multi-tenant]

# Dependency graph
requires:
  - phase: 01-cadastro-login-onboarding
    provides: "tabela stores + padrão RLS na mesma migration (0001_init_stores_rls.sql), getOwnedStore()"
provides:
  - "Tabelas products, product_sizes, product_photos com RLS habilitada"
  - "Bucket de Storage product-images público com policies owner-scoped"
  - "Tipos TypeScript regenerados (database.types.ts) refletindo o schema vivo"
  - "Teste de isolamento RLS multi-tenant provado para as três novas tabelas"
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 04-vitrine-publica]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RLS habilitada na MESMA migration que cria a tabela, para toda tabela (inclusive filhas), nunca separado"
    - "Disponibilidade agregada de produto derivada via EXISTS em product_sizes (sem coluna extra em products)"
    - "Bucket público + path {owner_id}/{product_id}/{uuid}.{ext} com policy foldername[1]=auth.uid()::text"

key-files:
  created:
    - supabase/migrations/0003_products_schema_rls.sql
    - tests/rls/product-isolation.test.ts
    - .planning/phases/03-crud-de-produtos-e-pipeline-de-m-dia/deferred-items.md
  modified:
    - src/lib/database.types.ts

key-decisions:
  - "brand/sole/category/fulfillment ficam text nullable sem check constraint de enumeração (validação só na camada de aplicação, Plan 03-02) — evita migration de correção se a lista mudar"
  - "Atalho 'esgotar produto inteiro' (D-04) não tem coluna dedicada: é um UPDATE em lote de product_sizes, e a vitrine deriva disponibilidade via EXISTS"

requirements-completed: [PROD-01, PROD-02]

coverage:
  - id: D1
    description: "Tabelas products, product_sizes e product_photos existem no Postgres remoto com RLS habilitada por tabela"
    requirement: PROD-01
    verification:
      - kind: integration
        ref: "tests/rls/product-isolation.test.ts (7 testes, cross-tenant SELECT/UPDATE/DELETE)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Isolamento multi-tenant provado com duas contas reais nas três tabelas (leitura e escrita)"
    requirement: PROD-02
    verification:
      - kind: integration
        ref: "npx vitest run tests/rls/product-isolation.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bucket product-images criado, público, com 4 policies de storage.objects owner-scoped"
    verification:
      - kind: other
        ref: "grep em supabase/migrations/0003_products_schema_rls.sql confirmando insert into storage.buckets + 4 create policy"
        status: pass
    human_judgment: false
  - id: D4
    description: "database.types.ts regenerado contra o schema vivo (não editado manualmente) após supabase db push"
    verification:
      - kind: other
        ref: "supabase migration list confirmando 0003 aplicado remoto (local=0003, remote=0003); npx tsc --noEmit sem novos erros"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-13
status: complete
---

# Phase 3 Plan 1: Schema de Produtos + RLS + Bucket de Fotos Summary

**Migration 0003 com três tabelas relacionais (products/product_sizes/product_photos), RLS por tabela, bucket product-images público aplicados ao Postgres remoto do Supabase, com isolamento multi-tenant provado por 7 testes de integração reais.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-13T23:30:00Z
- **Completed:** 2026-07-13T23:55:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 criados, 1 modificado)

## Accomplishments
- Migration `0003_products_schema_rls.sql` criada seguindo literalmente o padrão de `0001_init_stores_rls.sql`: `create table` → `enable row level security` → `create policy` por tabela, sem exceção
- Migration aplicada com sucesso ao projeto Supabase remoto (`supabase db push`), confirmada via `supabase migration list` (local=0003, remote=0003)
- `src/lib/database.types.ts` regenerado via `supabase gen types typescript --linked`, refletindo `products`, `product_sizes` e `product_photos` do schema vivo
- Bucket de Storage `product-images` criado (público) com 4 policies (insert/select/update/delete) escopadas por `foldername[1] = auth.uid()::text`
- Teste de isolamento RLS (`tests/rls/product-isolation.test.ts`) com 7 asserts cobrindo SELECT/UPDATE/DELETE cross-tenant nas três tabelas — todos verdes
- Suíte completa de testes (85 testes, 20 arquivos) permanece verde após as mudanças

## Task Commits

Each task was committed atomically:

1. **Task 1: Escrever a migration 0003 (três tabelas + RLS + bucket product-images)** - `4985c9d` (feat)
2. **Task 2: [BLOCKING] Aplicar o schema ao Supabase + regenerar tipos** - `365e908` (feat)
3. **Task 3: Teste de isolamento RLS das três novas tabelas** - `bc4380d` (test)

**Plan metadata:** (pending — final docs commit)

## Files Created/Modified
- `supabase/migrations/0003_products_schema_rls.sql` - três tabelas relacionais + RLS por tabela + bucket product-images com 4 policies de storage
- `src/lib/database.types.ts` - regenerado contra o schema vivo, agora inclui `products`/`product_sizes`/`product_photos`
- `tests/rls/product-isolation.test.ts` - 7 testes de isolamento multi-tenant (seed de 2 contas reais, cross-tenant SELECT/UPDATE/DELETE)
- `.planning/phases/03-crud-de-produtos-e-pipeline-de-m-dia/deferred-items.md` - registra erro de tsc pré-existente fora de escopo (ver Deviations)

## Decisions Made
- `brand` é `not null` (lista fixa + "Outra", D-05), mas `sole`/`category`/`fulfillment` ficam `text` nullable sem `check constraint` de enumeração — a validação dessas listas fixas vive na camada de aplicação (Zod + constants.ts, Plan 03-02), evitando que uma mudança futura na lista exija migration de correção. `status` é a única outra coluna com `check` porque é o portão consumido sem bypass pela Fase 4 (`status = 'published'`).
- Resolução da ambiguidade D-04 (atalho "esgotar produto inteiro"): implementado como `UPDATE product_sizes SET available = false WHERE product_id = $1` em lote — nenhuma coluna extra de disponibilidade agregada em `products`. A vitrine (Fase 4) deriva disponibilidade via `EXISTS (SELECT 1 FROM product_sizes WHERE product_id = $1 AND available = true)`, o que também cobre de graça o rascunho sem tamanhos (D-10).
- Bucket `product-images` segue exatamente o padrão de `store-assets` (0001): público, path `{owner_id}/{product_id}/{uuid}.{ext}`, policy `foldername[1] = auth.uid()::text` — leitura pública funciona via URL direta (bypass de RLS para buckets públicos), escrita continua owner-scoped.

## Deviations from Plan

### Out-of-Scope Discovery (não corrigido, documentado)

**1. [Fora de escopo] Erro pré-existente de `tsc --noEmit` em `tests/supabase/server-cookies.test.ts`**
- **Found during:** Task 2 (verificação `npx tsc --noEmit`)
- **Issue:** Duas ocorrências de `TS2352` (conversão de tipo de `SupabaseClient` para um shape de mock) nas linhas 23 e 42 de `tests/supabase/server-cookies.test.ts`.
- **Confirmação:** `git stash` antes da mudança de `database.types.ts` reproduziu o mesmo erro — não foi causado pela migration 0003 nem pelo regenerate de tipos desta plan.
- **Ação:** Não corrigido (fora do escopo de `files_modified` desta plan — arquivo não listado). Registrado em `.planning/phases/03-crud-de-produtos-e-pipeline-de-m-dia/deferred-items.md` para investigação futura.
- **Impacto:** Nenhum — `grep -q "product_sizes"`/`"product_photos"` passam, e nenhum novo erro de `tsc` foi introduzido pelas mudanças desta plan.

---

**Total deviations:** 1 item adiado (fora de escopo, não é um auto-fix)
**Impact on plan:** Nenhum impacto na entrega desta plan — o critério de verificação da Task 2 (tabelas presentes nos tipos + sem novos erros de tsc) foi integralmente satisfeito.

## Issues Encountered
- `supabase db push` emitiu um warning de Docker ("failed to cache migrations catalog... Cannot connect to the Docker daemon") — não bloqueante, é só o cache local de catálogo do pg-delta para desenvolvimento local; a migration foi aplicada ao banco remoto normalmente, confirmado por `supabase migration list`.

## User Setup Required

None - nenhuma configuração externa manual necessária. O push da migration e o typegen já foram executados nesta sessão contra o projeto Supabase remoto real (`yuyprdjzeslanxbgcemj` / VITRINOO).

## Next Phase Readiness
- Fundação de dados completa: as três tabelas + bucket estão prontos para os Server Actions de CRUD (Plan 03-02) e pipeline de upload/reordenação de fotos (Plans 03-03/03-04).
- `src/lib/database.types.ts` já reflete o schema vivo — nenhum bloqueio de tipos para o próximo plan.
- Nenhum blocker identificado para 03-02.

---
*Phase: 03-crud-de-produtos-e-pipeline-de-m-dia*
*Completed: 2026-07-13*

## Self-Check: PASSED

- FOUND: supabase/migrations/0003_products_schema_rls.sql
- FOUND: src/lib/database.types.ts
- FOUND: tests/rls/product-isolation.test.ts
- FOUND: .planning/phases/03-crud-de-produtos-e-pipeline-de-m-dia/deferred-items.md
- FOUND: commit 4985c9d (Task 1)
- FOUND: commit 365e908 (Task 2)
- FOUND: commit bc4380d (Task 3)
