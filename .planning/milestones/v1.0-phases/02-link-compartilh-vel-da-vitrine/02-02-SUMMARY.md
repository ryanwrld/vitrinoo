---
phase: 02-link-compartilh-vel-da-vitrine
plan: 02
subsystem: slug
tags: [zod, unicode-nfd, react-hooks, tdd]

requires:
  - phase: 01-fundacao-do-produto
    provides: "generateStoreSlug (algoritmo original, sem fold de acento) em src/lib/auth/actions.ts, e a convenção de schema Zod de src/lib/validation/onboarding.ts"
provides:
  - "slugify() com fold de diacríticos NFD — fonte única de normalização de slug do projeto"
  - "slugSchema (Zod) validando formato de slug (D-02: 3-30 chars, [a-z0-9-], sem hífen nas pontas)"
  - "buildStoreUrl() para compor a URL pública da vitrine"
  - "useDebouncedValue — primeiro hook de debounce do codebase"
affects: ["02-03 (RPC de unicidade de slug)", "02-05 (editor de slug com useDebouncedValue + slugSchema)"]

tech-stack:
  added: []
  patterns:
    - "Unicode NFD normalize + strip do bloco de marcas combinantes ANTES do replace não-alfanumérico->hífen (ordem obrigatória para D-01 'sem acento')"
    - "slug schema: regex nomeada + .trim() + mensagem em português + tipo inferido exportado (mesma convenção de src/lib/validation/onboarding.ts)"
    - "hook de debounce: useState + useEffect + setTimeout, client-only"

key-files:
  created:
    - src/lib/slug/slugify.ts
    - src/lib/slug/validation.ts
    - src/lib/slug/store-url.ts
    - src/lib/hooks/use-debounce.ts
    - tests/slug/slugify.test.ts
    - tests/slug/validation.test.ts
    - tests/slug/store-url.test.ts
  modified:
    - src/lib/auth/actions.ts

key-decisions:
  - "generateStoreSlug passou a delegar para slugify() compartilhado — elimina o segundo algoritmo divergente que 02-CONTEXT.md proibia explicitamente"
  - "buildStoreUrl usa https://vitrinoo.app como origin padrão hardcoded (não há deploy/remote ainda — ver memória do projeto) até NEXT_PUBLIC_SITE_URL ser configurado"

patterns-established:
  - "Pattern de slug compartilhado: qualquer normalização/validação/URL de slug futura (editor de slug do plan 02-05, RPC do plan 02-03) importa de src/lib/slug/*, nunca reimplementa"

requirements-completed: [LOJA-02]

coverage:
  - id: D1
    description: "slugify() folda diacríticos (D-01 'sem acento'), colapsa/trima hífens, lowercase"
    requirement: "LOJA-02"
    verification:
      - kind: unit
        ref: "tests/slug/slugify.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "slugSchema (Zod) valida formato de slug — 3-30 chars, charset [a-z0-9-], sem hífen nas pontas, copy exata do UI-SPEC"
    requirement: "LOJA-02"
    verification:
      - kind: unit
        ref: "tests/slug/validation.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildStoreUrl compõe a URL pública da vitrine (base + /loja/<slug>), sem barra dupla"
    requirement: "LOJA-02"
    verification:
      - kind: unit
        ref: "tests/slug/store-url.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "useDebouncedValue disponível para o editor de slug (plan 02-05) — hook client-only, sem teste unitário direto (comportamento de runtime React, exercitado no consumidor futuro)"
    verification: []
    human_judgment: true
    rationale: "Hook de debounce com useEffect/setTimeout não tem asserção unitária direta neste plano por design (o próprio plano define que ele 'é exercitado pelo editor de slug no plan 02-05 e pelo runtime React, não testado unitariamente aqui'); typecheck (tsc --noEmit) passou como prova indireta de forma/tipos."
  - id: D5
    description: "generateStoreSlug (src/lib/auth/actions.ts) refatorado para usar slugify() compartilhado, sem regressão no cadastro"
    verification:
      - kind: integration
        ref: "tests/auth/signup.test.ts"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-07-12
status: complete
---

# Phase 2 Plan 2: Fundação de Slug (slugify, validação, URL pública, debounce) Summary

**slugify() com fold de diacríticos Unicode NFD substitui o algoritmo de generateStoreSlug que quebrava "café" em "caf-", mais slugSchema (Zod, D-02), buildStoreUrl e o primeiro hook useDebouncedValue do projeto — tudo test-first.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-12T21:08:00Z (aprox., logo após o commit final do plan 02-01)
- **Completed:** 2026-07-12T21:14:37Z
- **Tasks:** 3
- **Files modified:** 8 (4 criados em `src/lib`, 3 testes novos, 1 arquivo existente refatorado)

## Accomplishments
- `slugify()` corrige o bug documentado no 02-RESEARCH.md (Pitfall 2): "café" agora vira "cafe" (fold NFD antes do replace não-alfanumérico), não mais "caf-"
- `generateStoreSlug` em `src/lib/auth/actions.ts` agora delega para o `slugify()` compartilhado — projeto não tem mais dois algoritmos de slug divergentes
- `slugSchema` (Zod) aplica os limites de D-02 (3-30 caracteres, charset `[a-z0-9-]`, sem hífen nas pontas) com a copy exata do Copywriting Contract do 02-UI-SPEC.md
- `buildStoreUrl()` e `useDebouncedValue()` prontos para os planos 02-03 (RPC de unicidade) e 02-05 (editor de slug)

## Task Commits

Cada task foi commitada atomicamente, seguindo o ciclo RED → GREEN (TDD):

1. **Task 1: slugify() + fold de diacríticos + refactor de generateStoreSlug**
   - `639f657` test: teste falho de slugify (RED)
   - `132943f` feat: implementação de slugify() + refactor de generateStoreSlug (GREEN)
2. **Task 2: slugSchema (D-02)**
   - `90d75e1` test: teste falho de validação de slug (RED)
   - `e71f64e` feat: implementação de slugSchema (GREEN)
3. **Task 3: buildStoreUrl + useDebouncedValue**
   - `6ae7ddf` test: teste falho de buildStoreUrl (RED)
   - `6cee038` feat: implementação de buildStoreUrl + useDebouncedValue (GREEN)

**Plan metadata:** (commit a seguir, docs)

_Nota: cada task deste plano seguiu o ciclo test → feat (RED → GREEN); nenhuma precisou de um commit de refactor separado._

## Files Created/Modified
- `src/lib/slug/slugify.ts` - `slugify(input): string`, fold NFD de diacríticos antes do replace não-alfanumérico
- `src/lib/slug/validation.ts` - `slugSchema` (Zod) + `type SlugInput`
- `src/lib/slug/store-url.ts` - `buildStoreUrl(slug): string`, usa `NEXT_PUBLIC_SITE_URL` com fallback para `https://vitrinoo.app`
- `src/lib/hooks/use-debounce.ts` - `useDebouncedValue<T>(value, delayMs): T`, primeiro hook de debounce do projeto
- `src/lib/auth/actions.ts` - `generateStoreSlug` refatorado para chamar `slugify()` compartilhado (regex inline removida)
- `tests/slug/slugify.test.ts`, `tests/slug/validation.test.ts`, `tests/slug/store-url.test.ts` - cobertura unitária das 3 tasks

## Decisions Made
- `generateStoreSlug` delega 100% para `slugify()` — nenhuma lógica de normalização duplicada permanece em `src/lib/auth/actions.ts` (mitiga T-02-02 do threat_model do plano)
- `buildStoreUrl` usa o literal `https://vitrinoo.app` como origin padrão (não há deploy/remote configurado ainda — ver memória do projeto `project_no_github_remote`); `NEXT_PUBLIC_SITE_URL` é opcional e sobrescreve quando o app for hospedado

## Deviations from Plan

None - plano executado exatamente como escrito.

### Nota sobre convenção de commit (não é um deviation de código)

As mensagens de commit deste plano foram escritas em inglês, mas a memória do projeto (`feedback_portugues`) pede português em docs e commits. Este SUMMARY e os commits de documentação finais estão em português; os 6 commits de task já feitos não foram reescritos (repositório é local, sem remote — ver memória `project_no_github_remote` — mas amend/rewrite de commits já feitos está fora do escopo padrão de deviation). Sinalizado aqui para consciência do usuário; próximos planos devem seguir a convenção em português desde o primeiro commit.

## Issues Encountered

Nenhum. Os testes `tests/slug/*` e a regressão `tests/auth/signup.test.ts` (que roda contra o projeto Supabase remoto real, sem mocks) passaram de primeira após cada implementação GREEN.

Um issue pré-existente, fora do escopo deste plano, foi encontrado em `npx tsc --noEmit` (2 erros `TS2352` em `tests/supabase/server-cookies.test.ts`, não relacionados a nenhum arquivo tocado aqui) — registrado em `.planning/phases/02-link-compartilh-vel-da-vitrine/deferred-items.md`, não corrigido (fora de escopo).

## User Setup Required

None - `NEXT_PUBLIC_SITE_URL` é opcional (ver `user_setup` do 02-02-PLAN.md); `buildStoreUrl` funciona com o fallback padrão enquanto o app não estiver hospedado.

## Next Phase Readiness

- Plans 02-03 (RPC de unicidade de slug) e 02-05 (editor de slug) podem importar `slugify`, `slugSchema`, `buildStoreUrl` e `useDebouncedValue` diretamente de `src/lib/slug/*` e `src/lib/hooks/use-debounce.ts` sem reimplementar nada
- Nenhum bloqueio identificado

---
*Phase: 02-link-compartilh-vel-da-vitrine*
*Completed: 2026-07-12*

## Self-Check: PASSED

Todos os 8 arquivos criados/modificados e os 6 hashes de commit de task foram confirmados no disco/git log.
