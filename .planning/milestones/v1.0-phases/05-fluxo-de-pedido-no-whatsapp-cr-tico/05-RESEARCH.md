# Phase 5: Fluxo de Pedido no WhatsApp (CRÍTICO) - Research

**Researched:** 2026-07-14
**Domain:** Next.js 16 App Router (dynamic product detail route), client-side interaction guards (size selection, keyboard/pointer edge cases), fire-and-forget Server Actions, Supabase RLS (first anon-write policy in the project), WhatsApp deep-link construction
**Confidence:** HIGH (schema/architecture, verified directly against existing codebase) / MEDIUM (browser-platform behavior, cross-checked against MDN + official docs) / LOW (in-app webview quirks — flagged explicitly, resolved only by the mandatory manual device matrix)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Onde a seleção de tamanho acontece**
- **D-01:** Página de detalhe do produto dedicada (`/loja/[slug]/[produto]`), não modal/accordion inline no grid. O card do grid (`product-card.tsx`) passa a ser um link que navega para essa página. Justificativa: mais espaço pra fotos grandes, URL compartilhável do produto específico, e evita a complexidade de bottom-sheet responsivo no mobile.

**Comportamento do botão "Pedir agora"**
- **D-02:** O botão é **sempre clicável** (nunca fica em estado `disabled`/cinza). Se nenhum tamanho estiver selecionado no momento do clique, dispara shake animation + tooltip "Selecione um tamanho" e **nunca** abre o WhatsApp com mensagem incompleta. Confirma explicitamente: não usar o padrão "desabilitado até selecionar".
- **D-03:** Ao clicar com sucesso (tamanho já selecionado), o link `<a href="wa.me/...">` real abre o WhatsApp e a página da vitrine permanece exatamente como estava — **sem** toast/confirmação adicional. O próprio WhatsApp abrindo já é a confirmação visual suficiente.
- **D-04:** Tamanhos esgotados seguem o Success Criteria #2 do ROADMAP: visual riscado + `pointer-events: none`, com revalidação no momento do clique (incluindo clique rápido/duplo e Enter no teclado) — nenhuma decisão nova aqui além do que já está travado no ROADMAP.

**Limitação técnica crítica: foto do produto na mensagem**
- **D-05 (constraint técnica, não decisão de produto):** O link `wa.me` só aceita texto — é tecnicamente impossível anexar uma imagem automaticamente via deep link, em qualquer plataforma. Limitação da API do WhatsApp, não do código do Vitrinoo.
- **D-06:** A mensagem de texto inclui a **URL direta da foto de capa** (ex: `Foto: https://.../produto.jpg`). O WhatsApp gera preview automático a partir do link. Resolve a ambiguidade de variação exata do produto (cor/edição) quando múltiplos produtos compartilham nome de modelo.
- **D-07:** O botão "Copiar mensagem" (fallback) copia o **mesmo texto** que seria enviado via wa.me — incluindo a URL da foto — com toast "Mensagem copiada!". Não copia número de telefone separadamente. Não tenta copiar a imagem binária via Clipboard API.
- **D-08:** O botão "Copiar mensagem" é **sempre visível** ao lado/abaixo do "Pedir agora" — não é fallback condicional detectando falha do wa.me.

**Registro do clique (analytics)**
- **D-09:** Tabela nova e mínima (`order_clicks`: product_id, size, timestamp, scoped por RLS ao owner via join em products→stores) via Server Action fire-and-forget que não bloqueia a abertura do link do WhatsApp. Sem UI/dashboard nesta fase — só captura dado bruto para a Fase 6.
- **D-10:** O disparo do registro de clique deve ser fire-and-forget de verdade: a navegação para o link `wa.me` (via `<a href>` real, nunca `window.open`) não pode ser bloqueada nem atrasada esperando a Server Action de analytics responder.

### Claude's Discretion
- Estrutura exata da tabela `order_clicks` (nomes de coluna, índices), desde que capture product_id + size + timestamp e respeite RLS multi-tenant.
- Estilo visual exato do shake animation e do tooltip (mobile-first, consistente com o resto da vitrine pública).
- Mecanismo exato de geração da URL pública da foto de capa (reaproveitar helper existente do Storage da Fase 3, se houver).

### Deferred Ideas (OUT OF SCOPE)
- Dashboard/UI de métricas consumindo `order_clicks` — pertence à Fase 6. Esta fase só cria a tabela e o registro fire-and-forget.
- Cópia de imagem binária via Clipboard API no botão "Copiar mensagem" — descartado por cobertura de navegador inconsistente.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PED-01 | Cliente precisa selecionar um tamanho disponível antes do botão "Pedir agora" ficar ativo/clicável (via shake+tooltip guard, nunca `disabled`) | See "Architecture Patterns → Pattern 3 (Order button guard)" and Code Examples — the `preventDefault`-gated `<a>` pattern satisfies this without ever disabling the element |
| PED-02 | Tamanhos esgotados não são clicáveis/selecionáveis (visual riscado, `pointer-events: none`) | See "Common Pitfalls → Pitfall 1" (pointer-events does not block keyboard) and "Architecture Patterns → Pattern 2 (Size pill guard)" |
| PED-03 | Botão "Pedir agora" abre o WhatsApp com mensagem pré-preenchida (modelo, solado, tamanho, preço), corretamente codificada via `encodeURIComponent`, testado com acentos | See "Architecture Patterns → Pattern 4 (Message template interpolation)" and "Validation Architecture" — this is the one PED requirement with strong automatable unit-test coverage (pure string function, no DOM needed) |
| PED-04 | Se o cliente clicar em "Pedir agora" sem selecionar tamanho, exibe shake animation + tooltip em vez de abrir mensagem incompleta | See "Architecture Patterns → Pattern 3" and "Code Examples → Shake animation restart" |
</phase_requirements>

## Summary

This phase adds one net-new route (`/loja/[slug]/[produto]`), one net-new database table (`order_clicks`), and one net-new RLS policy exposing `store_settings` (WhatsApp number + message template) to the anonymous role — the project's **first ever anonymous-writable table**. No new npm packages are required: every technical need (clipboard fallback, toasts, icons, phone number, price formatting, `useTransition` fire-and-forget) is already satisfied by dependencies and helpers installed in Phases 1–4. The bulk of the engineering risk in this phase is not "which library" but **getting several small, easy-to-get-wrong interaction details right**: `pointer-events: none` does not block keyboard Enter/Space activation (confirmed via MDN); a Server Action's underlying fetch can be cancelled by same-tab page unload unless the CTA opens in a new tab; chaining `.select()` on the `order_clicks` insert will silently misbehave because the anon role has no read policy on that table; and the always-clickable "Pedir agora" button must gate navigation via a *conditional `preventDefault()` inside `onClick`*, not by removing/disabling the `href` — the distinction matters because CLAUDE.md's hard "always a real `<a href>`, never `window.open`" rule is about *how navigation is triggered*, not about whether an `onClick` handler may exist at all.

**A schema migration is required for this phase** (continuing the numbered migration sequence, e.g. `0005_order_clicks_and_public_whatsapp.sql`): it must (1) create `order_clicks` with RLS (owner-scoped `SELECT`, anon-scoped `INSERT` with a validating `WITH CHECK`), and (2) add a `SELECT` policy exposing `store_settings` to `anon`, scoped more tightly than the existing `stores` policy (restricted to stores that have at least one published product, since a WhatsApp number is more sensitive than a store name/logo). This migration must land in Wave 1 with a `[BLOCKING]` push step, mirroring every prior phase's pattern (01-02, 03-01, 04-01 all opened with schema+RLS+push before any UI work).

**Primary recommendation:** Build one new Client Component (`ProductOrderPanel` or similar) that owns `selectedSize` state and renders both the size pills and the two CTAs (`<a href="wa.me/...">` "Pedir agora" + `<button>` "Copiar mensagem"), fed entirely by props from a new fully-dynamic Server Component page (no client-side data fetching, matching the Phase 4 "no `use cache`" convention). Reuse `copyText()` (`src/lib/clipboard.ts`), `formatBRLPriceInput()` (`src/lib/currency/brl.ts`), and the `useTransition` fire-and-forget idiom already used in 14 files across this codebase. Extract two small new pure-function modules (message template interpolation + wa.me URL builder) so PED-03's encoding requirement is unit-testable in the existing Node/Vitest setup without needing jsdom.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Size selection state + pointer/keyboard guard | Browser/Client | Frontend Server (SSR) | Interaction state is inherently client-side; the server supplies the fresh `available` snapshot at render time that the client guards against |
| WhatsApp message construction + `encodeURIComponent` | Browser/Client | — | Depends on the client-only `selectedSize` state, so must be (re)computed client-side even though all inputs are server-fetched |
| WhatsApp navigation (`<a href="wa.me/...">`) | Browser/Client | — | Pure browser-native anchor navigation; no server round-trip in the critical path |
| Click analytics (`order_clicks` insert) | API/Backend (Server Action) | Database/Storage | Server Action is the boundary; Postgres RLS is the actual security enforcement, not app code |
| Stock availability (`product_sizes`) | Database/Storage | Frontend Server (SSR) | EXISTS-derived source of truth (Phase 3 pattern); SSR fetch delivers a fresh-as-of-page-load snapshot, no client refetch |
| Product detail rendering (photos/desc/price) | Frontend Server (SSR) | CDN/Static (Supabase Storage) | Fully dynamic Server Component, same "no `use cache`" discipline as the rest of the storefront; images served from Storage's public CDN URLs |
| Clipboard fallback ("Copiar mensagem") | Browser/Client | — | `navigator.clipboard` API is client-only; no server involvement |
| Public read/write security boundary | Database/Storage (RLS) | API/Backend | Anon key is public in the client bundle — RLS, not app-layer checks, is the real boundary for both the new anon `SELECT` (store_settings) and anon `INSERT` (order_clicks) |

## Standard Stack

### Core

No new core dependencies. This phase is built entirely on packages already installed and verified in Phases 1–4.

| Library | Version (installed) | Purpose in this phase | Why no new package needed |
|---------|---------|---------|--------------|
| next | 16.2.10 | New dynamic route `/loja/[slug]/[produto]`, Server Actions | Same App Router conventions already used by `/loja/[slug]` |
| react / react-dom | 19.2.4 | `useState`/`useTransition` in the new Client Component | Same hooks already used in `LoadMoreButton`, `SizeGrid` |
| @supabase/supabase-js, @supabase/ssr | 2.110.2 / 0.12.0 | New queries + new `order_clicks` insert | Existing `createClient()` helper works unchanged (anon role auto-resolves on the public route, exactly as documented in `loja/[slug]/page.tsx`) |
| libphonenumber-js | 1.13.8 | N/A — **not re-invoked** | `whatsapp_e164` is already normalized once at onboarding (Phase 1); Phase 5 only *reads* `store_settings.whatsapp_e164`, never re-normalizes (see Pitfall 9 below and the existing warning comment in `src/lib/phone/normalize-br.ts`) |
| sonner | 2.0.7 | "Mensagem copiada!" toast on successful clipboard fallback | `<Toaster>` already mounted globally in `src/app/layout.tsx` |
| lucide-react | 1.24.0 | Icons for "Copiar mensagem" (e.g. `Copy`/`ClipboardCopy`), back-link (`ChevronLeft`) | Already a dependency; **no literal WhatsApp brand glyph exists in lucide** (it's a generic outline set, not a brand-icon library) — use a generic chat/message icon or a small inline SVG rather than adding a new icon package for a cosmetic logo |
| clsx + tailwind-merge | 2.1.1 / 3.6.0 | Conditional className for size-pill states (available/sold-out/selected) | Same `cn()` helper pattern already defined inline in `size-grid.tsx` |

### Supporting

None needed. Specifically **rejected** additions (see Don't Hand-Roll below for rationale): a tooltip library (Radix/shadcn), an analytics SDK, a clipboard-fallback library — all would be over-engineering for what this phase actually needs.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Action (`useTransition`, fire-and-forget) for `order_clicks` | Dedicated Route Handler + `fetch(url, {keepalive:true})` or `navigator.sendBeacon()` | More resilient against same-tab page-unload cancellation, but introduces the project's first Route Handler for a mutation, breaking the established "Server Actions only" convention. See Open Question 1. |
| Raw product `id` (UUID) as the `[produto]` route segment | A new per-product `slug` column (reusing `src/lib/slug/slugify.ts`) | Prettier, more shareable URL, but requires a new migration + uniqueness scoping per store + slug-generation UI — not requested anywhere in CONTEXT.md and disproportionate to what D-01 actually asks for ("shareable URL", which a UUID path already satisfies literally). See Open Question 2. |
| `target="_blank" rel="noopener noreferrer"` on the wa.me anchor | Same-tab navigation (no `target`) | New tab keeps the vitrine open (better UX, avoids same-tab-unload race for the analytics beacon) but in-app webview (Instagram/WhatsApp) behavior for `target="_blank"` is unconfirmed by public research — must be validated in the mandatory manual matrix before locking this in. |

**Installation:** None. No `npm install` needed for this phase.

**Version verification:** N/A — no new packages. Existing versions already verified against the npm registry in `01-RESEARCH.md`/`03-RESEARCH.md`/`STACK.md` and confirmed still installed via `package.json` (read directly this session): `next@16.2.10`, `react@19.2.4`, `@supabase/supabase-js@2.110.2`, `libphonenumber-js@1.13.8`, `sonner@2.0.7`, `lucide-react@1.24.0`.

## Package Legitimacy Audit

**N/A — this phase introduces zero new external packages.** All functionality is built from libraries already installed and legitimacy-audited in prior phases (see `03-RESEARCH.md` for `lucide-react`'s prior audit, referenced again in STATE.md: "lucide-react aprovado no gate de legitimidade (T-02-SC)"). The Package Legitimacy Gate protocol does not apply; no table is fabricated here since there is nothing to audit.

## Architecture Patterns

### System Architecture Diagram

```
Cliente final (mobile browser / Instagram webview / WhatsApp webview)
        │
        │ 1. Tap product card on /loja/[slug]  (existing Phase 4 grid)
        ▼
┌─────────────────────────────────────────────────────────────┐
│ GET /loja/[slug]/[produto]  — NEW, fully dynamic SSR         │
│  (no "use cache", same discipline as /loja/[slug])           │
│                                                               │
│  1. Resolve store by slug            (existing pattern)      │
│  2. Resolve product by id, scoped to  store_id + status=     │
│     'published' + sold-out-hide visibility rule → notFound() │
│     if absent/invisible (reuses isVisible() from public-list) │
│  3. Fetch product_sizes (available per size)                 │
│  4. Fetch product_photos (ordered, full gallery not just cover)│
│  5. Fetch store_settings (whatsapp_e164, message_template)    │
│     — NEW anon RLS policy required (see migration below)      │
│  6. Resolve cover photo public URL (shared helper, NEW)        │
└───────────────────────┬───────────────────────────────────────┘
                         │ props (sizes, phone, template, product data)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ <ProductOrderPanel>  — NEW Client Component                  │
│                                                               │
│   selectedSize state ──► size pills                          │
│                            │  onClick/Enter → guard:          │
│                            │  if (!available) return;         │
│                            ▼                                  │
│                     [selectedSize updates]                    │
│                            │                                   │
│              ┌─────────────┴──────────────┐                   │
│              ▼                             ▼                   │
│   <a href={wa.me link or "#"}>    <button> Copiar mensagem     │
│    onClick:                        onClick:                    │
│     no size? preventDefault()        copyText(message)         │
│       + shake + tooltip              → toast on success/fail   │
│     size selected? let browser                                 │
│       navigate natively (no          (always visible, D-08 —   │
│       preventDefault) +              not conditional on wa.me   │
│       fire-and-forget                failure detection)         │
│       logOrderClick() via                                       │
│       useTransition (ignored                                    │
│       isPending, D-10)                                           │
└──────────────┬────────────────────────────────────────────────┘
               │ (non-blocking, errors swallowed server-side)
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Server Action: logOrderClick(storeId, productId, size)        │
│  — anon role on the public route, bare .insert() (NO .select) │
│  — RLS: public_insert_order_clicks (anon, WITH CHECK only)     │
└───────────────────────┬─────────────────────────────────────┘
                         ▼
                 order_clicks table (Postgres)
                 — read later by Phase 6's dashboard (owner-scoped SELECT)

Meanwhile, the <a href> click also triggers the browser's OWN native
navigation to https://wa.me/<digits>?text=<encoded message> — this never
waits on the Server Action above (D-10).
```

### Recommended Project Structure

```
src/app/loja/[slug]/[produto]/
├── page.tsx                    # NEW — Server Component, fully dynamic (no "use cache")
└── product-order-panel.tsx     # NEW — Client Component: size pills + Pedir Agora + Copiar mensagem

src/lib/products/
├── public-detail.ts            # NEW — queryPublicProductDetail(), mirrors public-list.ts
├── order-clicks-actions.ts     # NEW — "use server" logOrderClick(), public/anon-callable (mirrors public-actions.ts's separation rule)
└── public-list.ts              # MODIFIED — export isVisible() (currently private) for reuse by public-detail.ts

src/lib/whatsapp/
└── order-message.ts            # NEW — pure functions: interpolateMessageTemplate(), buildWhatsAppUrl()

src/lib/storage/
└── product-image-url.ts        # NEW — getProductImagePublicUrl(), consolidates the repeated
                                 #        supabase.storage.from("product-images").getPublicUrl(...) one-liner
                                 #        (currently duplicated in page.tsx + public-actions.ts)

supabase/migrations/
└── 0005_order_clicks_and_public_whatsapp.sql   # NEW — order_clicks table + RLS, store_settings anon SELECT
```

### Pattern 1: Fully dynamic product detail Server Component (extends Phase 3/4 conventions)

**What:** `page.tsx` resolves `{ slug, produto }` from `params` (a `Promise`, per Next.js 16), fetches store → product → sizes/photos/settings using the **same two-query-plus-in-memory-join** style already established in `queryProducts`/`queryPublicProducts`, never a Supabase embed.
**When to use:** Always, for this route — matching the "no `use cache`" discipline that already guarantees VITR-03's stock freshness project-wide.
**Example:**
```tsx
// Source: existing src/app/loja/[slug]/page.tsx pattern (verified in this codebase)
// + Next.js 16 official docs (nextjs.org/docs/app/api-reference/file-conventions/page)
type PageProps = {
  params: Promise<{ slug: string; produto: string }>;
};

export default async function ProdutoDetailPage({ params }: PageProps) {
  const { slug, produto } = await params;
  const supabase = await createClient();

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();
  if (!store) notFound();

  const detail = await queryPublicProductDetail(supabase, store.id, produto);
  if (!detail) notFound(); // covers: not found, not published, AND hidden by sold-out-visibility rule
  // ...
}
```
**Why `notFound()` must also cover the sold-out-visibility rule, not just `status='published'`:** Phase 4 established that a product can be hidden from the grid via `hide_when_sold_out`/`hide_sold_out_default` (D-09/D-10/D-11) even though it's technically `published`. If the detail page only checks `status='published'` and ignores this rule, a shared/bookmarked product link would let a customer bypass the hiding feature entirely — an inconsistency that undermines the whole point of that Phase 4 feature. `queryPublicProductDetail` must reuse the exact same `isVisible()` predicate already implemented (and currently un-exported) in `src/lib/products/public-list.ts`.

### Pattern 2: Size pill guard (defense-in-depth beyond `pointer-events: none`)

**What:** Every size pill is a real `<button type="button">` (matching the admin `SizeGrid` precedent exactly) whose `onClick` early-returns when the size is unavailable — this single guard covers **both** mouse clicks **and** keyboard Enter/Space activation, because native `<button>` elements dispatch the same `click` event for both interaction types.
**When to use:** For every size pill in the new public size selector.
**Example:**
```tsx
// Pattern verified against src/app/(admin)/produtos/size-grid.tsx (existing button-per-pill precedent)
function handleSelectSize(size: number, available: boolean) {
  if (!available) return; // revalidation at click time (Success Criteria #2) —
                           // catches keyboard Enter/Space, which pointer-events:none does NOT block
  setSelectedSize(size);
}

<button
  type="button"
  onClick={() => handleSelectSize(size, available)}
  aria-pressed={selectedSize === size}
  tabIndex={available ? 0 : -1} // complementary: removes sold-out pills from natural Tab order
                                  // (does not replace the guard above — MDN confirms Tab can still
                                  // reach a pointer-events:none element unless removed from tab order)
  className={cn(
    "min-h-11 min-w-11 rounded-lg border text-base transition",
    !available && "pointer-events-none text-[#6B6B6B] line-through opacity-60",
    selectedSize === size && "border-[#00C46A] bg-[#00C46A] text-white"
  )}
>
  {size}
</button>
```
**Note:** This is a *distinct* interaction from clicking "Pedir agora" with no size selected (Pattern 3) — clicking a sold-out pill silently no-ops (no shake/tooltip required by the locked decisions); only the "Pedir agora with nothing selected" case triggers shake+tooltip.

### Pattern 3: Always-clickable order button — conditional `preventDefault`, never `disabled`, never a JS-driven navigation

**What:** The anchor's `href` always resolves to *something real* (either the full wa.me URL when a size is selected, or `"#"` when not) so the element remains a properly focusable, keyboard-activatable link at all times (D-02's "always clickable" requirement, taken literally). The `onClick` handler decides whether to let the browser's native navigation proceed or to block it — this is **not** the same thing as using `window.open()`/`router.push()` to *drive* navigation, which is what CLAUDE.md's hard rule actually forbids. The distinction: when a size *is* selected, no `preventDefault()` is called, so the navigation that happens is the browser's own native anchor-click handling — exactly what makes `<a href>` reliable inside in-app webviews.
**When to use:** The "Pedir agora" CTA.
**Example:**
```tsx
// Source: derived from CLAUDE.md's locked wa.me rules + D-02/D-03/D-04/D-10; no direct
// codebase precedent exists yet (first WhatsApp CTA in the project) — this is the
// single most load-bearing pattern in this phase, verify carefully in code review.
const [shakeKey, setShakeKey] = useState(0);
const [showTooltip, setShowTooltip] = useState(false);

const waLink = selectedSize
  ? buildWhatsAppUrl(phoneE164, buildOrderMessage(messageTemplate, { ...product, tamanho: selectedSize, fotoUrl: coverPhotoUrl }))
  : "#"; // never a real wa.me URL until a size exists — also protects the
         // "long-press → open in new tab" mobile gesture, which bypasses onClick/preventDefault entirely

function handleOrderClick(e: React.MouseEvent<HTMLAnchorElement>) {
  if (!selectedSize) {
    e.preventDefault();
    setShakeKey((k) => k + 1);
    setShowTooltip(true);
    return;
  }
  // size selected: do NOT preventDefault — let the browser's native <a> navigation proceed unmodified
  startTransition(() => {
    logOrderClick(storeId, productId, selectedSize).catch(() => {}); // fire-and-forget (D-10); isPending is
                                                                       // intentionally never read/used to gate the UI
  });
}

<a
  href={waLink}
  target="_blank"
  rel="noopener noreferrer"
  onClick={handleOrderClick}
  key={shakeKey}                 // forces remount → restarts the CSS animation even on rapid repeated invalid clicks
  className={shakeKey > 0 ? "shake" : undefined}
>
  Pedir agora
</a>
```
**Why `target="_blank"`:** Pairing it here serves two purposes simultaneously — (1) it keeps the vitrine tab alive in the background so the fire-and-forget Server Action's underlying fetch is never cancelled by a same-tab page-unload race (a real risk: Server Actions ride on an internal fetch that developers cannot mark `keepalive`), and (2) it lets the customer return to the catalog after WhatsApp opens. **This must be confirmed in the mandatory manual device/webview matrix** — public research found no definitive answer for how `target="_blank"` behaves inside the Instagram/WhatsApp in-app browsers specifically (see Open Question 1 and Common Pitfall 5).

### Pattern 4: Message template interpolation (pure function, unit-testable)

**What:** A pure function that replaces the four locked placeholders (`{modelo}`, `{solado}`, `{tamanho}`, `{preço}`, defined in `src/lib/validation/onboarding.ts`) in the store's `message_template`, then appends the cover-photo URL line, then hands the *entire* composed string to `encodeURIComponent` exactly once.
**When to use:** Building the wa.me `text` param.
**Example:**
```ts
// src/lib/whatsapp/order-message.ts
// Source: template + placeholders verified directly against
// src/lib/validation/onboarding.ts (DEFAULT_MESSAGE_TEMPLATE, REQUIRED_TEMPLATE_PLACEHOLDERS)
export function interpolateMessageTemplate(
  template: string,
  vars: { modelo: string; solado: string; tamanho: string; preco: string }
): string {
  return template
    .replaceAll("{modelo}", vars.modelo)
    .replaceAll("{solado}", vars.solado)
    .replaceAll("{tamanho}", vars.tamanho)
    .replaceAll("{preço}", vars.preco); // note: literal "ç" — matches REQUIRED_TEMPLATE_PLACEHOLDERS exactly
}

export function buildOrderMessage(
  template: string,
  vars: { modelo: string; solado: string; tamanho: string; preco: string; fotoUrl: string | null }
): string {
  const base = interpolateMessageTemplate(template, vars);
  return vars.fotoUrl ? `${base}\n\nFoto: ${vars.fotoUrl}` : base;
}

export function buildWhatsAppUrl(phoneE164Digits: string, message: string): string {
  // Encode ONCE, over the fully-composed string (photo URL included) — never
  // encode the template and the photo URL separately (CLAUDE.md hard rule).
  return `https://wa.me/${phoneE164Digits}?text=${encodeURIComponent(message)}`;
}
```
**Critically:** `{preço}` interpolates to the *raw formatted number without a currency prefix* (e.g. `"199,90"` via the already-existing `formatBRLPriceInput()`), never the full `"R$ 199,90"` string — because `DEFAULT_MESSAGE_TEMPLATE` already hardcodes `"Preço: R$ {preço}"` as static text. Using `formatBRLPrice()` (which itself prepends "R$") here would double the currency prefix for any revendedor who keeps the default template. See Pitfall 7.

### Anti-Patterns to Avoid
- **Disabling the "Pedir agora" button when no size is selected:** Explicitly forbidden by D-02. Use the `preventDefault`-guard pattern above instead.
- **`window.open()` or `router.push()` for the wa.me navigation:** Forbidden by CLAUDE.md (in-app webview handoff reliability). The conditional-`preventDefault` pattern above is not this anti-pattern — it still lets the browser's native `<a>` click drive navigation when valid.
- **Chaining `.select()`/`.single()` after the `order_clicks` insert:** The anon role has no `SELECT` policy on this table (by design) — chaining `.select()` will make the call appear to fail even though the row was persisted (see Pitfall 2).
- **A second, divergent public product-detail query function:** Must reuse `isVisible()` from `public-list.ts`, never re-derive the sold-out-hide predicate inline in the new route.
- **Re-normalizing the WhatsApp phone number at click time:** `whatsapp_e164` is already normalized once at onboarding save (Phase 1) — Phase 5 only reads it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clipboard copy fallback | A new clipboard utility | `copyText()` in `src/lib/clipboard.ts` (already exists, already unit-tested via `vi.stubGlobal("navigator", ...)` in `tests/settings/copy-link.test.ts`) | Exact same contract D-07 needs (pure boundary, returns boolean, no toast baked in) — this is a direct reuse, not a new build |
| Price formatting for the message | A second BRL-to-string formatter | `formatBRLPriceInput()` in `src/lib/currency/brl.ts` | Already produces exactly the `"199,90"` shape the default template's `"R$ {preço}"` expects |
| Fire-and-forget Server Action invocation | A custom debounce/queue mechanism | `useTransition`/`startTransition` (already the codebase's universal pattern, used in 14 files) | Officially the documented Next.js pattern for "invoke a Server Action outside forms/buttons... without blocking UI rendering" |
| Tooltip ("Selecione um tamanho") | Radix UI / shadcn Tooltip (not installed) | A small conditionally-rendered `<div>` + Tailwind, shown/hidden via local state with a `setTimeout` auto-dismiss | A static, ephemeral text bubble is not a positioning-aware tooltip use case — pulling in a whole primitives library for this is disproportionate, and this codebase has zero Radix/shadcn dependencies today |
| WhatsApp brand icon | A new icon package (e.g. `simple-icons`) just for the logo glyph | A generic `lucide-react` chat icon, or a small inline SVG | Cosmetic only; not worth a new dependency for a single glyph |
| Cover photo public URL resolution | A fourth inline copy-paste of `supabase.storage.from(...).getPublicUrl(...)` | Extract the existing repeated one-liner (already duplicated in `page.tsx` + `public-actions.ts`) into `getProductImagePublicUrl()` | Satisfies the CONTEXT.md discretion note directly ("reaproveitar helper existente... se houver") — since none exists yet, this phase should create the one obvious extraction point rather than adding a 4th copy |

**Key insight:** This phase's risk is not "what to build" (everything needed already exists in the codebase or the standard web platform) — it's "getting the interaction edge cases right." Resist the urge to add dependencies for the tooltip/shake/clipboard pieces; every one of them is a small, already-precedented pattern in this exact codebase or a few lines of platform-native code.

## Common Pitfalls

### Pitfall 1: `pointer-events: none` does not block keyboard Enter/Space activation
**What goes wrong:** A sold-out size pill styled with `pointer-events: none` still receives focus via Tab and still fires its `click` handler when the user presses Enter or Space, because `pointer-events` only affects pointer (mouse/touch) event dispatch, not keyboard-triggered clicks or focusability.
**Why it happens:** `pointer-events` is a CSS painting/hit-testing property, not an accessibility/focus property — this is exactly why the ROADMAP explicitly calls out "incluindo... Enter no teclado" as a required revalidation case.
**How to avoid:** Always pair the CSS with an explicit `if (!available) return;` guard inside the `onClick` handler (Pattern 2) — this is not optional polish, it's the only thing that actually enforces PED-02 for keyboard users.
**Warning signs:** A code review that only checks "is `pointer-events-none` applied to sold-out pills" and stops there, without checking the click handler's logic.

### Pitfall 2: Chaining `.select()` after the anon `order_clicks` insert
**What goes wrong:** `supabase.from("order_clicks").insert({...}).select()` (or `.single()`) asks PostgREST to return the inserted row, which requires a matching `SELECT` RLS policy for the `anon` role. Since `order_clicks` deliberately has **no** `SELECT` policy for `anon` (customers should never read click analytics), the call will error out even though the `INSERT` itself succeeded.
**Why it happens:** Only `WITH CHECK` applies to `INSERT` policies in Postgres RLS — but the client library's default `return=representation` behavior when `.select()` is chained still needs read access to build its response.
**How to avoid:** The `logOrderClick` Server Action must call a bare `.insert({...})` (no `.select()`, no `.single()`) and only inspect the `error` field.
**Warning signs:** Server logs full of "order click failed" errors while the `order_clicks` table is actually filling up correctly.

### Pitfall 3: Encoding the photo URL and the template text separately
**What goes wrong:** If the photo URL line is appended *after* calling `encodeURIComponent` on the interpolated template (or vice versa), the result is either double-encoded or partially encoded — this is the exact "codificação dupla ou saída parcialmente codificada" bug the CLAUDE.md already warns about, extended to the new photo-URL-in-message requirement (D-06).
**Why it happens:** It's tempting to think a URL embedded inside the message needs "special" encoding treatment; it doesn't — the whole composed message (template + photo line) is just plain text from `encodeURIComponent`'s perspective.
**How to avoid:** Compose the *entire* final message string first (`buildOrderMessage`), then call `encodeURIComponent` exactly once over that whole string (`buildWhatsAppUrl`) — never encode a sub-piece separately.
**Warning signs:** A pasted WhatsApp message showing `%20` or `%C3%A3` literally instead of a space or "ã".

### Pitfall 4: Restarting the shake animation on rapid repeated invalid clicks
**What goes wrong:** Toggling a CSS class that's already applied (e.g., `setIsShaking(true)` when it's already `true`) does not restart a CSS `animation` — the second and subsequent rapid clicks on "Pedir agora" (explicitly named in Success Criteria #2's "clique rápido" case) produce no visible feedback.
**Why it happens:** CSS animations only (re)start when the animated element is newly created/attached, or when the animation-triggering class transitions from absent to present across a browser paint.
**How to avoid:** Use a numeric counter in state (`shakeKey`) and set it as the element's `key` prop — incrementing it on every invalid click forces React to remount the DOM node, guaranteeing the animation restarts every time, including on rapid repeated clicks (see Code Example in Pattern 3).
**Warning signs:** Manual testing shows the shake works once, then appears "stuck"/absent on the second rapid click.

### Pitfall 5: Fire-and-forget Server Action cancelled by same-tab page unload
**What goes wrong:** If the wa.me anchor navigates in the *same tab* (no `target="_blank"`), the browser may abort the in-flight fetch underlying the `logOrderClick` Server Action call when the document starts unloading, silently dropping the analytics event.
**Why it happens:** Server Actions invoked from Client Components ride on Next.js's internal RSC fetch mechanism, which the developer cannot mark with `keepalive: true` (unlike a raw `fetch()` call) — this is exactly the class of problem `navigator.sendBeacon()`/`fetch(..., {keepalive:true})` were invented to solve.
**How to avoid:** Pair the anchor with `target="_blank" rel="noopener noreferrer"` so the originating tab/document is never unloaded (Pattern 3). If the mandatory device matrix reveals `target="_blank"` misbehaves inside the Instagram/WhatsApp in-app browsers, fall back to same-tab navigation and accept some fraction of undercounted clicks as an explicit MVP tradeoff (D-09 already frames this analytics table as "raw capture, no dashboard yet").
**Warning signs:** `order_clicks` row counts noticeably lower than manually-observed WhatsApp opens during UAT, specifically on desktop browsers (mobile app-handoff is less prone to this since the browser tab is typically backgrounded, not destroyed).

### Pitfall 6: `navigator.clipboard.writeText()` losing "transient user activation"
**What goes wrong:** The Clipboard API requires the call to happen within a recent, direct user-gesture context. If the "Copiar mensagem" click handler `await`s something else (e.g., a Server Action call) *before* calling `copyText()`, the browser may reject the clipboard write as no longer having valid user activation.
**Why it happens:** This is a deliberate anti-abuse security feature of the Clipboard API (confirmed via web.dev/MDN).
**How to avoid:** Call `copyText()` synchronously as the first thing in the click handler — do not `await` anything upstream of it.
**Warning signs:** Clipboard copy works in manual testing when clicked normally, but silently fails after adding an unrelated `await` earlier in the same handler during a later refactor.

### Pitfall 7: Double-prefixing the currency symbol in `{preço}`
**What goes wrong:** `DEFAULT_MESSAGE_TEMPLATE` already hardcodes `"Preço: R$ {preço}"`. If the interpolation function uses `formatBRLPrice()` (which itself returns `"R$ 199,90"`) instead of `formatBRLPriceInput()` (`"199,90"`), the rendered message reads `"Preço: R$ R$ 199,90"`.
**Why it happens:** Both formatters exist in `src/lib/currency/brl.ts` for different purposes (display vs. form-input round-tripping) and are easy to reach for interchangeably without reading the template's literal text.
**How to avoid:** Use `formatBRLPriceInput()` for the `{preço}` substitution value, matching the "just the number" convention the default template's static text already assumes.
**Warning signs:** Manual UAT message preview shows "R$ R$" or "R$" appearing twice.

### Pitfall 8: Direct-link bypass of the sold-out-hide visibility rule
**What goes wrong:** A product hidden from the public grid via `hide_when_sold_out`/`hide_sold_out_default` (Phase 4, D-09/D-10/D-11) is still fully queryable by `id` if the new detail-page query only checks `status = 'published'` and forgets the visibility rule — a shared/bookmarked link would bypass the hiding feature entirely.
**Why it happens:** The visibility rule lives in application code (`isVisible()` in `public-list.ts`), not in the RLS policy itself (RLS only gates on `status='published'`) — it's easy to forget when writing a *new* query function that doesn't share code with the existing one.
**How to avoid:** Export `isVisible()` from `public-list.ts` and reuse it verbatim in the new `queryPublicProductDetail()` — never re-derive the same boolean logic a second time (matches the "nunca replicada em componentes de UI" discipline already established for this exact rule in Phase 4).
**Warning signs:** A product marked sold-out-and-hidden still opens fine when visiting its detail URL directly.

### Pitfall 9: `store_settings` currently has zero public read access
**What goes wrong:** Without a new migration, querying `store_settings` from the public (anon) product detail page returns an empty result — RLS silently blocking looks identical to "no data," a class of bug this project has already hit once (Phase 4's own research explicitly documented this exact failure mode for the storefront before its RLS migration landed).
**Why it happens:** Migration `0004` deliberately deferred this ("esta migration NÃO adiciona nenhuma policy pública em `store_settings`... só será exposto publicamente quando a Fase 5 decidir") — Phase 5 is that decision point, and it's easy to forget the migration step if the page query is written before the RLS policy exists.
**How to avoid:** Land the new `SELECT` policy on `store_settings` in the same Wave-1 migration as `order_clicks`, `[BLOCKING]` before any UI work (mirroring 01-02/03-01/04-01's pattern exactly).
**Warning signs:** The detail page renders the product fine but the WhatsApp button is blank/broken because `whatsapp_e164` came back `undefined`.

## Code Examples

### Recommended migration (illustrative — planner/executor to finalize exact naming and verify via a real anon client, never the SQL editor, per this project's own established RLS-testing discipline)

```sql
-- Source: adapted from the existing pattern in supabase/migrations/0003 and 0004
-- (verified directly against this codebase's migration history)

create table order_clicks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  size smallint not null check (size between 36 and 45),
  created_at timestamptz not null default now()
);

create index order_clicks_store_id_idx on order_clicks (store_id);
create index order_clicks_product_id_idx on order_clicks (product_id);

alter table order_clicks enable row level security;

-- Dono lê só os cliques da própria loja (mesmo padrão raso de `products`,
-- não o padrão de dois níveis de product_sizes/product_photos, porque
-- store_id já está denormalizado na própria linha).
create policy "owner_read_order_clicks" on order_clicks
  for select
  using (store_id in (select id from stores where owner_id = auth.uid()));

-- Cliente final (anon) só pode INSERIR — primeira policy de escrita pública
-- do projeto. WITH CHECK valida consistência product_id/store_id e que o
-- produto está publicado (defesa em profundidade — o anon key é público).
create policy "public_insert_order_clicks" on order_clicks
  for insert
  to anon
  with check (
    product_id in (
      select id from products
      where store_id = order_clicks.store_id and status = 'published'
    )
  );

-- Exposição pública de store_settings — mais restrita que `stores`
-- (using(true)), porque whatsapp_e164 é mais sensível que nome/logo/cor.
create policy "public_read_store_settings_for_published_stores" on store_settings
  for select
  to anon
  using (
    store_id in (select store_id from products where status = 'published')
  );
```

### `logOrderClick` Server Action (swallow errors internally — true fire-and-forget contract)

```ts
// src/lib/products/order-clicks-actions.ts
"use server";
import { createClient } from "@/lib/supabase/server";

/**
 * Fire-and-forget (D-10) — NUNCA lançar. Erros são apenas logados
 * server-side; o chamador nunca precisa tratar rejeição, e a navegação
 * para o wa.me nunca espera esta função.
 */
export async function logOrderClick(storeId: string, productId: string, size: number): Promise<void> {
  try {
    const supabase = await createClient();
    // Bare insert — NUNCA encadear .select()/.single() (Pitfall 2): anon
    // não tem policy de leitura em order_clicks.
    const { error } = await supabase.from("order_clicks").insert({ store_id: storeId, product_id: productId, size });
    if (error) console.error("[order_clicks] insert falhou:", error.message);
  } catch (err) {
    console.error("[order_clicks] erro inesperado:", err);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `document.execCommand('copy')` as the primary clipboard mechanism | `navigator.clipboard.writeText()` as primary, `execCommand` only as a legacy fallback | Clipboard API reached "Baseline Newly Available" March 2025 | For this phase: `copyText()` already uses the modern API; adding an `execCommand` fallback layer is cheap insurance, not a requirement, given Baseline status |
| `navigator.sendBeacon()` as the default analytics-beacon mechanism | `fetch(url, {keepalive: true})` increasingly preferred for its flexibility (headers, non-POST methods, response access) | `keepalive` reaching broad/baseline browser support (Firefox 133+ moved it to baseline) | Neither is directly usable from a Next.js Server Action (no control over the internal fetch's options) — hence this research's `target="_blank"` mitigation recommendation instead of trying to force keepalive semantics onto a Server Action |
| `params`/`cookies()` synchronous in Next.js ≤14 | `params`/`searchParams` as Promises (Next.js 15+, mandatory in 16) | Next.js 15.0.0-RC | Already fully adopted in this codebase (`loja/[slug]/page.tsx` already awaits `params`) — the new `[produto]` route must follow the identical `Promise<{ slug, produto }>` shape |

**Deprecated/outdated:**
- `document.execCommand('copy')`: still functional in most browsers but formally deprecated; use only as a fallback layer behind `navigator.clipboard`, never as primary.
- Synchronous `params` access in App Router pages: removed/deprecated since Next.js 15; not applicable to this greenfield route since it's being written fresh against Next 16.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `{modelo}` interpolates to `product.name` (optionally with `product.line` folded in, e.g. `"${name} - ${line}"`), since the message template has no separate placeholder for `line` | Architecture Patterns → Pattern 4 | Low — cosmetic; easy to adjust the interpolation call site without touching the pure function's contract |
| A2 | `{solado}` falls back to an empty string (or a short placeholder like "—") when `product.sole` is `null` | Architecture Patterns → Pattern 4 | Low-medium — could produce a slightly awkward "Solado: " dangling line in the message for products without a sole recorded; worth a UX decision but not a functional blocker |
| A3 | The `[produto]` route segment is the raw product `id` (UUID), not a new human-readable slug | Standard Stack → Alternatives Considered; Open Question 2 | Medium — if the user actually wants pretty product URLs, this assumption under-scopes the phase; but nothing in CONTEXT.md requests this, and D-01's literal rationale (shareable URL) is satisfied either way |
| A4 | `target="_blank" rel="noopener noreferrer"` on the wa.me anchor behaves acceptably (opens WhatsApp / hands off to the app) inside the Instagram and WhatsApp in-app browsers specifically | Common Pitfalls → Pitfall 5; Open Question 1 | High if wrong — this is exactly the mandatory test matrix's job to catch before phase close-out; flagged prominently so it isn't missed |
| A5 | Using a Server Action (not a Route Handler) for the fire-and-forget click log, paired with `target="_blank"`, is an acceptable resilience tradeoff vs. a `fetch(..., {keepalive:true})`/`sendBeacon` Route Handler | Architecture Patterns → Pattern 3; Open Question 1 | Medium — some fraction of clicks could go unlogged in edge cases (e.g., if `target="_blank"` doesn't behave as expected in a given webview); acceptable given D-09 frames this as raw/approximate capture, not a billing-grade counter |

**If this table is empty:** N/A — see entries above; all are flagged inline at their point of use so the planner can decide explicitly rather than inherit a silent guess.

## Open Questions

1. **Should the fire-and-forget click log use a Server Action (simpler, consistent with codebase convention) or a dedicated Route Handler + `fetch(keepalive:true)`/`sendBeacon` (more resilient against same-tab page-unload cancellation)?**
   - What we know: Server Actions cannot have their underlying fetch options (like `keepalive`) customized by the developer; `target="_blank"` sidesteps the problem for the common case by never unloading the originating tab.
   - What's unclear: Whether `target="_blank"` behaves consistently across the full mandatory device/webview matrix, especially the Instagram and WhatsApp in-app browsers, where public research found no definitive answer.
   - Recommendation: Start with the Server Action + `target="_blank"` approach (Pattern 3) for consistency with the rest of the codebase; treat the manual device matrix as the actual gate for this decision, and fall back to a Route Handler + `sendBeacon` only if the matrix reveals real data loss.

2. **Is the raw product UUID an acceptable `[produto]` URL segment, or does the user expect a human-readable product slug?**
   - What we know: CONTEXT.md's Claude's Discretion section does not mention a product slug at all; D-01's stated rationale ("URL compartilhável") is satisfied by a UUID path.
   - What's unclear: Whether a future ask for "prettier" product URLs is implicitly expected.
   - Recommendation: Use the raw `id` for this phase (zero schema change); treat a dedicated product-slug column as an explicit, separately-scoped future enhancement if requested, not something to pre-build now.

3. **What should `{solado}` render as when `product.sole` is `null`?**
   - What we know: `sole` is a nullable `text` column; not every cataloged product will have it filled in.
   - What's unclear: Whether an empty string, an em-dash, or "Não informado" is the best fallback for a customer-facing message.
   - Recommendation: Default to empty string (cleanest degrade — the line just reads "Solado: " which is a minor cosmetic rough edge, not a broken message); flag for a quick product-owner confirmation during planning/UAT if it looks off in practice.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | New migration (`order_clicks` + `store_settings` policy) | ✓ | 2.109.1 (devDependency) | — |
| Supabase linked remote project | `supabase db push` for the new migration | ✓ (already linked — `supabase/.temp/linked-project.json`, `project-ref` present; migrations 0001–0004 already pushed successfully per STATE.md) | — | — |
| Physical Android/iOS devices + Instagram/WhatsApp apps (mandatory test matrix) | PED-01–04 manual verification (see Validation Architecture) | Not verifiable from this environment | — | None — this is a **hard blocker for phase close-out** per ROADMAP's own framing ("bloqueador de encerramento"), not something automated research/testing can substitute for |

**Missing dependencies with no fallback:**
- Physical device/webview access for the mandatory test matrix — already acknowledged as a manual, human-gated step by the ROADMAP itself; no automated substitute exists or is being proposed here.

**Missing dependencies with fallback:**
- None beyond the above.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 |
| Config file | `vitest.config.ts` (environment: `"node"` — **no jsdom, no React Testing Library installed**) |
| Quick run command | `npx vitest run tests/products/order-message.test.ts` (new, pure-function tests run in milliseconds, no network) |
| Full suite command | `npm test` (== `vitest run`) |

**Critical framework gap for this phase:** the existing test environment is `"node"`, and all existing tests are either (a) pure-function unit tests, or (b) integration tests against a real Supabase project via `seedAuthenticatedAccount`/`createAnonClient` (see `tests/setup/supabase-test.ts`). There is **no DOM rendering capability** (no jsdom, no `@testing-library/react`) anywhere in this codebase today. This means client-side interaction behavior — the shake animation, the tooltip, the pointer/keyboard guard's actual browser-level behavior, real click-then-navigate — **cannot be automated with the current test infrastructure** without a separate, larger decision to add jsdom + Testing Library (a new dev dependency + vitest config change, out of scope for this research to unilaterally recommend). This is consistent with — and likely *why* — the ROADMAP already mandates an exhaustive **manual** device/browser matrix as the phase's actual closing gate for exactly these requirements.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PED-01 | "Pedir agora" only "activates" (navigates) once a size is selected | manual-only (justified: requires real click/DOM interaction; no jsdom in this project) | — | Covered by mandatory device matrix (ROADMAP) |
| PED-02 (data layer) | Only sizes with `available=true` are returned/marked selectable by the detail query | unit/integration | `npx vitest run tests/storefront/product-detail.test.ts` | ❌ Wave 0 |
| PED-02 (interaction layer) | Sold-out pill click/Enter guard actually no-ops in a real browser | manual-only (justified: keyboard/pointer event dispatch, no DOM test runner) | — | Covered by mandatory device matrix |
| PED-03 | Message template interpolation + single-pass `encodeURIComponent`, verified with accents (ã, ç, é) and a multi-line template | unit (pure function, **fully automatable in Node**, no DOM needed) | `npx vitest run tests/products/order-message.test.ts` | ❌ Wave 0 |
| PED-04 (interaction layer) | Shake animation + tooltip fire on invalid click, never navigates | manual-only (justified: CSS animation + DOM, no jsdom) | — | Covered by mandatory device matrix |
| PED-04 (logic layer) | The `preventDefault`/no-`preventDefault` branch logic itself, isolated from the DOM (e.g. as a small pure decision function taking `selectedSize` and returning `{shouldNavigate, shouldShake}`) | unit | `npx vitest run tests/products/order-button-guard.test.ts` (optional, recommended) | ❌ Wave 0 (optional) |
| D-09/D-10 (order_clicks RLS) | anon can insert valid rows, cannot read any; owner reads only own store's clicks, not another owner's; insert with mismatched `product_id`/`store_id` or an unpublished product is rejected | integration (mirrors existing `tests/rls/*.test.ts` pattern) | `npx vitest run tests/rls/order-clicks-rls.test.ts` | ❌ Wave 0 |
| store_settings public exposure | anon can read `whatsapp_e164`/`message_template` only for a store with ≥1 published product | integration (mirrors `tests/storefront/public-access-rls.test.ts`) | `npx vitest run tests/storefront/store-settings-public-read.test.ts` | ❌ Wave 0 |
| Sold-out-hide bypass (Pitfall 8) | Detail page query returns nothing for a hidden-by-sold-out-rule product, matching grid behavior | integration (mirrors `tests/storefront/sold-out-visibility.test.ts`) | Same file as above (`product-detail.test.ts`) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <new test file for that task>`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green **and** the mandatory manual device/browser matrix completed before `/gsd:verify-work` — this phase cannot be considered done on automated tests alone, by the ROADMAP's own explicit design.

### Wave 0 Gaps
- [ ] `tests/products/order-message.test.ts` — template interpolation + `encodeURIComponent` round-trip with accented/special characters and a multi-line template (covers PED-03 automatable slice)
- [ ] `tests/storefront/product-detail.test.ts` — `queryPublicProductDetail`: published+visible returns data; unpublished/not-found returns null; hidden-by-sold-out-rule returns null (reuses `isVisible()`)
- [ ] `tests/rls/order-clicks-rls.test.ts` — anon insert (valid/invalid), owner read scoping, cross-tenant isolation
- [ ] `tests/storefront/store-settings-public-read.test.ts` — anon read gated on ≥1 published product per store
- [ ] Framework install: none — Vitest already configured; jsdom/RTL explicitly NOT being recommended here (see Validation Architecture note above) — client interaction remains manual-matrix-verified by design

*(No test-runner installation needed; only new test files.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | RLS is the actual security boundary for both new anon surfaces (SELECT on `store_settings`, INSERT on `order_clicks`) — the anon key is public in the client bundle, so app-layer checks alone would be meaningless |
| V2 Authentication | n/a | Public, unauthenticated route by design (VITR-01/PED requirements) |
| V4 Access Control | yes | New anon `INSERT` policy on `order_clicks` (project's first anon-write surface) — `WITH CHECK` must cross-validate `product_id`/`store_id` consistency and require `status='published'`; new anon `SELECT` on `store_settings` scoped tighter than the existing `stores` policy |
| V5 Input Validation | yes | `size smallint check (size between 36 and 45)` at the DB level as defense-in-depth beyond client-side selection; `message_template` placeholders already Zod-validated at Phase 1 save time, not re-validated here (only read) |
| V6 Cryptography | n/a | No new crypto surface introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Anon-writable table abuse (scripted repeated inserts against `order_clicks`, inflating or polluting Phase 6's future metrics) | Denial of Service / Repudiation | `WITH CHECK` restricts inserts to real, published `(product_id, store_id)` pairs; full rate-limiting is explicitly out of scope for this MVP (D-09 frames this as raw capture only) — an accepted, documented risk, not silently ignored |
| Crafted `(product_id, store_id)` mismatch in the insert payload (IDOR-style probing) | Tampering | `WITH CHECK` clause requires `product_id in (select id from products where store_id = order_clicks.store_id and status='published')`, rejecting any mismatched pair at the database level regardless of what the Server Action's arguments claim |
| Information disclosure via overly broad `store_settings` exposure (phone numbers of stores with no live products) | Information Disclosure | Scope the new `SELECT` policy to `store_id in (select store_id from products where status='published')` — strictly tighter than the existing blanket `stores` policy, since a WhatsApp number is more sensitive than a store name/logo |
| RLS-blocks-look-like-empty-data confusion (already a documented class of bug in this project, Phase 4) | Information Disclosure / Repudiation (silent failure) | Explicitly verify the new migration's policies via a real anon client in a test (never assume; never test only via the SQL editor, which bypasses RLS entirely — matches this project's own established testing discipline) |
| XSS via product name/description/message rendered in the DOM or embedded in the wa.me link | Tampering | No `dangerouslySetInnerHTML` exists anywhere in this codebase (verified by inspection) — React's default JSX text escaping is sufficient; this phase must not introduce raw HTML injection for product fields |

## Sources

### Primary (HIGH confidence — verified directly against this codebase)
- `src/app/loja/[slug]/page.tsx`, `product-card.tsx`, `image-with-fallback.tsx`, `store-hero.tsx`, `load-more-button.tsx` — existing public storefront conventions (dynamic params, no-cache discipline, Client/Server Component split)
- `src/lib/products/public-list.ts`, `list.ts` — EXISTS-derived availability pattern, two-query-plus-memory-join convention, `isVisible()` sold-out-hide predicate
- `src/lib/clipboard.ts`, `tests/settings/copy-link.test.ts` — existing `copyText()` contract and its `vi.stubGlobal` test pattern
- `src/lib/currency/brl.ts`, `src/lib/validation/onboarding.ts` (`DEFAULT_MESSAGE_TEMPLATE`, `REQUIRED_TEMPLATE_PLACEHOLDERS`) — exact message template format and placeholder names
- `src/lib/phone/normalize-br.ts` — confirms `whatsapp_e164` is normalized once at onboarding, read-only from Phase 5
- `supabase/migrations/0001_init_stores_rls.sql`, `0003_products_schema_rls.sql`, `0004_public_storefront_rls_and_visibility.sql` — existing RLS idioms, and 0004's own comment explicitly deferring the `store_settings` public policy to "a Fase 5"
- `package.json` — confirms all dependency versions in the Standard Stack table
- `vitest.config.ts`, `tests/setup/supabase-test.ts`, `tests/storefront/sold-out-visibility.test.ts` — confirms Node-only test environment (no jsdom) and existing RLS/integration test conventions
- `.planning/ROADMAP.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md` — phase success criteria, message template copy source, project history/decisions

### Secondary (MEDIUM confidence — official docs / cross-checked)
- [Next.js docs: page.js file convention](https://nextjs.org/docs/app/api-reference/file-conventions/page) — dynamic `params` as `Promise`, nested segment shape (verified 2026-03-05 per page metadata; also independently confirmed by the already-working codebase pattern)
- [Next.js docs: Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating) — native `<a>` vs `<Link>` prefetch/navigation behavior (verified 2026-06-23 per page metadata)
- MDN: `pointer-events` CSS property — keyboard Tab/Enter still reaches a `pointer-events:none` element
- [web.dev: How to copy text](https://web.dev/patterns/clipboard/copy-text) — Clipboard API Baseline status, transient user activation requirement
- [Supabase docs: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — `WITH CHECK`-only semantics for INSERT policies, anon/authenticated role model
- MDN: `Navigator.sendBeacon()` — page-unload-survival semantics vs. `fetch(keepalive:true)`

### Tertiary (LOW confidence — flagged for manual validation)
- Instagram/WhatsApp in-app browser behavior for `target="_blank"` on wa.me links specifically — no authoritative source found; explicitly deferred to the mandatory manual device/browser test matrix (see Open Question 1, Pitfall 5)
- Clipboard API support specifically inside Instagram/WhatsApp in-app webviews — no authoritative source found; same manual-matrix deferral applies

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, every recommendation traced to an already-installed, already-verified dependency or an existing codebase file read directly this session
- Architecture: HIGH for data/schema/RLS patterns (directly extends 3 generations of proven migrations and query conventions in this exact codebase); MEDIUM for the client-interaction patterns (Pattern 2/3/4 are novel to this project, reasoned from official docs + platform behavior, not yet proven in this codebase)
- Pitfalls: HIGH for the codebase-verifiable ones (2, 3, 7, 8, 9); MEDIUM for the platform-behavior ones (1, 4, 6); LOW/explicitly-flagged for the in-app-webview-dependent one (5)

**Research date:** 2026-07-14
**Valid until:** 2026-08-13 (30 days — stable domain; the one fast-moving sub-area, in-app webview behavior, is explicitly gated behind manual testing rather than a research validity window)
