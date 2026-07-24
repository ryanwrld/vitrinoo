---
phase: quick-260716-fl8
plan: 1
subsystem: ui
tags: [design-system, tailwind-v4, tokens, ui-polish]
dependency-graph:
  requires: []
  provides:
    - "@theme tokens (blue/gray/primary/success/error/warning/whatsapp/radius/shadow) in globals.css"
    - "Manrope/Inter fonts via next/font/google"
    - "component recipes (button/field/select/dialog/badge/pill/card) applied across ~28 presentation files"
  affects:
    - "src/app/globals.css"
    - "src/app/layout.tsx"
    - "src/components/admin-sidebar.tsx"
    - "src/app/(admin)/** (auth, onboarding, dashboard, produtos, configuracoes)"
    - "src/app/loja/** (public storefront)"
tech-stack:
  added: []
  patterns:
    - "Tailwind v4 @theme token remapping (--color-*, --radius-*, --shadow-*) instead of per-file hex classes"
    - "font-display (Manrope) / font-body+font-sans (Inter) alias mapping via @theme inline"
    - "Native <select> wrapped in relative div + ChevronDown icon instead of custom dropdown component"
key-files:
  created: []
  modified:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/components/admin-sidebar.tsx
    - src/app/(admin)/login/page.tsx
    - src/app/(admin)/cadastro/page.tsx
    - src/app/(admin)/esqueci-senha/page.tsx
    - src/app/(admin)/redefinir-senha/page.tsx
    - src/app/(admin)/onboarding/onboarding-wizard.tsx
    - src/app/(admin)/(painel)/dashboard/page.tsx
    - src/app/(admin)/(painel)/produtos/page.tsx
    - src/app/(admin)/(painel)/produtos/novo/page.tsx
    - "src/app/(admin)/(painel)/produtos/[id]/editar/page.tsx"
    - src/app/(admin)/(painel)/produtos/product-list.tsx
    - src/app/(admin)/(painel)/produtos/product-toolbar.tsx
    - src/app/(admin)/(painel)/produtos/product-form.tsx
    - src/app/(admin)/(painel)/produtos/size-grid.tsx
    - src/app/(admin)/(painel)/produtos/photo-uploader.tsx
    - src/app/(admin)/(painel)/configuracoes/page.tsx
    - src/app/(admin)/(painel)/configuracoes/settings-form.tsx
    - src/app/(admin)/(painel)/configuracoes/slug-editor.tsx
    - src/app/(admin)/(painel)/configuracoes/qr-code-panel.tsx
    - "src/app/loja/[slug]/page.tsx"
    - "src/app/loja/[slug]/store-hero.tsx"
    - "src/app/loja/[slug]/product-card.tsx"
    - "src/app/loja/[slug]/product-filters.tsx"
    - "src/app/loja/[slug]/pagination-numbered.tsx"
    - "src/app/loja/[slug]/load-more-button.tsx"
    - "src/app/loja/[slug]/image-with-fallback.tsx"
    - "src/app/loja/[slug]/[produto]/product-order-panel.tsx"
    - "src/app/loja/[slug]/[produto]/product-not-found-content.tsx"
decisions:
  - "Dashboard stat cards: simplified per-card iconClass/numberClass arrays to a single uniform recipe (text-gray-400 icon, font-display font-extrabold text-3xl text-gray-900 number) — presentational simplification only, no change to computed values, as instructed by the plan."
  - "produtos/novo/page.tsx and produtos/[id]/editar/page.tsx also had their h1/'Voltar' hex converted even though the original task file list only named 9 files for this section, per the plan's own inventory note (they render the same elements and can't be left with old hex)."
metrics:
  duration: "~12 minutes"
  completed: "2026-07-16"
status: complete
---

# Phase quick-260716-fl8 Plan 1: Aplicar novo Design System visual ao Vitrinoo Summary

Migração puramente visual do painel admin e da vitrine pública para o novo Design System (tokens `@theme` de cor/raio/sombra/motion, fontes Manrope+Inter), sem alterar nenhuma lógica, prop, Server Action, query, RLS ou copy.

## What Was Built

**Task 1 — Fundação de tokens (`globals.css` + `layout.tsx`):** Adicionado bloco `@theme` com a escala azul (`--color-blue-50..950`, `--color-blue-600: #0D21A1` preservado como marca), neutros azulados (`--color-gray-50..950`, `--color-gray-950: #000000` preservado), aliases semânticos (`primary`/`primary-hover`/`primary-active`/`primary-subtle`/`primary-border`), cores de estado (`success`/`error`/`warning`), exceção `whatsapp`/`whatsapp-hover`, e remapeamento de `--radius-*`/`--shadow-*`. Aliases de fonte `--font-display`/`--font-body`/`--font-sans` via `@theme inline`, apontando para `--font-manrope`/`--font-inter`. Keyframes de motion `vt-fade-in`/`vt-scale-in`/`vt-slide-up` adicionados preservando intacto o `@keyframes shake`/`.animate-shake` existente. `layout.tsx` trocou `Geist`/`Geist_Mono` por `Manrope`/`Inter` (pesos 500/600/700/800 e 400/500/600/700, `display: "swap"`), expondo `--font-manrope`/`--font-inter` no `<html>`.

**Task 2 — Shell admin + auth + onboarding:** `admin-sidebar.tsx` (nav ativo/inativo, divisores, dialog drawer com `backdrop-blur` e `animate-scale-in`); `login`/`cadastro`/`esqueci-senha`/`redefinir-senha`/`onboarding-wizard` com receitas de campo/label/erro/botão primário aplicadas uniformemente, links de rodapé em `text-primary`. Default `accentColor: "#0D21A1"` do onboarding preservado intacto.

**Task 3 — Dashboard + Produtos:** stat cards simplificados para recipe uniforme; linhas de produto/mais-visualizados/cliques com Card + indicador success/gray; `product-list` com pill de status via Badge e dialog de exclusão com backdrop-blur/animate-scale-in; `product-toolbar`/`product-form` com selects nativos envoltos em `<div className="relative">` + `ChevronDown`; `size-grid` com pills de tamanho tokenizadas; `photo-uploader` com slots/badge "Capa"/ícones tokenizados.

**Task 4 — Configurações:** `settings-form` com mesmas receitas + select estilizado, default `accentColor: store.accentColor ?? "#0D21A1"` preservado; `slug-editor` com `StatusPill` success/gray/error e dialog de troca de link tokenizado; `qr-code-panel` com moldura `bg-gray-100`, URL somente-leitura `bg-gray-50`, botões primário/secundário tokenizados.

**Task 5 — Vitrine pública:** `product-card` com lift no hover e preço `font-display font-bold text-primary`; `product-filters` com chips e campo de busca tokenizados; `pagination-numbered`/`load-more-button` com botões secundário/primário; `product-order-panel` com CTA "Pedir agora" convertido para `bg-whatsapp hover:bg-whatsapp-hover`, preservando integralmente `shakeKey`/`animate-shake`/`decideOrderAction`/`logOrderClick`/`buildWhatsAppUrl`/o `<a href>` real (nunca disabled); `store-hero` ganhou `font-display` no `<h1>` mantendo o fallback inline `store.accentColor ?? "#000000"` intocado.

## Verification

Gate final rodado a partir da raiz do worktree (equivalente ao gate do plano, adaptado de path absoluto do repo principal para o worktree):

1. `grep -rhoE '\[#[0-9A-Fa-f]{3,8}\]' src/components "src/app/(admin)" "src/app/loja" | wc -l` → **0** ✓
2. `grep -rnE '"#[0-9A-Fa-f]{6}"' src/components "src/app/(admin)" "src/app/loja"` → exatamente as 3 linhas de dado esperadas (`accentColor: "#0D21A1"` em onboarding-wizard.tsx e settings-form.tsx; `store.accentColor ?? "#000000"` em store-hero.tsx) ✓
3. `--color-primary: #0D21A1` e `--color-gray-950: #000000` presentes em globals.css ✓
4. `Manrope` presente e `font-geist` ausente em layout.tsx ✓
5. `npx tsc --noEmit` → apenas o erro pré-existente conhecido em `tests/supabase/server-cookies.test.ts` (documentado em STATE.md); nenhum erro novo introduzido ✓
6. (Manual/checkpoint humano) — não executado nesta sessão autônoma; recomenda-se verificação visual do CTA "Pedir agora", hover/foco de botões, dialogs com backdrop novo e badges de status antes do deploy.

## Deviations from Plan

### Auto-fixed Issues

None beyond what the plan explicitly anticipated. One clarification applied exactly as the plan's own context section instructed:

**1. [Plan-directed, not a deviation] Converted hex in `produtos/novo/page.tsx` and `produtos/[id]/editar/page.tsx`**
- **Found during:** Task 3
- **Issue:** The plan's `files_modified` frontmatter for Task 3 names 9 files but the task's `<action>` block explicitly calls out that these two server pages also have `[#000000]` in their `<h1>` and "Voltar" button, and instructs converting them too.
- **Fix:** Converted `text-[#000000]` → `font-display text-gray-900` on the `<h1>`, and the outline-black "Voltar" button → the secondary-button recipe, in both files.
- **Files modified:** `src/app/(admin)/(painel)/produtos/novo/page.tsx`, `src/app/(admin)/(painel)/produtos/[id]/editar/page.tsx`
- **Commit:** c003948

### Presentational simplification (plan-directed)

**Dashboard stat cards:** the original code had per-card `iconClass`/`numberClass` arrays with distinct colors (black/primary/gray/black). The plan explicitly instructed simplifying these to a uniform recipe (`text-gray-400` icon, `font-display font-extrabold text-3xl text-gray-900` number) since this is presentational only and does not touch the calculated `value` fields. Applied as instructed.

## Known Stubs

None. This is a pure styling migration — no new data-fetching paths, no placeholder content introduced.

## Threat Flags

None. No new trust boundaries, endpoints, or data flows were introduced — pure className/token/font changes, exactly as scoped in the plan's threat model (T-quick-01/02/SC, all `mitigate`/`accept` with no residual risk beyond visual review).

## Self-Check: PASSED

Verified all 5 task commits exist in git log and all modified files exist on disk (see below).
