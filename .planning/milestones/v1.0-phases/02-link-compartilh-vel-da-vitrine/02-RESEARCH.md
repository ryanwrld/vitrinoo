# Phase 2: Link Compartilhável da Vitrine - Research

**Researched:** 2026-07-12
**Domain:** Next.js 16 Server Actions + Supabase RLS (real-time uniqueness check), client-side QR generation, native confirmation dialogs
**Confidence:** MEDIUM (one HIGH-confidence finding directly from reading the codebase; several MEDIUM findings from web research; no LOW-confidence claims presented as fact — see Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Troca de Slug**
- D-01: Slugify automático — o que o revendedor digita é convertido automaticamente (minúsculas, sem acento, espaços viram hífens), reduzindo erro de digitação de um público não-técnico.
- D-02: Limite de 3–30 caracteres no slug.
- D-03: Validação de unicidade dispara enquanto o revendedor digita, com debounce (~400ms) — feedback "disponível"/"já em uso" antes mesmo de salvar.
- D-04: Trocar o slug quebra o link antigo sem redirect (404) — decisão consciente de simplicidade para o MVP, sem tabela de histórico de slugs. Por isso o salvamento do slug precisa de confirmação explícita (ver D-06/D-08).

**Tela de Configurações**
- D-05: Nova rota dedicada `/configuracoes` no painel admin, separada do Dashboard.
- D-06: Página única com seções (Loja, WhatsApp, Link/QR) em vez de abas.
- D-07: Formulário novo, escrito do zero para esta tela — não reaproveitar `onboarding-wizard.tsx` como componente. A lógica de validação/normalização (Zod schemas, `normalizeWhatsAppBR`) pode e deve ser reaproveitada; o componente de formulário/wizard em si, não.
- D-08: A troca de slug tem botão "Salvar" e confirmação próprios, separados do restante do formulário (loja/WhatsApp). Diálogo de confirmação deve avisar explicitamente: "Isso vai quebrar links já compartilhados."

**QR Code**
- D-09: Formato de download: PNG (biblioteca `qrcode`, já escolhida na pesquisa de stack).
- D-10: QR Code simples, sem logo da loja no centro.
- D-11: Preview do QR renderizado na tela assim que a página carrega, com botão "Baixar PNG" ao lado.

**Copiar Link**
- D-12: Feedback de cópia via toast "Link copiado!" (`sonner`).
- D-13: O link completo da vitrine aparece visível como texto na tela (campo readonly) ao lado do botão "Copiar". Mesmo bloco visual do QR Code.

### Claude's Discretion
- Geração do QR Code client-side vs. via Route Handler no servidor — decisão técnica, não de UX; ambas atendidas pela lib `qrcode`.
- Exato texto de erro de validação do slug (caracteres inválidos, já em uso, etc.) fica a critério da implementação.
- Mecanismo técnico de debounce (hook customizado vs. lib) é decisão de implementação.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOJA-02 | Revendedor pode definir um slug personalizado (vitrinoo.app/loja/[slug]) com validação de unicidade em tempo real | See "Critical Finding: RLS Blocks Cross-Tenant Slug Checks" (Pitfall 1) and "Architecture Patterns → Pattern 1" — requires a new `SECURITY DEFINER` RPC function, not a direct table query |
| LOJA-03 | Revendedor pode gerar e baixar QR Code do link da vitrine | See "Code Examples → QR Code preview + download" and Package Legitimacy Audit for `qrcode` |
| LOJA-04 | Revendedor pode copiar o link da vitrine com um clique | See "Code Examples → Copy-to-clipboard" — standard Clipboard API + `sonner` toast, no new library needed |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Mobile-first obrigatório:** qualquer feature que quebre no mobile não vai para produção. Applies directly to the QR preview block and icon-only copy/download buttons (UI-SPEC already mandates 44×44px minimum touch targets).
- **Next.js 16 (Cache Components, opt-in cache):** do not introduce `"use cache"` on `/configuracoes` or any route touching live store data — this phase adds no caching, consistent with the stack's dynamic-by-default posture.
- **Sem cobrança no MVP:** not applicable to this phase.
- **Rota pública sem auth:** not applicable — `/configuracoes` is an authenticated admin route, not the public vitrine.
- **Encoding de URL para WhatsApp:** not applicable to this phase (no WhatsApp message construction here — only WhatsApp *settings* editing, reusing Phase 1's `normalizeWhatsAppBR`).
- **Stack recomendada (`STACK.md`):** `qrcode` 1.5.4 and `lucide-react` are pre-approved dependencies for this phase; no alternative library should be substituted.

## Summary

This phase adds a `/configuracoes` screen with three concerns: (1) live slug-uniqueness checking as the user types, (2) QR code generation/download, and (3) editing the store/WhatsApp settings already collected in Phase 1's onboarding. Two of these are low-risk, well-trodden integrations (QR generation via the already-vetted `qrcode` package; copy-to-clipboard via the standard browser Clipboard API). The third — real-time slug uniqueness — has a **non-obvious, codebase-specific blocker**: this project's RLS policy on `stores` (`owner_full_access_stores … using (owner_id = auth.uid())`) restricts **all** `SELECT` access to rows the caller owns. Neither the browser Supabase client nor the server Supabase client (both use the anon key + user session, both RLS-bound) can see whether a *different* store already has a given slug. A direct `.from('stores').select().eq('slug', x)` query will silently report "available" even when the slug is taken by someone else — a bug that would only surface as a raw Postgres `unique_violation` error at save time, defeating the entire point of D-03's real-time feedback.

The correct, minimal-exposure fix is a new Postgres migration adding a `SECURITY DEFINER` RPC function (e.g. `public.is_slug_available(candidate_slug text) returns boolean`) with a pinned `search_path`, granted to the `authenticated` role, called via `supabase.rpc(...)` from a debounced Server Action. This returns only a boolean — no cross-tenant row data is ever exposed. Plan this migration explicitly; CONTEXT.md's assumption that "no new migration expected for slug itself" only holds for the already-existing `UNIQUE` constraint, not for the uniqueness-check *mechanism*.

A second, verified-from-source finding: the existing `generateStoreSlug` (`src/lib/auth/actions.ts`) does **not** actually strip accents/diacritics — it only replaces any non-`[a-z0-9]` character with a hyphen, so `"café"` becomes `"caf-"`, not `"cafe"`. D-01 explicitly requires "sem acento" (accent-folded) slugs. Reusing `generateStoreSlug`'s algorithm as-is will not satisfy D-01. Extract a shared `slugify()` utility (NFD-normalize + strip diacritics + lowercase + non-alnum→hyphen + trim) used by both the signup auto-slug and this phase's live-editing input, so the project never diverges into two slugify algorithms (a risk CONTEXT.md itself flags).

**Primary recommendation:** Use a debounced Server Action (not a Route Handler) calling a new `SECURITY DEFINER` Postgres RPC for uniqueness checks; extract and fix the shared slugify utility to properly fold diacritics; generate the QR code client-side with `qrcode`'s `toDataURL`/`toCanvas` (no Route Handler needed, since D-10 requires no server-side logo compositing); use the native `<dialog>` element (`showModal()`) for the D-08 confirmation, consistent with the project's no-component-library convention.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Slug format validation (charset, length 3–30) | Browser / Client | API / Backend | Zod schema runs client-side for instant feedback (react-hook-form), then re-validated server-side inside the Server Action — never trust client-only validation for a value with a DB uniqueness constraint |
| Slug uniqueness check (cross-tenant) | API / Backend (Server Action → Postgres RPC) | Database / Storage | Must run server-side because RLS blocks the browser client from seeing other tenants' rows; the boolean-returning RPC is the actual enforcement boundary, DB `UNIQUE` constraint is the final safety net |
| Slug persistence + confirmation | API / Backend | Database / Storage | Server Action re-validates + issues the `UPDATE`, relying on the `UNIQUE` constraint to catch a last-moment race (TOCTOU between debounce check and save) |
| QR code generation | Browser / Client | — | No server round-trip needed; `qrcode`'s browser build renders directly to `<canvas>`/data URL, no logo compositing (D-10) means no server-side image work is required |
| QR code PNG download | Browser / Client | — | Client already holds the canvas/data URL; download is a plain `<a download>` anchor, no Route Handler needed |
| Copy-link-to-clipboard | Browser / Client | — | Clipboard API is browser-only by nature; `sonner` toast for feedback is already a client-side pattern in this codebase |
| Store/WhatsApp settings edit | API / Backend (Server Action) | Database / Storage | Same pattern as `saveOnboarding` — Zod validation + Supabase client scoped by `owner_id`, reusing existing schemas per D-07 |
| Confirmation dialog UI (D-08) | Browser / Client | — | Pure UI/interaction concern, no data implications; native `<dialog>` needs no backend involvement |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `qrcode` | 1.5.4 [VERIFIED: npm registry] | Generate QR code as PNG (data URL client-side, or buffer/file server-side) | Already selected in `.planning/research/STACK.md`; isomorphic package (works in both browser and Node bundles), no alternative needed |
| `lucide-react` | 1.24.0 [VERIFIED: npm registry] | Icon set — slug status icons (checking/available/taken), copy icon, download icon | Already selected in `.planning/research/STACK.md`; consistent icon language with rest of admin panel per UI-SPEC |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none — hand-rolled `useDebounce` hook | n/a | Debounce the slug input before firing the uniqueness Server Action | This is the first phase needing debounce (confirmed: no existing debounce utility anywhere in `src/`); a ~15-line custom hook (`useState` + `useEffect` + `setTimeout`) is standard practice and avoids adding a dependency (e.g. `use-debounce` npm package) for a single call site |
| none — native `<dialog>` element | n/a (Baseline, Web Platform, ~96% global support since March 2022) [CITED: web search cross-referencing MDN-adjacent sources] | D-08 confirmation dialog | No client-side modal library needed; `showModal()` gives built-in focus trap, Escape-key handling, and `::backdrop` styling for free, consistent with the project's "no component registry" convention (UI-SPEC) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Debounced Server Action for slug check | Route Handler (`/api/slug-check?slug=x`) hit via client-side `fetch` | Both work; Server Action was chosen because it's the established pattern in this codebase (`saveOnboarding`) and avoids introducing a second request style (Route Handler) for a single new use case |
| `SECURITY DEFINER` Postgres RPC for cross-tenant uniqueness check | A public RLS `SELECT` policy on `stores` (`for select using (true)`) | Rejected: a blanket public-select policy exposes every column (`name`, `logo_url`, `tagline`, `owner_id`) for any slug guess, not just existence/availability. The RPC returns only a boolean — strictly smaller data-exposure surface |
| Native `<dialog>` | A hand-rolled `<div>`-based modal with manual focus trap | Rejected: reinventing focus trap / Escape handling / ARIA semantics is exactly the kind of "don't hand-roll" problem `<dialog>` already solves natively, with no bundle cost |
| Client-side QR generation (`toDataURL`/`toCanvas`) | Server-side QR generation via a Route Handler (`toBuffer`/`toFile`) | Valid alternative (explicitly left to Claude's discretion in CONTEXT.md) — server-side would be preferable only if compositing a logo (needs `sharp`), which D-10 explicitly rules out. Client-side avoids an extra network round trip for a purely deterministic, non-sensitive transformation (the slug/URL is already public) |

**Installation:**
```bash
npm install qrcode lucide-react
npm install -D @types/qrcode
```

**Version verification:** Confirmed via `npm view qrcode version` → `1.5.4` (matches STACK.md, published 2024-08-05, ~17.2M weekly downloads) and `npm view lucide-react version` → `1.24.0` (matches STACK.md, ~74.2M weekly downloads). Both `npm view <pkg> scripts.postinstall` returned empty — no postinstall script risk.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| qrcode | npm | Latest version published 2024-08-05 (package itself much older) | 17,194,489/wk | github.com/soldair/node-qrcode | OK | Approved |
| lucide-react | npm | Latest version (1.24.0) published 2026-07-09 — 3 days before this research | 74,192,669/wk | github.com/lucide-icons/lucide.git | SUS ("too-new" signal on latest version) | Flagged — planner must add `checkpoint:human-verify` before `npm install lucide-react` |

**Packages removed due to [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** `lucide-react` — the automated legitimacy check flags it purely because its *latest version* (1.24.0) was published only 3 days before this research ran. This is very likely a false positive driven by the package's normal fast release cadence (Lucide ships frequent icon-set updates), not a supply-chain risk indicator: the package has 74M weekly downloads, a long-established GitHub organization (`lucide-icons`), no postinstall script, and is not deprecated. **Recommendation for the planner:** insert a lightweight `checkpoint:human-verify` before `npm install lucide-react` that simply confirms `npm view lucide-react repository.url` still resolves to `github.com/lucide-icons/lucide` and the version matches what's on npmjs.com — do not skip this gate even though the underlying package is almost certainly safe, per protocol.

*Package names in this table were already selected in `.planning/research/STACK.md` (a previous research session) and re-verified here directly against the npm registry — not sourced from this session's WebSearch, so they are tagged `[VERIFIED: npm registry]` rather than `[ASSUMED]`.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser (Client Component: /configuracoes/settings-form.tsx)            │
│                                                                           │
│  [slug input] ──keystroke──▶ [slugify(value)] ──▶ [debounce ~400ms]     │
│                                                        │                 │
│                                                        ▼                 │
│                                          [useTransition → Server Action]│
│                                                        │                 │
│  [QR preview <canvas>] ◀── qrcode.toCanvas(publicUrl) │ (pure client,   │
│  [Baixar PNG] ◀── canvas.toDataURL() + <a download>   │  no server call)│
│                                                        │                 │
│  [Copiar] ──▶ navigator.clipboard.writeText(url) ──▶ sonner toast       │
│                                                        │                 │
│  [Salvar novo link] ──click──▶ <dialog showModal>     │                 │
│         "Isso vai quebrar links já compartilhados"    │                 │
│         [Sim, trocar o link] ──confirm──▶─────────────┤                 │
└────────────────────────────────────────────────────────┼─────────────────┘
                                                           │
                                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ API / Backend (Server Actions, "use server")                            │
│                                                                           │
│  checkSlugAvailability(candidateSlug)                                   │
│    1. Zod: format valid? (3-30 chars, [a-z0-9-])                        │
│    2. supabase.rpc('is_slug_available', { candidate_slug })  ───────────┼──┐
│    3. return { available: boolean } | { error }                        │  │
│                                                                          │  │
│  updateStoreSlug(newSlug)                                              │  │
│    1. Zod re-validate                                                  │  │
│    2. supabase.from('stores').update({slug}).eq('id', store.id)        │  │
│    3. catch unique_violation (23505) → friendly "já em uso" error      │  │
│       (race-condition safety net — debounce check ≠ atomic guarantee)  │  │
│                                                                          │  │
│  saveStoreSettings(formData)  — mirrors saveOnboarding pattern          │  │
│    Zod validate → normalizeWhatsAppBR → update stores/store_settings   │  │
│    scoped by owner_id = auth.uid()                                     │  │
└──────────────────────────────────────────────────────────────────────────┼──┘
                                                                             │
                                                                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Database (Postgres via Supabase, RLS enabled)                           │
│                                                                           │
│  stores (RLS: owner_id = auth.uid() — blocks cross-tenant SELECT)       │
│                                                                           │
│  NEW migration this phase:                                              │
│  FUNCTION public.is_slug_available(candidate_slug text)                │
│    RETURNS boolean                                                      │
│    SECURITY DEFINER                                                     │
│    SET search_path = public, pg_temp                                    │
│    -- runs with owner's privileges, bypasses caller's RLS,              │
│    -- returns ONLY a boolean, never row data                            │
│  GRANT EXECUTE ... TO authenticated;                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── app/(admin)/configuracoes/
│   ├── page.tsx              # Server Component: requireCompletedOnboarding() guard + data fetch, renders <SettingsForm>
│   ├── settings-form.tsx     # Client Component: new form (D-07), react-hook-form, three sections (Loja/WhatsApp/Link)
│   ├── slug-editor.tsx       # Client Component: isolated slug input + debounce + status pill + confirm dialog (D-08)
│   └── qr-code-panel.tsx     # Client Component: QR preview + "Baixar PNG" + "Copiar" (D-11–D-13)
├── lib/
│   ├── slug/
│   │   ├── slugify.ts        # NEW shared utility — extracted + fixed diacritic-folding, used by BOTH this phase and generateStoreSlug
│   │   └── validation.ts     # Zod schema for slug format (3-30 chars, [a-z0-9-], no leading/trailing hyphen)
│   ├── settings/
│   │   └── actions.ts        # NEW: checkSlugAvailability, updateStoreSlug, saveStoreSettings Server Actions
│   └── hooks/
│       └── use-debounce.ts   # NEW: generic debounce hook (first consumer of this pattern in the codebase)
supabase/migrations/
└── 0002_slug_availability_rpc.sql   # NEW: SECURITY DEFINER function + grant
```

### Pattern 1: Debounced cross-tenant uniqueness check via SECURITY DEFINER RPC
**What:** A Postgres function that runs with elevated privileges to answer a single narrow question ("does any store already have this slug?") without exposing row data, callable from a debounced client interaction via a Server Action.
**When to use:** Any time a multi-tenant RLS-isolated table needs a cross-tenant existence/uniqueness check that the tenant-scoped RLS policy would otherwise block.
**Example:**
```sql
-- Source: pattern derived from Supabase's own RLS + SECURITY DEFINER guidance
-- (supabase.com/docs/guides/database/postgres/row-level-security,
--  supabase.com/docs/guides/troubleshooting/do-i-need-to-expose-security-definer-functions...)
create or replace function public.is_slug_available(candidate_slug text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from stores where slug = candidate_slug
  );
$$;

grant execute on function public.is_slug_available(text) to authenticated;
```
```typescript
// src/lib/settings/actions.ts
"use server";

export async function checkSlugAvailability(candidateSlug: string) {
  const parsed = slugSchema.safeParse(candidateSlug);
  if (!parsed.success) {
    return { available: false, error: parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_slug_available", {
    candidate_slug: parsed.data,
  });

  if (error) {
    return { available: false, error: "Não foi possível verificar o link agora." };
  }

  return { available: data as boolean };
}
```

### Pattern 2: Debounce hook feeding a Server Action via useTransition
**What:** Client-side debounce of a fast-changing input value, firing a Server Action only after the value settles.
**When to use:** Any live-validation-as-you-type field backed by a server round trip (D-03).
**Example:**
```typescript
// Source: general React/Next.js community pattern (WebSearch, no single canonical doc)
"use client";
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```
```typescript
// slug-editor.tsx (excerpt)
const [rawSlug, setRawSlug] = useState(currentSlug);
const slug = slugify(rawSlug); // D-01: auto-slugify on every keystroke
const debouncedSlug = useDebouncedValue(slug, 400); // D-03: ~400ms
const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
const [isPending, startTransition] = useTransition();

useEffect(() => {
  if (debouncedSlug.length < 3 || debouncedSlug === currentSlug) return;
  setStatus("checking");
  startTransition(async () => {
    const result = await checkSlugAvailability(debouncedSlug);
    setStatus(result.available ? "available" : "taken");
  });
}, [debouncedSlug]);
```

### Pattern 3: Native `<dialog>` for the destructive-confirmation flow (D-08)
**What:** Browser-native modal with built-in focus trap and Escape handling.
**When to use:** Any confirm-before-destructive-action flow in a codebase with no modal/dialog component yet.
**Example:**
```typescript
// Source: web search cross-referencing dialog element browser-native behavior
// (Baseline since March 2022; showModal() gives focus trap + ::backdrop + Escape for free)
"use client";
import { useRef } from "react";

function SlugChangeDialog({ onConfirm }: { onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={dialogRef}
      className="rounded-lg p-6 backdrop:bg-black/40"
    >
      <h2 className="text-xl font-medium text-[#111111]">Trocar o link da sua vitrine?</h2>
      <p className="mt-2 text-sm text-[#6B6B6B]">
        Isso vai quebrar links já compartilhados: quem tiver o link antigo não vai
        mais conseguir acessar sua vitrine. Essa ação não pode ser desfeita.
      </p>
      <form method="dialog" className="mt-4 flex gap-3">
        <button type="submit" className="rounded-lg border border-[#0D3D2B] px-4 py-2">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => { onConfirm(); dialogRef.current?.close(); }}
          className="rounded-lg bg-[#FF4D4D] px-4 py-2 text-white"
        >
          Sim, trocar o link
        </button>
      </form>
    </dialog>
  );
  // Trigger: dialogRef.current?.showModal()
}
```

### Anti-Patterns to Avoid
- **Querying `stores` directly from the client (or an RLS-bound server client) to check slug uniqueness:** will silently always report "available" for slugs owned by other tenants, because the existing RLS policy scopes `SELECT` to `owner_id = auth.uid()`. This is the single most important anti-pattern to avoid in this phase.
- **Reusing `generateStoreSlug`'s regex as the D-01 "sem acento" slugify logic verbatim:** it does not fold diacritics (`café` → `caf-`, not `cafe`); extract and fix a shared utility instead.
- **Skipping the server-side `unique_violation` catch on save:** the debounce check and the actual save are not atomic — a race condition (two revendedores grabbing the same slug within the debounce window) is possible, however rare. Always catch Postgres error code `23505` on the update and surface the friendly "já em uso" message, never a raw DB error.
- **A hand-rolled `<div>`-based modal with manual `onKeyDown` Escape handling and manual focus trapping:** reinvents what `<dialog>`'s `showModal()` already provides natively.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Cross-tenant slug existence check | A custom "public read" endpoint or loosened RLS policy | A single-purpose `SECURITY DEFINER` SQL function returning only a boolean | Minimizes exposed surface area to exactly the boolean needed; avoids leaking `name`/`logo_url`/`owner_id` of other tenants |
| QR code PNG generation | Manual QR matrix/encoding logic | `qrcode` npm package (already approved) | QR encoding (Reed-Solomon error correction, version/mode selection) is a solved, well-tested problem — hand-rolling risks producing malformed/unscannable codes |
| Accessible modal dialog (focus trap, Escape, ARIA) | Custom `<div>` overlay + manual `document.addEventListener('keydown', ...)` | Native `<dialog>` element + `showModal()` | Browser-native, Baseline-supported since 2022, zero bundle cost, correct ARIA semantics out of the box |
| Slug diacritic folding | A hand-written character-substitution map (`ã`→`a`, `ç`→`c`, ...) | `string.normalize("NFD").replace(/[̀-ͯ]/g, "")` (standard Unicode combining-mark strip) followed by the existing lowercase/hyphenate logic | Unicode normalization handles the general case correctly (all Latin diacritics, not just the ones a developer happened to think of) |

**Key insight:** The riskiest part of this phase is not any external library — it's a subtle interaction between this project's existing multi-tenant RLS design (built correctly in Phase 1 to isolate tenants) and a *new* cross-tenant read requirement introduced by D-03. The RLS policy doing its job well is exactly what breaks a naive uniqueness-check implementation; the fix must be a narrowly-scoped, explicit exception (the RPC), not a broadening of the existing policy.

## Common Pitfalls

### Pitfall 1: RLS silently blocks cross-tenant slug uniqueness checks
**What goes wrong:** A `.from('stores').select('id').eq('slug', candidateSlug)` query — whether run from the browser client or the server client — only ever returns rows the authenticated user owns (`owner_full_access_stores … using (owner_id = auth.uid())`, confirmed by reading `supabase/migrations/0001_init_stores_rls.sql`). For any slug owned by a *different* store, the query returns zero rows, which a naive implementation would interpret as "available" — always, even when the slug is actually taken.
**Why it happens:** RLS is enforced at the row level regardless of which Supabase client (`createBrowserClient` or `createServerClient`) issues the query, because both use the anon key + the same user's session — neither has elevated privileges. This is correct/intended behavior for tenant isolation; it just wasn't designed with a "check across tenants" use case in mind.
**How to avoid:** Add a `SECURITY DEFINER` Postgres function (Pattern 1 above) as a new migration, scoped to return only a boolean, and call it via `supabase.rpc()` from the Server Action.
**Warning signs:** During manual testing, create two stores with different owners; if the slug-availability indicator always shows "disponível" for a slug that already belongs to the *other* store, this pitfall has been hit. [VERIFIED: read `supabase/migrations/0001_init_stores_rls.sql` and `src/lib/supabase/{client,server}.ts` directly]

### Pitfall 2: `generateStoreSlug`'s existing algorithm does not satisfy D-01 ("sem acento")
**What goes wrong:** Copying `src/lib/auth/actions.ts`'s `generateStoreSlug` regex (`.replace(/[^a-z0-9]+/g, "-")`) as the live-typing slugify logic will strip accented characters entirely rather than folding them to their unaccented equivalent — `"Chuteira Nike"` is fine, but `"Sapatênis São Paulo"` becomes `"sapat-nis-s-o-paulo"` instead of the expected `"sapatenis-sao-paulo"`.
**Why it happens:** The regex treats any non-ASCII-alphanumeric character (including `ã`, `ê`, `ç`, `õ`) as invalid and replaces it with a hyphen, rather than first normalizing it to its base Latin letter.
**How to avoid:** Extract a shared `slugify()` utility that first calls `input.normalize("NFD").replace(/[̀-ͯ]/g, "")` to fold diacritics, *then* applies the existing lowercase + non-alnum-to-hyphen + trim logic. Update `generateStoreSlug` to call this shared utility too, per CONTEXT.md's explicit warning against "dois algoritmos de slugify divergentes."
**Warning signs:** Type a store name/slug containing "ã", "ç", "é", "õ" during manual testing and check the resulting slug reads naturally (no dropped syllables, no doubled hyphens).

### Pitfall 3: TOCTOU race between the debounce check and the actual save
**What goes wrong:** The ~400ms debounce check happens before the user clicks "Salvar novo link" — in the (rare) window between the check and the save, another revendedor could claim the same slug. Without handling the DB-level `unique_violation`, the save would fail with a raw, unfriendly Postgres error.
**Why it happens:** The debounce check and the actual write are two separate round trips, not one atomic operation; the `UNIQUE` constraint is the *only* true source of truth, the RPC check is just a UX convenience.
**How to avoid:** Wrap the `updateStoreSlug` Server Action's Supabase call in error handling that specifically catches Postgres error code `23505` (unique_violation) and returns the same friendly "Este link já está em uso. Escolha outro." copy from the UI-SPEC, rather than a generic error.
**Warning signs:** Manual test: open two browser sessions as two different revendedores, both type the same available slug, both click Save within a second of each other — one should succeed, the other should get the friendly duplicate-slug message, never a raw stack trace or 500.

### Pitfall 4: Confirmation dialog closes but the slug save still fires optimistically
**What goes wrong:** If "Salvar novo link" is wired to submit the form directly and the `<dialog>` is only a visual overlay without gating the actual submit call, a user hitting Escape or clicking outside (native `<dialog>` `cancel` event) might not actually prevent the save if the submit logic isn't tied to the dialog's confirm action specifically.
**Why it happens:** Native `<dialog>` emits both a `close` event (any dismissal) and distinguishes `returnValue` for `<form method="dialog">` submissions — a common integration mistake is triggering the save on `close` instead of only on the explicit "Sim, trocar o link" button's click handler.
**How to avoid:** Trigger the actual `updateStoreSlug` Server Action call only from the "Sim, trocar o link" button's `onClick`, never from the dialog's generic `close`/`cancel` events (see Pattern 3 code example, which calls `onConfirm()` explicitly before `dialogRef.current?.close()`).
**Warning signs:** Press Escape or click the dialog backdrop while the confirmation is open, then verify the slug in the DB/UI did NOT change.

## Code Examples

### QR Code preview + download (client-side, no Route Handler)
```typescript
// Source: qrcode npm package README (npmjs.com/package/qrcode) — cross-referenced
// via WebSearch since direct WebFetch to npmjs.com returned HTTP 403 in this session
"use client";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCodePanel({ publicUrl }: { publicUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      // D-10: no logo compositing → default errorCorrectionLevel 'M' is sufficient,
      // 'H' is only needed when a logo will be overlaid in the center.
      QRCode.toCanvas(canvasRef.current, publicUrl, { width: 240, margin: 2 });
    }
  }, [publicUrl]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "vitrine-qrcode.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-[#F5F5F3] p-4">
      <canvas ref={canvasRef} />
      <button
        onClick={handleDownload}
        className="rounded-lg border border-[#0D3D2B] px-4 py-2 font-medium text-[#0D3D2B]"
      >
        Baixar PNG
      </button>
    </div>
  );
}
```

### Copy-to-clipboard (D-04/D-12/D-13)
```typescript
// Source: standard browser Clipboard API, no library needed
"use client";
import { toast } from "sonner";

async function handleCopy(publicUrl: string) {
  try {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copiado!");
  } catch {
    toast.error("Não foi possível copiar o link. Selecione e copie manualmente.");
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `window.showModal` polyfills / third-party modal libraries (e.g. `react-modal`) for accessible dialogs | Native `<dialog>` + `showModal()` | Baseline since March 2022 [CITED: web search cross-referencing MDN-adjacent sources] | No bundle cost, no dependency, correct accessibility semantics by default — appropriate given this project's explicit "no component registry" convention |
| Next.js implicit full-route caching by default (Next 14/15 pre-PPR) | Next 16 Cache Components: caching only applies when `cacheComponents: true` is set in `next.config.ts` **and** `"use cache"` is added per route/component [CITED: nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents] | Next.js 16 (per CLAUDE.md's own STACK.md summary) | Not directly relevant to *this* phase's implementation since this project's `next.config.ts` does not set `cacheComponents: true` and no `"use cache"` directive exists anywhere yet (confirmed by reading `next.config.ts` and grepping the codebase) — `/configuracoes` and the public `/loja/[slug]` route are both plain dynamic Server Components today, so D-04's "slug change breaks old link immediately, no stale cache" requirement is already satisfied with zero extra work |

**Deprecated/outdated:**
- None directly relevant to this phase's scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact debounce delay (~400ms per D-03) and the general "debounce client input, call Server Action via useTransition" pattern is presented as the standard community approach, but no single canonical Next.js doc endorses this precise combination — it is synthesized from several WebSearch results (Sanity/Next.js blog posts), not one authoritative source. | Architecture Patterns → Pattern 2 | Low — 400ms is already locked by D-03; the debounce *mechanism* itself has no serious alternative-approach risk, only implementation-detail variance (e.g. `setTimeout` vs a debounce library) |
| A2 | The recommendation that a `SECURITY DEFINER` function should live in the `public` schema (so it's callable via `supabase.rpc()`/PostgREST) is presented alongside a general Supabase troubleshooting-doc caveat that says "never expose SECURITY DEFINER functions via PostgREST in `public`" — reconciled here as: expose only if the function's return value is minimal (a boolean) and cannot leak sensitive data, which is a judgment call synthesized from the docs, not a verbatim quoted recommendation for this exact case. | Summary, Architecture Patterns → Pattern 1, Pitfall 1 | Medium — if this judgment is wrong, a security reviewer should re-examine whether `is_slug_available` should instead live in a non-exposed schema and be called through a Postgres-side-only path (e.g., invoked from within another SECURITY DEFINER function, never directly via RPC). Recommend the planner add a `checkpoint:human-verify` or a code-review pass specifically on this migration. |
| A3 | qrcode's browser bundle supports `toCanvas`/`toDataURL` client-side without any bundler configuration changes under Turbopack (Next 16's default bundler) — inferred from the package being described as isomorphic in its README/npm page summary, not independently smoke-tested against Turbopack in this research session. | Standard Stack, Code Examples | Low — if wrong, the fallback is trivial: generate the QR server-side via a small Route Handler using `toBuffer`/`toDataURL` (Node-only APIs, guaranteed to work), returned as a data URL to the client. This is explicitly left to "Claude's Discretion" in CONTEXT.md, so either path is an acceptable fix. |
| A4 | `lucide-react`'s "too-new" SUS flag from the automated legitimacy check is a false positive caused by frequent legitimate version releases, not a real hijack/typosquat risk — based on the package's 74M weekly downloads and established GitHub org, not an independent supply-chain audit. | Package Legitimacy Audit | Low-Medium — if wrong, a compromised `lucide-react` publish would affect only icon rendering (a purely visual, non-data-handling dependency) in this phase; still recommend the `checkpoint:human-verify` gate before install as a matter of protocol, not because of strong suspicion. |

**If this table is empty:** N/A — see entries above.

## Open Questions (RESOLVED)

1. **Should `is_slug_available` also be granted to the `anon` role?**
   - What we know: `/configuracoes` is only reachable by an authenticated revendedor (behind `requireCompletedOnboarding`), so `authenticated`-only grant is sufficient for this phase's UI.
   - What's unclear: Whether a future phase (e.g., a public "check if this vitrine name is available" marketing page) might want to call this same RPC unauthenticated.
   - Recommendation: Grant only to `authenticated` for this phase; broadening the grant later is a one-line migration if ever needed, and starting narrow is the safer default.

2. **Exact wording/UX for the slug format-invalid inline error vs. taken error** (explicitly left to implementation per CONTEXT.md's "Claude's Discretion" — copy already partially specified in UI-SPEC's Copywriting Contract: "Este link já está em uso. Escolha outro." for taken, "Use apenas letras, números e hífens (3 a 30 caracteres)." for invalid format).
   - What we know: UI-SPEC already locks both exact strings.
   - What's unclear: Whether the format error should show *before* or *only after* debounce settles (i.e., should format validation be instant/un-debounced while only the uniqueness check is debounced).
   - Recommendation: Validate format synchronously on every keystroke (cheap, Zod, no server round trip); debounce only the network-bound uniqueness check. This is the natural split and avoids debouncing something that doesn't need it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Next.js 16 runtime | ✓ (assumed dev environment matches Phase 1, not independently re-checked this session) | 20.9+ required by Next 16 | — |
| npm registry access | Installing `qrcode`, `lucide-react` | ✓ (confirmed — `npm view` succeeded for both packages during this research) | — | — |
| Supabase CLI / local Supabase | Writing the new migration (`0002_slug_availability_rpc.sql`) | Not independently re-verified this session (Phase 1 already used Supabase CLI for `0001_init_stores_rls.sql`) | — | If unavailable, the migration SQL can be applied directly via the Supabase Dashboard SQL editor as a fallback, same as any other migration |

**Missing dependencies with no fallback:** none identified.

**Missing dependencies with fallback:** Supabase CLI unavailability (fallback: Dashboard SQL editor) — low risk since Phase 1 already established this workflow successfully.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (confirmed in `package.json`/`vitest.config.ts`) |
| Config file | `vitest.config.ts` (environment: node, include: `tests/**/*.test.ts`, `@/` alias to `src/`) |
| Quick run command | `npx vitest run tests/settings/` (once created) or `npx vitest run <specific-file>` |
| Full suite command | `npm test` (runs `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| LOJA-02 | Slug format validation rejects <3 or >30 chars, invalid charset | unit | `npx vitest run tests/slug/validation.test.ts` | ❌ Wave 0 |
| LOJA-02 | Slugify correctly folds diacritics (`café` → `cafe`) | unit | `npx vitest run tests/slug/slugify.test.ts` | ❌ Wave 0 |
| LOJA-02 | `checkSlugAvailability` returns `available: false` for a slug owned by a different store (RLS cross-tenant regression guard — the single most important test in this phase) | integration (real Supabase test project, mirrors existing `tests/rls/isolation.test.ts` pattern) | `npx vitest run tests/settings/slug-availability.test.ts` | ❌ Wave 0 |
| LOJA-02 | `updateStoreSlug` surfaces a friendly error on `unique_violation` (23505), not a raw DB error | integration | `npx vitest run tests/settings/update-slug.test.ts` | ❌ Wave 0 |
| LOJA-03 | QR code component renders and produces a downloadable PNG data URL for a given public URL | unit (jsdom/canvas-mock or a pure-function test around the URL-building logic, since `qrcode` itself is already a tested upstream library — no need to re-test its internals) | `npx vitest run tests/settings/qr-code.test.ts` | ❌ Wave 0 |
| LOJA-04 | Copy button writes the exact public URL string to clipboard | unit (mock `navigator.clipboard`) | `npx vitest run tests/settings/copy-link.test.ts` | ❌ Wave 0 |
| Onboarding data edit (LOJA-01/WPP-01/WPP-02 revisit) | `saveStoreSettings` persists edited name/color/tagline/whatsapp/template, scoped by `owner_id` | integration | `npx vitest run tests/settings/store-settings-update.test.ts` | ❌ Wave 0 (mirrors existing `tests/onboarding/store-settings.test.ts` pattern closely — can largely be adapted) |

### Sampling Rate
- **Per task commit:** relevant single test file via `npx vitest run <file>`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/slug/slugify.test.ts` — covers LOJA-02 diacritic-folding correctness (new shared utility)
- [ ] `tests/slug/validation.test.ts` — covers LOJA-02 format validation (Zod schema)
- [ ] `tests/settings/slug-availability.test.ts` — covers LOJA-02's most critical regression: cross-tenant RLS isolation on the new RPC (should mirror the existing `tests/rls/isolation.test.ts` structure/fixtures)
- [ ] `tests/settings/update-slug.test.ts` — covers LOJA-02 race-condition/unique_violation handling
- [ ] `tests/settings/qr-code.test.ts` — covers LOJA-03
- [ ] `tests/settings/copy-link.test.ts` — covers LOJA-04
- [ ] `tests/settings/store-settings-update.test.ts` — covers the onboarding-data-revisit requirement (can adapt fixtures from existing `tests/onboarding/store-settings.test.ts`)
- [ ] `supabase/migrations/0002_slug_availability_rpc.sql` — new migration, not a test file but a required Wave 0 artifact before any of the above integration tests can run against a real Supabase test project

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|---------------------|
| V2 Authentication | No (new) | Already enforced by `requireCompletedOnboarding` at the route level, inherited from Phase 1 — no new auth surface introduced |
| V3 Session Management | No | No change to session handling in this phase |
| V4 Access Control | **Yes — central to this phase** | The new `is_slug_available` RPC is the one new access-control surface: it must be `SECURITY DEFINER` with a pinned `search_path`, granted only to `authenticated`, and must return **only a boolean** — never row data — to avoid becoming a cross-tenant data-exposure vector while still correctly bypassing RLS for its narrow purpose |
| V5 Input Validation | Yes | Zod schema for slug (charset `[a-z0-9-]`, length 3–30, no leading/trailing hyphen) validated both client-side (fast feedback) and server-side inside the Server Action (never trust client-only validation, matching the existing `onboardingSchema` convention) |
| V6 Cryptography | No | Not applicable — no new cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Cross-tenant data disclosure via an overly-broad RLS bypass (e.g., a public `SELECT *` policy "just to check slugs") | Information Disclosure | Narrowly-scoped `SECURITY DEFINER` function returning only a boolean, never full rows (Pattern 1, Pitfall 1) |
| SQL function search_path hijacking (a classically documented Postgres `SECURITY DEFINER` vulnerability class) | Elevation of Privilege | Pin `search_path = public, pg_temp` explicitly on the function definition, per Supabase's own RLS/security-definer guidance [CITED: supabase.com/docs/guides/database/postgres/row-level-security] |
| Slug-uniqueness race condition (TOCTOU) allowing two tenants to end up believing they hold the same slug | Tampering (data integrity) | The pre-existing DB-level `UNIQUE` constraint on `stores.slug` is the actual enforcement boundary; the RPC/debounce is UX-only. Server Action must catch `unique_violation` (23505) explicitly (Pitfall 3) |
| Clipboard-write failure on unsupported/insecure (non-HTTPS) contexts silently doing nothing | (not STRIDE — availability/UX robustness) | Wrap `navigator.clipboard.writeText` in try/catch and surface an explicit fallback error toast rather than a silent no-op (Code Examples → Copy-to-clipboard) |

## Sources

### Primary (HIGH confidence)
- Direct reading of this codebase's own source files: `src/lib/auth/actions.ts`, `src/lib/onboarding/actions.ts`, `src/lib/validation/onboarding.ts`, `src/lib/phone/normalize-br.ts`, `src/lib/supabase/{client,server}.ts`, `supabase/migrations/0001_init_stores_rls.sql`, `next.config.ts`, `src/middleware.ts`, `src/lib/auth/onboarding-guard.ts`, `src/app/(admin)/{dashboard,onboarding}/*` — all read in full this session
- `npm view qrcode version` / `npm view lucide-react version` / `npm view <pkg> scripts.postinstall` — live registry checks
- `gsd-tools query package-legitimacy check --ecosystem npm qrcode lucide-react` — automated legitimacy signals

### Secondary (MEDIUM confidence)
- [nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) — Next.js 16 Cache Components official docs, cross-referenced via WebSearch
- [nextjs.org/docs/app/api-reference/directives/use-cache](https://nextjs.org/docs/app/api-reference/directives/use-cache) — official `"use cache"` directive docs
- [supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security) — official Supabase RLS guide
- [supabase.com/docs/guides/troubleshooting/do-i-need-to-expose-security-definer-functions-in-row-level-security-policies-iI0uOw](https://supabase.com/docs/guides/troubleshooting/do-i-need-to-expose-security-definer-functions-in-row-level-security-policies-iI0uOw) — official Supabase troubleshooting doc on `SECURITY DEFINER` + RLS
- [npmjs.com/package/qrcode](https://www.npmjs.com/package/qrcode) — package README/API surface (WebFetch to this URL returned HTTP 403 in this session; information triangulated via WebSearch result summaries of the same page instead)
- Native `<dialog>` element behavior (Baseline since March 2022, `showModal()` focus-trap/Escape/`::backdrop` semantics) — triangulated across multiple independent WebSearch results, no single canonical source cited verbatim

### Tertiary (LOW confidence)
- The specific "debounce client input → Server Action via useTransition" combination pattern (WebSearch-only, no official Next.js doc found endorsing this exact combination) — see Assumption A1

## Metadata

**Confidence breakdown:**
- Standard stack (qrcode, lucide-react versions/legitimacy): HIGH — directly verified against npm registry this session
- Architecture / RLS cross-tenant pitfall: HIGH — derived from directly reading this project's own migration and Supabase client source files, not from external research
- Slugify diacritic-folding pitfall: HIGH — derived from directly reading `generateStoreSlug`'s source code
- SECURITY DEFINER RPC pattern details (exact grant scope, schema placement judgment): MEDIUM — synthesized from official Supabase docs plus reasoned judgment (see Assumption A2)
- Debounce/useTransition mechanism: MEDIUM-LOW — general community pattern, not a single canonical source (see Assumption A1)
- Native `<dialog>` recommendation: MEDIUM — cross-referenced across several independent web sources, consistent with each other

**Research date:** 2026-07-12
**Valid until:** 2026-08-11 (30 days — stable domain; the one fast-moving element, Next.js 16 Cache Components, is already resolved as "not applicable to this phase" since no caching is configured in this codebase)
