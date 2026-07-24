---
phase: 02-link-compartilh-vel-da-vitrine
plan: 03
subsystem: settings
tags: [supabase, security-definer, rpc, rls, zod, server-actions]

requires:
  - phase: 02-link-compartilh-vel-da-vitrine
    provides: "slugSchema (validação D-02) do plan 02-02, consumido por checkSlugAvailability e updateStoreSlug"
provides:
  - "RPC public.is_slug_available (SECURITY DEFINER, boolean-only) — única forma correta de checar unicidade de slug cross-tenant sob RLS"
  - "src/lib/settings/actions.ts: checkSlugAvailability, updateStoreSlug, saveStoreSettings"
  - "src/lib/database.types.ts regenerado incluindo a função no schema public"
affects: ["02-05 (editor de slug consome checkSlugAvailability/updateStoreSlug)", "02-04 (formulário de configurações consome saveStoreSettings)"]

tech-stack:
  added: []
  patterns:
    - "RPC SECURITY DEFINER estreito (retorna só boolean via NOT EXISTS) como exceção explícita e auditável a uma RLS restritiva, nunca afrouxando a policy em si"
    - "search_path fixado (public, pg_temp) em toda função SECURITY DEFINER — mitigação padrão contra hijack de search_path"
    - "getOwnedStore(): helper privado compartilhado para o trio getUser() -> stores.owner_id -> store.id, evitando triplicar o mesmo bloco nas 3 Server Actions"
    - "tradução de erro Postgres 23505 -> mensagem amigável em português no Server Action, nunca vazando o erro cru do banco"

key-files:
  created:
    - supabase/migrations/0002_slug_availability_rpc.sql
    - src/lib/settings/actions.ts
    - tests/settings/slug-availability.test.ts
    - tests/settings/update-slug.test.ts
    - tests/settings/store-settings-update.test.ts
  modified:
    - src/lib/database.types.ts

key-decisions:
  - "Migration aplicada ao projeto Supabase remoto real (VITRINOO, ref yuyprdjzeslanxbgcemj) via npx supabase db push, com SUPABASE_ACCESS_TOKEN fornecido pelo usuário durante a execução — confirmado explicitamente pelo usuário antes do push (ação em banco ao vivo)"
  - "Lógica de validação de logo (magic bytes) duplicada em src/lib/settings/actions.ts em vez de importada de src/lib/onboarding/actions.ts, porque validateLogoFile não é exportada e este plano não lista src/lib/onboarding/actions.ts em files_modified — evita expandir o escopo de arquivos tocados"
  - "getOwnedStore() extraído como helper privado (não estava no pattern map literal, que mostra o bloco repetido 3x) para não triplicar o mesmo código nas 3 actions — comportamento idêntico ao padrão"

patterns-established:
  - "Toda futura RPC que precise contornar RLS para uma checagem estreita e pública (boolean/contagem) deve seguir o mesmo molde: SECURITY DEFINER + search_path fixado + grant explícito só ao role necessário + corpo que nunca expõe colunas de linha"

requirements-completed: [LOJA-02]

coverage:
  - id: D1
    description: "RPC is_slug_available contorna RLS apenas para responder um boolean, nunca expõe dados de linha de outro tenant (T-02-03)"
    requirement: "LOJA-02"
    verification:
      - kind: integration
        ref: "tests/settings/slug-availability.test.ts#retorna available=false para um slug já ocupado por OUTRO tenant"
        status: pass
    human_judgment: false
  - id: D2
    description: "checkSlugAvailability revalida formato (slugSchema) e retorna available=false com mensagem para slug fora do padrão D-02"
    requirement: "LOJA-02"
    verification:
      - kind: integration
        ref: "tests/settings/slug-availability.test.ts#retorna available=false com mensagem de formato inválido para um slug fora do padrão D-02"
        status: pass
    human_judgment: false
  - id: D3
    description: "updateStoreSlug traduz o 23505 (unique_violation) na mensagem exata 'Este link já está em uso. Escolha outro.' (T-02-05, rede de segurança TOCTOU)"
    requirement: "LOJA-02"
    verification:
      - kind: integration
        ref: "tests/settings/update-slug.test.ts#retorna 'Este link já está em uso. Escolha outro.' quando o slug pertence a OUTRO tenant"
        status: pass
    human_judgment: false
  - id: D4
    description: "updateStoreSlug salva com sucesso um slug novo e não utilizado, escopado por owner_id"
    requirement: "LOJA-02"
    verification:
      - kind: integration
        ref: "tests/settings/update-slug.test.ts#salva com sucesso um slug novo e não utilizado"
        status: pass
    human_judgment: false
  - id: D5
    description: "saveStoreSettings persiste edições (name/accent_color/tagline/whatsapp_e164/message_template) escopadas por owner_id e mantém onboarding_completed_at intacto, sem redirect"
    requirement: "LOJA-02"
    verification:
      - kind: integration
        ref: "tests/settings/store-settings-update.test.ts#salva edições de name/accentColor/tagline/whatsapp/messageTemplate mantendo onboarding_completed_at intacto"
        status: pass
    human_judgment: false
  - id: D6
    description: "Migration pushada para o projeto Supabase remoto real e src/lib/database.types.ts regenerado com is_slug_available sob Functions"
    requirement: "LOJA-02"
    verification:
      - kind: unit
        ref: "grep is_slug_available src/lib/database.types.ts + npx tsc --noEmit"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-07-12
status: complete
---

# Phase 2 Plan 3: RPC de Unicidade de Slug + Server Actions de Configurações Summary

**RPC `is_slug_available` (SECURITY DEFINER, boolean-only, search_path fixado) aplicada no Supabase remoto contorna a RLS de `stores` só para checagem de unicidade cross-tenant, mais os três Server Actions de `/configuracoes` (checkSlugAvailability, updateStoreSlug, saveStoreSettings) — 8/8 testes de integração verdes contra o projeto real, incluindo a regressão cross-tenant crítica.**

## Performance

- **Duration:** ~50 min (incluindo o tempo de bloqueio aguardando o `SUPABASE_ACCESS_TOKEN` do usuário)
- **Started:** 2026-07-12T21:22:20Z
- **Completed:** 2026-07-12T22:12:32Z
- **Tasks:** 3
- **Files modified:** 6 (2 criados em `src/lib`/`supabase/migrations`, 3 testes novos, 1 arquivo regenerado)

## Accomplishments
- `supabase/migrations/0002_slug_availability_rpc.sql`: função `is_slug_available(candidate_slug text) returns boolean`, `SECURITY DEFINER`, `search_path` fixado (`public, pg_temp`), grant restrito a `authenticated` — nenhuma policy RLS existente foi enfraquecida
- Migration aplicada ao projeto Supabase remoto real (VITRINOO) via `npx supabase db push`, com confirmação explícita do usuário antes da operação em banco ao vivo
- `src/lib/database.types.ts` regenerado via `npx supabase gen types typescript --linked` — agora inclui `is_slug_available` sob `public.Functions`
- `src/lib/settings/actions.ts`: três Server Actions (`checkSlugAvailability`, `updateStoreSlug`, `saveStoreSettings`) seguindo o padrão "getUser() → localizar loja por owner_id → operar por store.id" de `saveOnboarding`
- Regressão cross-tenant crítica provada: `checkSlugAvailability` retorna `available: false` para um slug pertencente a outro revendedor, mesmo sob a RLS restritiva de `stores`
- Caminho de rede de segurança contra corrida (TOCTOU) provado: `updateStoreSlug` traduz o erro Postgres `23505` na mensagem exata do Copywriting Contract, nunca vazando o erro cru do banco

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Migration — RPC is_slug_available (SECURITY DEFINER)** - `5838e51` (feat)
2. **[BLOCKING] Push do schema remoto + regeneração de tipos** - `96ac1da` (feat) — precedido por `545061d` (docs: registro do bloqueio de auth no STATE.md, resolvido depois que o usuário forneceu o `SUPABASE_ACCESS_TOKEN`)
3. **Task 3: Settings Server Actions + testes de integração** - `0c1736d` (test, RED) → `d9b7028` (feat, GREEN)

**Plan metadata:** (commit a seguir, docs)

## Files Created/Modified
- `supabase/migrations/0002_slug_availability_rpc.sql` - função RPC `is_slug_available`, SECURITY DEFINER, boolean-only
- `src/lib/settings/actions.ts` - `checkSlugAvailability`, `updateStoreSlug`, `saveStoreSettings`
- `src/lib/database.types.ts` - regenerado com `is_slug_available` sob `public.Functions`
- `tests/settings/slug-availability.test.ts`, `tests/settings/update-slug.test.ts`, `tests/settings/store-settings-update.test.ts` - 8 testes de integração contra o projeto Supabase remoto real

## Decisions Made
- Push da migration ao banco remoto só rodou depois de confirmação explícita do usuário ("pode!") — tratado como ação consequente em produção, não como parte automática do fluxo
- Lógica de validação de logo (magic bytes) duplicada em `settings/actions.ts` em vez de importar de `onboarding/actions.ts` (função não exportada lá, e esse arquivo está fora do `files_modified` deste plano) — mantém o escopo do plano restrito aos arquivos declarados
- `getOwnedStore()` extraído como helper privado para as 3 actions compartilharem o trio "getUser → store por owner_id", em vez de triplicar o bloco — comportamento idêntico ao padrão, só reduz duplicação

## Deviations from Plan

None - plano executado exatamente como escrito, incluindo o gate de autenticação previsto no próprio `02-03-PLAN.md` (Task 2 é `[BLOCKING]` e o plano já antecipava a possibilidade de precisar de `SUPABASE_ACCESS_TOKEN` ou intervenção manual).

## Issues Encountered

**Gate de autenticação (fluxo normal, não uma falha):** a Task 2 (`supabase db push`) exigia autenticação que não estava disponível no ambiente (sem `SUPABASE_ACCESS_TOKEN`, sem sessão de `supabase login` interativa). Segui o protocolo de auth gate: parei a execução, documentei o bloqueio em `STATE.md` (`docs(02-03): registra bloqueio...`, commit `545061d`), e retomei assim que o usuário gerou e configurou o token no `.env.local`. Nenhuma tentativa de contornar a autenticação foi feita.

Nenhum outro problema. Os 8 testes de integração (que rodam contra o projeto Supabase remoto real, sem mocks de banco) passaram após a primeira implementação GREEN.

## User Setup Required

**Já resolvido nesta sessão** — o usuário gerou um `SUPABASE_ACCESS_TOKEN` (Supabase Dashboard → Account → Access Tokens) e adicionou ao `.env.local`. Nenhuma ação adicional pendente.

## Next Phase Readiness

- Plan 02-04 (formulário de configurações) pode chamar `saveStoreSettings` diretamente
- Plan 02-05 (editor de slug) pode chamar `checkSlugAvailability` (debounced) e `updateStoreSlug` (com confirmação) diretamente
- Nenhum bloqueio identificado

---
*Phase: 02-link-compartilh-vel-da-vitrine*
*Completed: 2026-07-12*

## Self-Check: PASSED
