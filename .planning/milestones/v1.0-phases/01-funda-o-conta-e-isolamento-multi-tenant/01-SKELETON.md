# Walking Skeleton — Vitrinoo

**Phase:** 1
**Generated:** 2026-07-10

## Capability Proven End-to-End

> A menor capacidade visível ao usuário que exercita a stack inteira.

Um revendedor abre o app implantado, cria conta em `/cadastro` (email + senha), o cadastro grava uma linha em `auth.users` **e** uma linha `stores` isolada por RLS no Postgres do Supabase, e ele é redirecionado para `/onboarding` — enquanto a rota pública `/loja/[slug]` responde 200 sem nenhum cookie de autenticação. Isso prova, ponta a ponta: scaffold + roteamento com split de middleware `/admin` + escrita real no banco + interação real de UI (formulário de cadastro) + deploy de dev funcional.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.x (App Router, Turbopack, Cache Components) | Travado no PROJECT.md/STACK.md; toda rota é dinâmica por padrão (estoque sempre fresco na Fase 4 sem esforço). React 19.2.x vem empacotado. |
| Estilização | Tailwind CSS 4.x (config CSS-first via `@theme` em `globals.css`) | Padrão do `create-next-app@latest`; mobile-first é requisito rígido. |
| Data layer | Supabase Postgres, schema compartilhado + RLS (`owner_id = auth.uid()`) | Multi-tenancy por RLS é a única fronteira de autorização (Padrão 4). Rota pública lê sem middleware de auth. |
| Auth | Supabase Auth (GoTrue) email/senha, sessão em cookies httpOnly via `@supabase/ssr` 0.12.x | Pacote atual não-depreciado para App Router; `getUser()` para todo gate. Sem OAuth, sem verificação de email (D-01). |
| Storage | Supabase Storage, bucket `store-assets` escopado por `{owner_id}/` | Logo da loja; política de storage distinta de `product-images` (Fase 3). |
| Roteamento/segurança | `src/middleware.ts` com `matcher: ['/admin/:path*']` — nunca catch-all + allowlist | Antipadrão #1 do projeto; `/loja/[slug]` inalcançável pelo middleware por construção (Armadilha 5). |
| Deployment target | Vercel (Hobby para dev/preview no MVP) + Supabase local via CLI para testes de RLS/integração | Risco de ToS do Hobby aceito no MVP (STATE.md/PROJECT.md). |
| Directory layout | `src/app/(admin)/*` para painel protegido; `src/app/loja/[slug]` público; `src/lib/{supabase,auth,phone,onboarding,validation}/*` | Estrutura recomendada em RESEARCH.md §Estrutura de Projeto. |
| Test runner | vitest | Nenhum framework existe (greenfield); alvo unitário `normalize-br` + smoke RLS/middleware. |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 16, Tailwind 4, TypeScript, ESLint flat, vitest) — Plan 01
- [x] Routing — `/admin/*` protegido, `/loja/[slug]` público placeholder, split de middleware — Plan 01
- [x] Database — escrita real (`stores`/`store_settings` no cadastro + onboarding) E leitura real (guard de onboarding, teste de isolamento RLS) — Plans 02/03/05
- [x] UI — formulário de cadastro/login (Plan 03) e wizard de onboarding (Plan 05) ligados a Server Actions
- [x] Deployment — Supabase local (`supabase start`) para testes; app roda em dev (`next dev`); deploy de preview na Vercel documentado

## Out of Scope (Deferred to Later Slices)

> O que NÃO está no esqueleto. Impede que fases futuras re-litiguem o minimalismo da Fase 1.

- Slug personalizável, validação de unicidade em tempo real, QR Code, cópia de link (LOJA-02/03/04) → Fase 2 (a constraint `UNIQUE` do slug, porém, é criada agora).
- Verificação de email obrigatória → descartada no MVP (D-01); pode voltar em v2.
- CRUD de produtos e pipeline de mídia → Fase 3.
- Vitrine pública real com filtros/paginação → Fase 4 (nesta fase só um placeholder que prova ausência de middleware).
- Fluxo de pedido no WhatsApp (`wa.me`, botão "Pedir agora") → Fase 5 (nesta fase só normalizamos e salvamos o número + template uma vez).
- Dashboard de métricas → Fase 6.

## Subsequent Slice Plan

Cada fase posterior adiciona uma fatia vertical sobre este esqueleto sem alterar suas decisões arquiteturais:

- Phase 2: revendedor define slug personalizado, gera QR Code, copia link e edita as configs do onboarding.
- Phase 3: CRUD de produtos com upload/compressão de fotos e controle de estoque por tamanho.
- Phase 4: vitrine pública `/loja/[slug]` com filtros na URL, paginação e estoque fresco.
- Phase 5: botão "Pedir agora" → `wa.me` com mensagem codificada (consome o número normalizado desta fase).
- Phase 6: dashboard de métricas agregando eventos das fases anteriores.
