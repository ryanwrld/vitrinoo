---
phase: 01-funda-o-conta-e-isolamento-multi-tenant
plan: 01
subsystem: infra
tags: [nextjs, tailwindcss, typescript, vitest, supabase-ssr, middleware]

# Dependency graph
requires: []
provides:
  - "Scaffold Next.js 16.2.10 + Tailwind 4 + TypeScript + ESLint flat + src/ (App Router, Turbopack)"
  - "vitest configurado (ambiente node, tests/**/*.test.ts) com script npm `test` (vitest run, sem watch mode)"
  - "Três factories de cliente Supabase: createClient() server (cookies via next/headers), createClient() browser (createBrowserClient), updateSession() (helper de refresh de sessão para middleware)"
  - "src/middleware.ts com config.matcher = ['/admin/:path*'] — smoke test verde provando que a vitrine pública não é interceptada"
  - "src/app/loja/[slug]/page.tsx — placeholder público sem nenhuma dependência de auth"
  - ".env.local.example documentando NEXT_PUBLIC_SUPABASE_URL/ANON_KEY"
affects: [01-02, 01-03, 01-04, 01-05, fase-4-vitrine-publica]

# Tech tracking
tech-stack:
  added: ["next@16.2.10", "react@19.2.4", "tailwindcss@4", "@supabase/supabase-js@2.110.2", "@supabase/ssr@0.12.0", "zod@4.4.3", "react-hook-form@7.81.0", "@hookform/resolvers", "sonner@2.0.7", "vitest@4.1.10"]
  patterns:
    - "Convenção server vs browser: código server-side importa de lib/supabase/server, client components importam de lib/supabase/client — nunca misturar"
    - "getUser() sempre para decisões de gate (nunca getSession() sozinho)"
    - "Matcher de middleware estreito e explícito (['/admin/:path*']), nunca catch-all + allowlist"

key-files:
  created:
    - package.json
    - next.config.ts
    - tsconfig.json
    - vitest.config.ts
    - .env.local.example
    - .gitignore
    - src/app/layout.tsx
    - src/app/globals.css
    - src/lib/supabase/server.ts
    - src/lib/supabase/client.ts
    - src/lib/supabase/middleware.ts
    - src/middleware.ts
    - "src/app/loja/[slug]/page.tsx"
    - tests/middleware/matcher.test.ts
  modified: []

key-decisions:
  - "Scaffold criado em diretório temporário (create-next-app recusa diretórios não-vazios) e mesclado na raiz do projeto, preservando .git/.claude/.planning"
  - ".gitignore padrão do Next (`.env*`) corrigido com `!.env*.example` — do contrário .env.local.example nunca seria versionado"
  - "src/middleware.ts mantido (não migrado para proxy.ts) apesar do aviso de depreciação do Next 16.2.10 — ver Deviations"

patterns-established:
  - "Pattern 1 (RESEARCH.md): createServerClient + cookies() getAll/setAll para SSR"
  - "Pattern separação de guards: auth guard (middleware) nunca deve ser misturado com guard de onboarding (Plan 05)"

requirements-completed: [AUTH-02]

coverage:
  - id: D1
    description: "Scaffold Next.js 16 + Tailwind 4 + TypeScript + vitest compila e roda"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "npx vitest run --passWithNoTests"
        status: pass
    human_judgment: false
  - id: D2
    description: "Factories de cliente Supabase (server/browser/middleware helper) tipadas e compilando, updateSession() usa getUser()"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "grep -c getUser src/lib/supabase/middleware.ts (>=1, getSession ausente como gate)"
        status: pass
    human_judgment: false
  - id: D3
    description: "middleware.ts escopado exatamente a /admin/:path*; /loja/[slug], /, /login, /cadastro não cobertos"
    verification:
      - kind: unit
        ref: "tests/middleware/matcher.test.ts (6 asserções: matcher exato + /admin/dashboard coberto + 4 rotas públicas não cobertas)"
        status: pass
      - kind: other
        ref: "next dev smoke test manual: curl http://localhost:3411/ => 200, curl http://localhost:3411/loja/loja-teste => 200, ambos sem cookie de sessão"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-07-10
status: complete
---

# Fase 1 Plano 1: Walking Skeleton de Infraestrutura Summary

**Scaffold Next.js 16.2.10 + Tailwind 4 + TypeScript + vitest com os três factories `@supabase/ssr` (server/browser/middleware) e `src/middleware.ts` escopado exclusivamente a `/admin/:path*`, com smoke test verde provando que a vitrine pública `/loja/[slug]` é inalcançável pelo middleware por construção.**

## Performance

- **Duração:** 9 min
- **Iniciado:** 2026-07-11T01:52:40Z
- **Concluído:** 2026-07-11T02:01:34Z
- **Tasks:** 3/3
- **Arquivos modificados:** 23 (19 do scaffold + 4 específicos do plano além dos factories)

## Accomplishments
- Projeto Next.js 16 greenfield scaffoldado (App Router, Turbopack, Tailwind v4 CSS-first, ESLint flat, `src/`) com todas as dependências core travadas instaladas nas versões corretas
- Três factories de cliente Supabase estabelecendo a convenção de import server vs. browser que todas as fases seguintes herdam
- `src/middleware.ts` com matcher estritamente escopado a `/admin/:path*` (nunca catch-all + allowlist — Antipadrão #1/CVE-2025-29927) e `tests/middleware/matcher.test.ts` verde via ciclo RED→GREEN completo
- `/loja/[slug]` placeholder público que prova, por construção, ausência de qualquer checagem de auth

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Scaffold Next.js 16 + Tailwind 4 + TypeScript + vitest** - `37daeb2` (feat)
2. **Task 2: Factories de cliente Supabase (server, browser, middleware helper)** - `5605ce8` (feat)
3. **Task 3: middleware.ts escopado + placeholder público** - `e7f2b6b` (test, RED) → `9407442` (feat, GREEN)

**Plan metadata:** _(pendente — commit final de documentação após este SUMMARY)_

_Nota: Task 3 seguiu o ciclo TDD completo (RED com teste falhando por módulo inexistente → GREEN com middleware.ts e a página implementados)._

## Files Created/Modified
- `package.json` / `package-lock.json` - dependências core travadas + script `test` (vitest run, sem watch)
- `next.config.ts` - `images.remotePatterns` derivado de `NEXT_PUBLIC_SUPABASE_URL` (não `images.domains`, depreciado)
- `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `next-env.d.ts` - config padrão do `create-next-app@latest`
- `vitest.config.ts` - ambiente `node`, include `tests/**/*.test.ts`, alias `@/*`
- `.env.local.example` - documenta `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `.gitignore` - gerado pelo scaffold + correção para não ignorar `.env*.example`
- `src/app/layout.tsx` - metadata atualizada para "Vitrinoo"
- `src/app/globals.css`, `src/app/page.tsx`, `src/app/favicon.ico`, `public/*.svg`, `AGENTS.md` - artefatos padrão do scaffold
- `src/lib/supabase/server.ts` - `createClient()` server via `createServerClient` + `cookies()` (next/headers)
- `src/lib/supabase/client.ts` - `createClient()` browser via `createBrowserClient`
- `src/lib/supabase/middleware.ts` - `updateSession(request)`, chama `getUser()` a cada requisição
- `src/middleware.ts` - `config.matcher = ['/admin/:path*']`
- `src/app/loja/[slug]/page.tsx` - placeholder público, sem import de cliente Supabase autenticado
- `tests/middleware/matcher.test.ts` - 6 asserções sobre o matcher

## Decisions Made
- Scaffold gerado em `/tmp/vitrinoo-scaffold` via `create-next-app@latest` e mesclado manualmente na raiz do projeto, porque `create-next-app` recusa rodar em diretório não-vazio (o projeto já tinha `.git/`, `.claude/`, `.planning/`) — nenhuma perda de arquivos de planejamento.
- `package.json`/`package-lock.json` renomeados de `vitrinoo-scaffold` para `vitrinoo` para refletir o nome real do projeto.
- Node.js confirmado em v26.3.0 (>= 20.9 exigido pelo Next 16) antes do scaffold.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.gitignore` padrão do Next bloqueava `.env.local.example`**
- **Found during:** Task 1 (scaffold)
- **Issue:** O `.gitignore` gerado pelo `create-next-app` tem uma regra `.env*` que ignora blindamente TODOS os arquivos `.env*`, incluindo `.env.local.example` — um arquivo de documentação que o plano exige explicitamente que exista e seja versionado. Sem a correção, `git add .env.local.example` silenciosamente não adicionaria nada.
- **Fix:** Adicionada a exceção `!.env*.example` logo após a regra `.env*` no `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git check-ignore -v .env.local.example` confirma que o arquivo não é mais ignorado; `git add`/`git status` confirmam que foi staged e commitado.
- **Committed in:** `37daeb2` (Task 1 commit)

**2. [Rule 2 - Missing Critical] `package.json` sem script `test` explícito**
- **Found during:** Task 1 (scaffold)
- **Issue:** O plano exige um script npm `test` rodando `vitest run` (nunca watch mode), mas o scaffold do `create-next-app` não adiciona nenhum script de teste por padrão.
- **Fix:** Adicionado `"test": "vitest run"` em `package.json`.
- **Files modified:** `package.json`
- **Verification:** `grep -n watch package.json` não retorna nenhum script com `--watch`; `npm run test` executa `vitest run` corretamente.
- **Committed in:** `37daeb2` (Task 1 commit)

---

**Total deviations:** 2 auto-fixados (1 bug, 1 funcionalidade crítica ausente)
**Impact on plan:** Ambos os fixes eram necessários para que os critérios de aceitação explícitos do plano (`.env.local.example` versionado; nenhum script com watch mode) fossem satisfeitos. Sem escopo além do que o plano já pedia.

## Issues Encountered

**Depreciação de `middleware.ts` no Next.js 16.2.10 (não bloqueante, documentado para acompanhamento futuro)**

Ao rodar `next dev` para a verificação final (Task 3), o Next.js emitiu o aviso: `The "middleware" file convention is deprecated. Please use "proxy" instead.` Confirmado em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`: a partir do Next 16.0.0, `middleware.ts` foi renomeado para `proxy.ts` (mesma função, apenas o nome do arquivo/export muda: `middleware()` → `proxy()`), com um codemod oficial disponível (`npx @next/codemod@canary middleware-to-proxy .`).

**Por que não migrei agora:** `middleware.ts` continua 100% funcional nesta versão (depreciado, não removido) — o smoke test do matcher e o `next dev` real confirmaram que `/admin/dashboard` é interceptado e `/`, `/loja/loja-teste` respondem 200 sem nenhum cookie de sessão, exatamente como o plano exige. Além disso, o próprio `01-01-PLAN.md` (`files_modified`, `must_haves.artifacts`, `threat_model`) e o `01-05-PLAN.md` referenciam literalmente o caminho `src/middleware.ts` — uma renomeação unilateral agora criaria uma inconsistência de nome de arquivo com um plano futuro da mesma fase que ainda não executei. Renomear tem exatamente o mesmo comportamento (é um rename 1:1 documentado pela própria Next.js), então não há risco funcional em adiar — apenas um débito técnico cosmético de nomenclatura.

**Recomendação:** rodar `npx @next/codemod@canary middleware-to-proxy .` em uma fase futura (ou no início do Plan 05, que também referencia `middleware.ts`), atualizando as referências textuais nos documentos de fase junto com o rename do arquivo.

**Vulnerabilidade moderada em dependência transitiva (não bloqueante)**

`npm audit` reporta 2 vulnerabilidades moderadas (`postcss < 8.5.10`, XSS em stringify de CSS) via `next@16.2.10` → `postcss` empacotado internamente. Severidade moderada, abaixo do threshold `security_block_on: "high"` do projeto. A correção sugerida pelo `npm audit fix --force` faria downgrade de `next` para `9.3.3` (major muito antigo, quebra o requisito explícito de Next 16), portanto não foi aplicada. Trata-se de uma dependência interna do próprio Next.js, fora do controle direto do projeto — deve ser resolvida por um futuro patch de `next`, não por uma ação neste plano.

## User Setup Required

Nenhuma ação de setup de serviço externo foi necessária **para completar este plano especificamente** — nenhum código desta task chama o Supabase em runtime (as factories são criadas mas não exercitadas por nenhuma rota ainda). O `user_setup` do frontmatter do plano (provisionar projeto Supabase + `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`) continua pendente e será necessário a partir do Plan 02 (schema/RLS) e Plan 03 (cadastro/login real), quando o app efetivamente chamar `supabase.auth.*`. `.env.local.example` já documenta as duas variáveis exigidas.

## Next Phase Readiness

- Base compilável pronta: `npx tsc --noEmit` e `npx vitest run` verdes; `next dev` sobe e serve `/` e `/loja/[slug]` com 200 sem nenhum cookie de sessão.
- Convenção de import Supabase (server vs. browser) e separação middleware-de-auth vs. futuro guard-de-onboarding estabelecidas — Plans 02-05 devem seguir esse padrão sem reabrir a decisão.
- Nenhum bloqueador para o Plan 02 (schema `stores`/`store_settings` + RLS) — ainda depende do provisionamento do projeto Supabase (Wave 0 / `user_setup`), não coberto por este plano.
- Débito técnico registrado (não bloqueante): migração `middleware.ts` → `proxy.ts` recomendada antes ou durante o Plan 05.

---
*Phase: 01-funda-o-conta-e-isolamento-multi-tenant*
*Completed: 2026-07-10*
