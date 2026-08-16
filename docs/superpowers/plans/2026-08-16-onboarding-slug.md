# @ (slug) limpo desde o cadastro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O @ (slug) de uma loja nova nasce limpo e sem hífen direto no onboarding, a partir do nome que o revendedor digita — reusando o campo de slug que já existe em Configurações em vez de duplicar a lógica.

**Architecture:** Extrai a lógica de estado do campo de slug (hoje inline em `settings-form.tsx`) para um hook compartilhado `useSlugField`, reusado tanto por Configurações (refatoração mecânica, comportamento idêntico) quanto pelo onboarding (novo, com autofill a partir do nome + sugestão de slug em caso de colisão). O charset de slug muda de `[a-z0-9-]` para `[a-z0-9]` (sem hífen) nos dois fluxos.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, react-hook-form + zod, Supabase (RLS + RPC `is_slug_available`), Vitest (testes contra projeto Supabase real, sem mocks de banco).

## Global Constraints

- Slug final: `[a-z0-9]+`, 3 a 30 caracteres, sem hífen — nem gerado automaticamente nem digitado à mão (spec: sem hífen "tipo handle de rede social").
- Mensagem de erro de formato exata: `"Use apenas letras e números (3 a 30 caracteres)."` — copy contract do projeto, não parafrasear.
- `slug` NUNCA entra em `onboardingSchema` (schema compartilhado com `settings-form.tsx` via D-07) — sempre validado separadamente com `slugSchema`.
- Nenhuma migration de banco — `stores.slug` não tem CHECK de charset (confirmado em `supabase/migrations/0001_init_stores_rls.sql`), mudança é 100% na camada de validação da aplicação.
- Sem usuários reais hoje — nenhuma tarefa de migração de contas antigas.
- `ensure-store.ts` (slug provisório do signup) não ganha chamada de rede nova — a rede de segurança contra colisão ali continua sendo só o retry-on-`23505` que já existe.
- Spec de referência: `docs/superpowers/specs/2026-08-16-onboarding-slug-design.md`.

---

## Task 1: `slugify` sem hífen como separador

**Files:**
- Modify: `src/lib/slug/slugify.ts`
- Test: `tests/slug/slugify.test.ts`

**Interfaces:**
- Produces: `slugify(input: string): string` (assinatura inalterada, só o comportamento de saída muda) — usado pelas Tasks 3, 4, 9.

- [ ] **Step 1: Atualizar o teste pra refletir o comportamento novo**

Substituir o conteúdo de `tests/slug/slugify.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug/slugify";

describe("slugify", () => {
  it("folds diacritics, concatenates words (no separator), lowercase", () => {
    expect(slugify("Sapatênis São Paulo")).toBe("sapatenissaopaulo");
  });

  it("folds diacritics without dropping letters (D-01 'sem acento')", () => {
    expect(slugify("café")).toBe("cafe");
  });

  it("strips symbols and concatenates surrounding words", () => {
    expect(slugify("  --Nike__Air!!  ")).toBe("nikeair");
  });

  it("folds multiple accented vowels/consonants in the same string", () => {
    expect(slugify("Ção Ótimo")).toBe("caootimo");
  });

  it("never produces a hyphen, regardless of input separators", () => {
    expect(slugify("Chuteiras SP - Original")).toBe("chuteirassporiginal");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/slug/slugify.test.ts`
Expected: FAIL — os três primeiros casos (e o novo caso de hífen) esperam saída sem hífen, mas a implementação atual ainda produz hífen.

- [ ] **Step 3: Implementar a mudança em `slugify.ts`**

Substituir o conteúdo de `src/lib/slug/slugify.ts` por:

```ts
/**
 * Normaliza uma string livre (nome de loja, local-part de email, texto
 * digitado pelo revendedor) em um slug seguro para URL pública.
 *
 * Ordem obrigatória (02-RESEARCH.md Pitfall 2 + tabela "Don't Hand-Roll"):
 * 1. Unicode NFD para separar caractere-base de marca diacrítica
 * 2. Remoção do bloco de marcas diacríticas combinantes (U+0300–U+036F)
 * 3. Lowercase
 * 4. Qualquer caractere fora de [a-z0-9] é REMOVIDO (concatena as palavras
 *    em vez de separar por hífen — decisão do usuário: slug sem traço,
 *    igual handle de rede social. "RL Esportes" -> "rlesportes", nunca
 *    "rl-esportes")
 *
 * O passo 1-2 (fold) TEM que rodar antes do passo 4 (remoção de
 * não-alfanumérico) — senão "café" perde o "e" acentuado em vez de virar
 * "cafe" (D-01 "sem acento").
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/slug/slugify.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug/slugify.ts tests/slug/slugify.test.ts
git commit -m "feat(slug): slugify concatena palavras em vez de separar por hifen"
```

---

## Task 2: `slugSchema` sem hífen no charset

**Files:**
- Modify: `src/lib/slug/validation.ts`
- Test: `tests/slug/validation.test.ts`

**Interfaces:**
- Consumes: nenhuma (schema isolado).
- Produces: `slugSchema` (Zod schema, mesma assinatura), `SlugInput` (tipo inalterado, `string`) — usado pelas Tasks 4, 6, 9, 10.

- [ ] **Step 1: Atualizar os testes que dependiam de hífen ser aceito**

Em `tests/slug/validation.test.ts`, aplicar exatamente estas três mudanças (deixar o resto do arquivo como está):

Trocar:
```ts
  it("rejects accented characters", () => {
    const result = slugSchema.safeParse("cafe-com-acento-a");
    expect(slugSchema.safeParse("café-loja").success).toBe(false);
    expect(result.success).toBe(true);
  });
```
por:
```ts
  it("rejects accented characters", () => {
    const result = slugSchema.safeParse("cafecomacentoa");
    expect(slugSchema.safeParse("café-loja").success).toBe(false);
    expect(result.success).toBe(true);
  });

  it("rejects hyphens", () => {
    const result = slugSchema.safeParse("minha-loja");
    expect(result.success).toBe(false);
  });
```

Trocar:
```ts
  it("rejects symbols other than hyphen", () => {
    const result = slugSchema.safeParse("minha_loja");
    expect(result.success).toBe(false);
  });
```
por:
```ts
  it("rejects underscore and other symbols", () => {
    const result = slugSchema.safeParse("minha_loja");
    expect(result.success).toBe(false);
  });
```

Trocar:
```ts
  it("returns the invalid-format message for a bad-charset slug", () => {
    const result = slugSchema.safeParse("Minha Loja!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Use apenas letras, números e hífens (3 a 30 caracteres)."
      );
    }
  });
```
por:
```ts
  it("returns the invalid-format message for a bad-charset slug", () => {
    const result = slugSchema.safeParse("Minha Loja!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Use apenas letras e números (3 a 30 caracteres)."
      );
    }
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/slug/validation.test.ts`
Expected: FAIL — `"rejects hyphens"` e `"returns the invalid-format message..."` falham contra o schema atual (que ainda aceita hífen e usa a copy antiga).

- [ ] **Step 3: Implementar a mudança em `validation.ts`**

Substituir o conteúdo de `src/lib/slug/validation.ts` por:

```ts
import { z } from "zod";

/**
 * Schema de validação de formato de slug (D-02, LOJA-02). Segue a convenção
 * de `src/lib/validation/onboarding.ts`: regex nomeada + `.trim()` + mensagem
 * em português + tipo inferido exportado. Revalidado sempre no servidor
 * (Server Action), nunca só no client — mesma disciplina do restante do
 * projeto.
 *
 * SEM HÍFEN (decisão do usuário — slug igual handle de rede social:
 * `@rlesportes`, nunca `@rl-esportes`). `slugify` (mesmo diretório) já não
 * produz hífen nenhum; este regex é o que barra um hífen digitado à mão
 * diretamente no campo.
 *
 * O texto de erro de charset ("Use apenas letras e números (3 a 30
 * caracteres).") é o contrato de copy exato do projeto — não parafrasear.
 */
const SLUG_CHARSET_REGEX = /^[a-z0-9]+$/;

/**
 * Nomes que NÃO podem virar slug de loja, porque a vitrine pública mora na
 * raiz (`vitrinoo.app/<slug>`) e disputaria o caminho com uma rota real do
 * app. O Next.js dá prioridade à rota estática, então uma loja com um destes
 * slugs ficaria permanentemente inacessível — e o revendedor não teria como
 * descobrir por quê.
 *
 * A lista é curta de propósito: mover o painel inteiro para `/admin/*`
 * resolveu a colisão por construção, em vez de exigir uma denylist que
 * cresce a cada rota nova. `admin` está aqui porque é justamente o segmento
 * que sobrou na raiz; `api` e `_next`/`static` são reservas do próprio
 * framework/hospedagem que nunca devem ser vendíveis como link de loja.
 */
const RESERVED_SLUGS = new Set(["admin", "api", "static", "public", "www"]);

export const slugSchema = z
  .string()
  .trim()
  .min(3, "O link precisa ter entre 3 e 30 caracteres")
  .max(30, "O link precisa ter entre 3 e 30 caracteres")
  .regex(SLUG_CHARSET_REGEX, "Use apenas letras e números (3 a 30 caracteres).")
  .refine((value) => !RESERVED_SLUGS.has(value), "Esse link é reservado — escolha outro.");

export type SlugInput = z.infer<typeof slugSchema>;
```

Nota: os dois `.refine()` antigos de hífen nas pontas (`startsWith("-")`/`endsWith("-")`) saem — ficaram impossíveis de disparar com o novo charset (o regex já barra qualquer hífen em qualquer posição), checagem morta.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/slug/validation.test.ts`
Expected: PASS (todos os casos, incluindo `"rejects a slug starting with a hyphen"` e `"...ending with a hyphen"`, que continuam `false` agora pelo motivo geral "hífen não é permitido")

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug/validation.ts tests/slug/validation.test.ts
git commit -m "feat(slug): slugSchema passa a rejeitar hifen no charset"
```

---

## Task 3: slug provisório do signup sem hífen de junção + `ensureStoreForUser` devolve o slug

**Files:**
- Modify: `src/lib/auth/ensure-store.ts`
- Test: `tests/auth/ensure-store-slug.test.ts` (novo)

**Interfaces:**
- Consumes: `slugify` (Task 1).
- Produces: `ensureStoreForUser(supabase, userId, email): Promise<{ storeId: string; slug: string } | { error: string }>` (mudança de shape: antes só `{ storeId }`) — usado pela Task 8 (`onboarding/page.tsx`).

- [ ] **Step 1: Escrever o teste (falha primeiro — a função ainda não devolve `slug`)**

Criar `tests/auth/ensure-store-slug.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { signUpAction } from "@/lib/auth/actions";
import { createAnonClient } from "../setup/supabase-test";

/**
 * Mesmo padrão de tests/onboarding/store-settings.test.ts: mocka só a
 * camada Next.js, escreve contra o Supabase de teste real.
 */
const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

function uniqueEmail(label: string): string {
  return `vitrinoo.ensurestore.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

describe("ensureStoreForUser — slug provisório do signup", () => {
  it("gera um slug provisório sem hifen no cadastro", async () => {
    const email = uniqueEmail("no-hyphen");
    const password = "SenhaForte123!";
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/onboarding");

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: stores } = await verifyClient
      .from("stores")
      .select("slug")
      .eq("owner_id", signInData.user!.id);

    expect(stores).toHaveLength(1);
    expect(stores![0].slug).toMatch(/^[a-z0-9]+$/);
  }, 30000);
});
```

- [ ] **Step 2: Rodar e confirmar que passa mesmo antes da mudança (baseline)**

Run: `npx vitest run tests/auth/ensure-store-slug.test.ts`
Expected: PASS — o slug já não tem hífen de charset (email não tem símbolo), mas o `-` de junção entre base e sufixo aleatório ainda existiria hoje. Como o teste usa `/^[a-z0-9]+$/` (sem hífen no regex), ele já FALHA contra o comportamento atual por causa do `-` de junção. Confirmar que falha antes do Step 3.

Run novamente: `npx vitest run tests/auth/ensure-store-slug.test.ts`
Expected: FAIL — `stores![0].slug` contém um `-` (ex.: `vitrinooensurestorenohyphen...123` `-` `a1b2c3`), não casa com `/^[a-z0-9]+$/`.

- [ ] **Step 3: Implementar a mudança em `ensure-store.ts`**

No arquivo `src/lib/auth/ensure-store.ts`, aplicar estas mudanças:

1. Em `generateStoreSlug`, trocar:
```ts
function generateStoreSlug(email: string): string {
  const base = slugify(email.split("@")[0]) || "loja";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
```
por:
```ts
function generateStoreSlug(email: string): string {
  const base = slugify(email.split("@")[0]) || "loja";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}${suffix}`;
}
```

2. Trocar a assinatura de retorno da função exportada, de:
```ts
export async function ensureStoreForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string
): Promise<{ storeId: string } | { error: string }> {
```
por:
```ts
export async function ensureStoreForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string
): Promise<{ storeId: string; slug: string } | { error: string }> {
```

3. Trocar a leitura de loja existente, de:
```ts
  const { data: existingStore } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let storeId = existingStore?.id ?? null;
```
por:
```ts
  const { data: existingStore } = await supabase
    .from("stores")
    .select("id, slug")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let storeId = existingStore?.id ?? null;
  let slug = existingStore?.slug ?? null;
```

4. Trocar o loop de criação, de:
```ts
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !storeId; attempt++) {
      const slug = generateStoreSlug(email);
      const { data, error } = await supabase.from("stores").insert({ owner_id: userId, name: storeName, slug }).select("id").single();

      if (data) {
        storeId = data.id;
        break;
      }

      lastError = error;
      if (error?.code !== UNIQUE_VIOLATION) {
        break;
      }
    }
```
por:
```ts
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !storeId; attempt++) {
      const candidateSlug = generateStoreSlug(email);
      const { data, error } = await supabase
        .from("stores")
        .insert({ owner_id: userId, name: storeName, slug: candidateSlug })
        .select("id, slug")
        .single();

      if (data) {
        storeId = data.id;
        slug = data.slug;
        break;
      }

      lastError = error;
      if (error?.code !== UNIQUE_VIOLATION) {
        break;
      }
    }
```

5. No final da função, trocar:
```ts
  return { storeId };
}
```
por:
```ts
  if (!slug) {
    return { error: "Falha ao preparar sua loja." };
  }

  return { storeId, slug };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/auth/ensure-store-slug.test.ts`
Expected: PASS

- [ ] **Step 5: Verificar que o self-heal (chamador existente em `onboarding/page.tsx`) ainda compila**

Run: `npx tsc --noEmit`
Expected: FAIL neste ponto — `src/app/admin/onboarding/page.tsx` ainda faz `return <OnboardingWizard />;` sem usar `result.slug`, o que está OK (não quebra), mas a Task 8 vai consumir esse campo. Nenhuma ação aqui além de confirmar que o retorno novo não quebra o `if ("error" in result)` existente (união de tipos ainda válida).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/ensure-store.ts tests/auth/ensure-store-slug.test.ts
git commit -m "feat(auth): slug provisorio do signup sem hifen; ensureStoreForUser devolve o slug"
```

---

## Task 4: Hook compartilhado `useSlugField` + util `resolveAvailableSlug`

**Files:**
- Create: `src/lib/slug/use-slug-field.ts`
- Create: `src/lib/slug/resolve-available.ts`
- Test: `tests/slug/resolve-available.test.ts` (novo)

**Interfaces:**
- Consumes: `slugify` (Task 1), `slugSchema` (Task 2), `checkSlugAvailability` de `@/lib/settings/actions` (já existe, assinatura `(candidateSlug: string) => Promise<{ available: boolean; error?: string }>`), `useDebouncedValue` de `@/lib/hooks/use-debounce` (já existe).
- Produces:
  - `export type SlugAvailabilityStatus = "idle" | "checking" | "available" | "taken"`
  - `export type SlugFieldState = { rawSlug: string; setRawSlug: (value: string) => void; slug: string; formatError: string | null; status: SlugAvailabilityStatus }`
  - `export function useSlugField(currentSlug: string): SlugFieldState`
  - `export async function resolveAvailableSlug(base: string, maxAttempts?: number): Promise<string | null>`
  - Usados pelas Tasks 5, 6, 9.

- [ ] **Step 1: Escrever o teste de `resolveAvailableSlug` (falha primeiro — o arquivo não existe)**

Criar `tests/slug/resolve-available.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const checkSlugAvailability = vi.fn();

vi.mock("@/lib/settings/actions", () => ({
  checkSlugAvailability: (...args: unknown[]) => checkSlugAvailability(...args),
}));

import { resolveAvailableSlug } from "@/lib/slug/resolve-available";

describe("resolveAvailableSlug", () => {
  beforeEach(() => {
    checkSlugAvailability.mockReset();
  });

  it("retorna a base quando ela já está livre", async () => {
    checkSlugAvailability.mockResolvedValueOnce({ available: true });

    const result = await resolveAvailableSlug("rlesportes");

    expect(result).toBe("rlesportes");
    expect(checkSlugAvailability).toHaveBeenCalledTimes(1);
    expect(checkSlugAvailability).toHaveBeenCalledWith("rlesportes");
  });

  it("incrementa numericamente (sem hifen) até achar uma livre", async () => {
    checkSlugAvailability
      .mockResolvedValueOnce({ available: false })
      .mockResolvedValueOnce({ available: false })
      .mockResolvedValueOnce({ available: true });

    const result = await resolveAvailableSlug("rlesportes");

    expect(result).toBe("rlesportes3");
    expect(checkSlugAvailability).toHaveBeenNthCalledWith(1, "rlesportes");
    expect(checkSlugAvailability).toHaveBeenNthCalledWith(2, "rlesportes2");
    expect(checkSlugAvailability).toHaveBeenNthCalledWith(3, "rlesportes3");
  });

  it("retorna null ao esgotar as tentativas", async () => {
    checkSlugAvailability.mockResolvedValue({ available: false });

    const result = await resolveAvailableSlug("rlesportes", 3);

    expect(result).toBeNull();
    expect(checkSlugAvailability).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/slug/resolve-available.test.ts`
Expected: FAIL — `Cannot find module '@/lib/slug/resolve-available'`

- [ ] **Step 3: Implementar `resolve-available.ts`**

Criar `src/lib/slug/resolve-available.ts`:

```ts
import { checkSlugAvailability } from "@/lib/settings/actions";

/**
 * Sugestão de slug livre a partir de uma base, tentando `base`, `base2`,
 * `base3`... (sem hífen, consistente com `slugify`/`slugSchema`). Usado
 * pelo onboarding quando o slug preenchido automaticamente a partir do nome
 * colide com uma loja já existente — sugere uma alternativa em vez de
 * deixar o revendedor adivinhar.
 *
 * Roda só no client (importa uma Server Action e a chama sob demanda), uma
 * tentativa por vez — nunca em paralelo, porque cada tentativa só faz
 * sentido depois de saber que a anterior está ocupada.
 */
export async function resolveAvailableSlug(base: string, maxAttempts = 20): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    const result = await checkSlugAvailability(candidate);
    if (result.available) {
      return candidate;
    }
  }
  return null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/slug/resolve-available.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Implementar `use-slug-field.ts`** (sem teste dedicado — hook React puro; o projeto não tem `@testing-library/react`/jsdom configurado hoje, `vitest.config.ts` usa `environment: "node"`. Cobertura real vem da Task 6 — os testes existentes de Configurações, que passam a exercitar este hook por baixo — e de checklist manual na Task 13)

Criar `src/lib/slug/use-slug-field.ts`:

```ts
"use client";

import { useEffect, useState, useTransition } from "react";
import { checkSlugAvailability } from "@/lib/settings/actions";
import { useDebouncedValue } from "@/lib/hooks/use-debounce";
import { slugify } from "./slugify";
import { slugSchema } from "./validation";

export type SlugAvailabilityStatus = "idle" | "checking" | "available" | "taken";

export type SlugFieldState = {
  /** Valor cru digitado — o exibido no input. */
  rawSlug: string;
  setRawSlug: (value: string) => void;
  /** `rawSlug` já normalizado (sem acento, minúsculo, sem hífen). */
  slug: string;
  /** Mensagem de formato inválido, síncrona. `null` quando o formato está ok. */
  formatError: string | null;
  status: SlugAvailabilityStatus;
};

/**
 * Estado do campo "@" (slug): normalização síncrona, validação síncrona de
 * formato, checagem de disponibilidade debounced. Extraído de
 * `settings-form.tsx` (onde vivia inline) para ser reusado também pelo
 * onboarding — comportamento idêntico nos dois lugares, um lugar só pra
 * corrigir se algo mudar.
 *
 * `currentSlug`: base de comparação. Enquanto o slug normalizado for igual
 * a ela, nenhuma checagem de rede dispara — "nada mudou" não precisa
 * verificar disponibilidade de algo que já é seu.
 */
export function useSlugField(currentSlug: string): SlugFieldState {
  const [rawSlug, setRawSlug] = useState(currentSlug);
  const [availability, setAvailability] = useState<"idle" | "available" | "taken">("idle");
  const [isCheckPending, startCheckTransition] = useTransition();

  const slug = slugify(rawSlug);
  const debouncedSlug = useDebouncedValue(slug, 400);

  const slugFormatResult = slugSchema.safeParse(slug);
  const formatError = slugFormatResult.success
    ? null
    : slugFormatResult.error.issues[0]?.message ?? null;

  // Formato é checado de forma síncrona; só a checagem de REDE é debounced.
  const needsSlugCheck = slugFormatResult.success && debouncedSlug !== currentSlug;
  const status: SlugAvailabilityStatus = !needsSlugCheck
    ? "idle"
    : isCheckPending
      ? "checking"
      : availability;

  useEffect(() => {
    if (!needsSlugCheck) return;

    let cancelled = false;
    startCheckTransition(async () => {
      const result = await checkSlugAvailability(debouncedSlug);
      if (cancelled) return;
      setAvailability(result.available ? "available" : "taken");
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedSlug, currentSlug, needsSlugCheck]);

  return { rawSlug, setRawSlug, slug, formatError, status };
}
```

- [ ] **Step 6: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros relacionados a `src/lib/slug/use-slug-field.ts` ou `src/lib/slug/resolve-available.ts` (o arquivo `slug-field-context.tsx` ainda define seus próprios tipos duplicados neste ponto — resolvido na Task 5 — então pode haver um aviso de tipos duplicados, não de erro de compilação; confirmar que não há erro).

- [ ] **Step 7: Commit**

```bash
git add src/lib/slug/use-slug-field.ts src/lib/slug/resolve-available.ts tests/slug/resolve-available.test.ts
git commit -m "feat(slug): extrai useSlugField compartilhado e adiciona resolveAvailableSlug"
```

---

## Task 5: `slug-field-context.tsx` usa os tipos do hook compartilhado

**Files:**
- Modify: `src/app/admin/(painel)/configuracoes/slug-field-context.tsx`

**Interfaces:**
- Consumes: `SlugAvailabilityStatus`, `SlugFieldState` de `@/lib/slug/use-slug-field` (Task 4).
- Produces: `SlugFieldProvider`, `useSlugField` (hook de contexto — nome igual ao hook de estado da Task 4, mas propósito diferente: este lê o contexto, aquele calcula o estado. Continuam em arquivos/namespaces diferentes, sem colisão de import já que nunca são importados no mesmo arquivo com o mesmo nome sem alias) — consumido pela Task 6 (sem mudança de uso) e Task 9 (novo consumidor).

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Trocar `src/app/admin/(painel)/configuracoes/slug-field-context.tsx` por:

```ts
"use client";

import { createContext, useContext } from "react";
import type { SlugAvailabilityStatus, SlugFieldState } from "@/lib/slug/use-slug-field";

/**
 * Contexto do estado do campo "@" — reexporta os tipos de
 * `@/lib/slug/use-slug-field` (fonte única da verdade do shape) para quem
 * já importa daqui (`SlugEditor`).
 *
 * Existe porque, em Configurações, `SettingsForm` (que possui e salva o
 * estado) e `SlugEditor` (que o exibe) vivem em COLUNAS diferentes da
 * grade — o campo fica no card "Link e QR code da vitrine", à direita, e o
 * botão que o salva é o "Salvar alterações", à esquerda. No onboarding, o
 * mesmo contrato é usado com um `SlugFieldProvider` local no wizard.
 */
export type { SlugAvailabilityStatus, SlugFieldState };

const SlugFieldContext = createContext<SlugFieldState | null>(null);

export const SlugFieldProvider = SlugFieldContext.Provider;

export function useSlugField(): SlugFieldState {
  const context = useContext(SlugFieldContext);
  if (!context) {
    throw new Error("useSlugField (contexto) precisa ser usado dentro de um <SlugFieldProvider>.");
  }
  return context;
}
```

Nota: a mensagem de erro mudou de "precisa ser usado dentro do `<SettingsForm>`" para "dentro de um `<SlugFieldProvider>`" porque agora dois componentes diferentes (`SettingsForm` e `OnboardingWizard`, Task 9) fornecem esse contexto — a mensagem antiga citava só um dos dois possíveis.

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(painel)/configuracoes/slug-field-context.tsx"
git commit -m "refactor(slug): slug-field-context reusa tipos de use-slug-field"
```

---

## Task 6: `settings-form.tsx` passa a usar `useSlugField`

**Files:**
- Modify: `src/app/admin/(painel)/configuracoes/settings-form.tsx:1-22,154-193`
- Test: `tests/settings/slug-availability.test.ts`, `tests/settings/update-slug.test.ts` (já existentes — validam que o comportamento não regrediu)

**Interfaces:**
- Consumes: `useSlugField` de `@/lib/slug/use-slug-field` (Task 4).
- Produces: nenhuma interface nova — refatoração mecânica, comportamento idêntico ao atual.

- [ ] **Step 1: Rodar os testes existentes como baseline (devem passar ANTES da mudança)**

Run: `npx vitest run tests/settings/slug-availability.test.ts tests/settings/update-slug.test.ts`
Expected: PASS (comportamento atual, ainda com charset antigo — este arquivo de teste só muda na Task 11)

- [ ] **Step 2: Atualizar os imports do topo do arquivo**

Em `src/app/admin/(painel)/configuracoes/settings-form.tsx`, trocar:
```ts
import { CoverEditor } from "./cover-editor";
import { slugify } from "@/lib/slug/slugify";
import { slugSchema } from "@/lib/slug/validation";
import { useDebouncedValue } from "@/lib/hooks/use-debounce";
import { SlugFieldProvider, type SlugAvailabilityStatus } from "./slug-field-context";
import { SlugEditor } from "./slug-editor";
```
por:
```ts
import { CoverEditor } from "./cover-editor";
import { useSlugField } from "@/lib/slug/use-slug-field";
import { SlugFieldProvider } from "./slug-field-context";
import { SlugEditor } from "./slug-editor";
```

(`slugify`, `slugSchema`, `useDebouncedValue` e o tipo `SlugAvailabilityStatus` deixam de ser usados diretamente neste arquivo — toda essa lógica agora mora dentro do hook.)

- [ ] **Step 3: Substituir o bloco de estado do slug**

Trocar (linhas ~154-193):
```ts
  // --- Campo "Slug" -------------------------------------------------------
  // Mora aqui, e não mais no `SlugEditor`, porque quem salva o slug agora é o
  // botão "Salvar alterações" deste formulário. O `SlugEditor` virou só a
  // parte visual, alimentada via `SlugFieldProvider`.
  const [rawSlug, setRawSlug] = useState(currentSlug);
  const [availability, setAvailability] = useState<"idle" | "available" | "taken">("idle");
  const [isCheckPending, startCheckTransition] = useTransition();

  const slug = slugify(rawSlug);
  const debouncedSlug = useDebouncedValue(slug, 400);

  const slugFormatResult = slugSchema.safeParse(slug);
  const slugFormatError = slugFormatResult.success
    ? null
    : slugFormatResult.error.issues[0]?.message ?? null;

  // Formato é checado de forma síncrona; só a checagem de REDE é debounced
  // (02-RESEARCH.md Open Question 2). Tudo derivado no render — nenhum
  // `setState` síncrono dentro do efeito (react-hooks/set-state-in-effect).
  const needsSlugCheck = slugFormatResult.success && debouncedSlug !== currentSlug;
  const slugStatus: SlugAvailabilityStatus = !needsSlugCheck
    ? "idle"
    : isCheckPending
      ? "checking"
      : availability;

  useEffect(() => {
    if (!needsSlugCheck) return;

    let cancelled = false;
    startCheckTransition(async () => {
      const result = await checkSlugAvailability(debouncedSlug);
      if (cancelled) return;
      setAvailability(result.available ? "available" : "taken");
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedSlug, currentSlug, needsSlugCheck]);

  const slugChanged = slug !== currentSlug;
```
por:
```ts
  // --- Campo "Slug" -------------------------------------------------------
  // Mora aqui, e não mais no `SlugEditor`, porque quem salva o slug agora é o
  // botão "Salvar alterações" deste formulário. O `SlugEditor` virou só a
  // parte visual, alimentada via `SlugFieldProvider`. O estado em si (raw,
  // normalizado, validação de formato, checagem de disponibilidade
  // debounced) vem do hook compartilhado — o mesmo que o onboarding usa.
  const { rawSlug, setRawSlug, slug, formatError: slugFormatError, status: slugStatus } =
    useSlugField(currentSlug);

  const slugChanged = slug !== currentSlug;
```

- [ ] **Step 4: Remover o import de `checkSlugAvailability` se ficou sem uso**

Conferir a linha `import { checkSlugAvailability, saveStoreSettings, updateStoreSlug } from "@/lib/settings/actions";` — `checkSlugAvailability` não é mais chamado diretamente neste arquivo (mora dentro do hook agora). Trocar para:
```ts
import { saveStoreSettings, updateStoreSlug } from "@/lib/settings/actions";
```

- [ ] **Step 5: Checar tipos e lint**

Run: `npx tsc --noEmit`
Expected: sem erros (nenhum import não usado sobrando — `useState`/`useEffect`/`useTransition` continuam usados em outras partes do arquivo, ex. `isPending`, prévia de logo/capa).

Run: `npx eslint src/app/admin/\(painel\)/configuracoes/settings-form.tsx`
Expected: sem erros.

- [ ] **Step 6: Rodar os testes existentes e confirmar que continuam passando**

Run: `npx vitest run tests/settings/slug-availability.test.ts tests/settings/update-slug.test.ts`
Expected: PASS — mesmo resultado do Step 1, comportamento preservado pela refatoração.

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(painel)/configuracoes/settings-form.tsx"
git commit -m "refactor(settings): settings-form usa useSlugField compartilhado"
```

---

## Task 7: Aviso de tamanho no `SlugEditor` (não bloqueante)

**Files:**
- Modify: `src/app/admin/(painel)/configuracoes/slug-editor.tsx`

**Interfaces:**
- Consumes: `useSlugField` (contexto, de `slug-field-context.tsx`, já existente).
- Produces: nenhuma interface nova — só JSX adicional.

- [ ] **Step 1: Adicionar o indicador de tamanho**

Em `src/app/admin/(painel)/configuracoes/slug-editor.tsx`, trocar:
```tsx
      <p className="text-xs text-gray-500 dark:text-gray-400">/{slug}</p>
      {formatError ? (
        <span className="text-sm text-error-fg">{formatError}</span>
      ) : (
        <StatusPill status={status} />
      )}
```
por:
```tsx
      <p className="text-xs text-gray-500 dark:text-gray-400">/{slug}</p>
      {formatError ? (
        <span className="text-sm text-error-fg">{formatError}</span>
      ) : (
        <>
          <StatusPill status={status} />
          <LengthHint length={slug.length} />
        </>
      )}
```

E adicionar, junto de `StatusPill` no final do arquivo:
```tsx
/**
 * Aviso de tamanho, não bloqueante — puro nudge visual, nunca impede o
 * submit. Abaixo de ~20 caracteres o @ passa fácil por WhatsApp; acima
 * disso, ainda válido, só mais chato de repassar de viva voz ou digitar de
 * novo depois de ler numa embalagem.
 */
function LengthHint({ length }: { length: number }) {
  if (length === 0) return null;

  if (length > 20) {
    return <span className="text-xs text-warning-fg">Meio longo pra passar por WhatsApp</span>;
  }

  return null;
}
```

(Abaixo de 20 caracteres não mostra nada — evita ruído visual num campo que já tem a pill de disponibilidade logo acima; o aviso só aparece quando vale a pena chamar atenção.)

- [ ] **Step 2: Checar tipos e lint**

Run: `npx tsc --noEmit && npx eslint src/app/admin/\(painel\)/configuracoes/slug-editor.tsx`
Expected: sem erros.

- [ ] **Step 3: Verificação visual manual**

Rodar `npm run dev`, abrir `/admin/configuracoes`, digitar no campo `@` um valor com mais de 20 caracteres (ex.: `chuteirasimportadasoriginais`) e confirmar que o aviso "Meio longo pra passar por WhatsApp" aparece, em texto âmbar, sem travar o botão "Salvar alterações".

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(painel)/configuracoes/slug-editor.tsx"
git commit -m "feat(settings): aviso de tamanho nao bloqueante no campo de slug"
```

---

## Task 8: `onboarding/page.tsx` passa o slug provisório pro wizard

**Files:**
- Modify: `src/app/admin/onboarding/page.tsx`

**Interfaces:**
- Consumes: `ensureStoreForUser` retornando `{ storeId: string; slug: string }` (Task 3).
- Produces: `<OnboardingWizard provisionalSlug={string} />` — consumido pela Task 9.

- [ ] **Step 1: Passar o slug pro componente**

Em `src/app/admin/onboarding/page.tsx`, trocar a linha final:
```tsx
  return <OnboardingWizard />;
}
```
por:
```tsx
  return <OnboardingWizard provisionalSlug={result.slug} />;
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: FAIL neste ponto — `OnboardingWizard` (Task 9) ainda não aceita a prop `provisionalSlug`. Esperado; resolvido na próxima task. Confirmar que o ÚNICO erro novo é esse (nenhum outro lugar quebrou).

- [ ] **Step 3: Commit**

Não commitar isoladamente — este arquivo e a Task 9 formam uma mudança só (o componente sem a prop nova quebraria o build). Seguir direto pra Task 9 e commitar os dois juntos no fim dela.

---

## Task 9: Campo `@` no onboarding — autofill, checagem, sugestão de colisão, trava de submit

**Files:**
- Modify: `src/app/admin/onboarding/onboarding-wizard.tsx`

**Interfaces:**
- Consumes: `useSlugField`, `resolveAvailableSlug` (Task 4), `SlugFieldProvider`, `SlugEditor` (reusados de `@/app/admin/(painel)/configuracoes/`), `slugify` (Task 1).
- Produces: `OnboardingWizard` aceita `{ provisionalSlug: string }`; `saveOnboarding` (Task 10) passa a receber um campo `slug` no `FormData`.

- [ ] **Step 1: Atualizar os imports e a assinatura do componente**

No topo de `src/app/admin/onboarding/onboarding-wizard.tsx`, trocar:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AsYouType } from "libphonenumber-js";
import {
  onboardingSchema,
  DEFAULT_MESSAGE_TEMPLATE,
  type OnboardingInput,
} from "@/lib/validation/onboarding";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { LogoMark } from "@/components/logo-mark";
```
por:
```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AsYouType } from "libphonenumber-js";
import {
  onboardingSchema,
  DEFAULT_MESSAGE_TEMPLATE,
  type OnboardingInput,
} from "@/lib/validation/onboarding";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { LogoMark } from "@/components/logo-mark";
import { slugify } from "@/lib/slug/slugify";
import { useSlugField } from "@/lib/slug/use-slug-field";
import { resolveAvailableSlug } from "@/lib/slug/resolve-available";
import { SlugFieldProvider } from "@/app/admin/(painel)/configuracoes/slug-field-context";
import { SlugEditor } from "@/app/admin/(painel)/configuracoes/slug-editor";
```

E trocar:
```tsx
export function OnboardingWizard() {
  const [isPending, startTransition] = useTransition();
  const [logoFile, setLogoFile] = useState<File | null>(null);
```
por:
```tsx
export function OnboardingWizard({ provisionalSlug }: { provisionalSlug: string }) {
  const [isPending, startTransition] = useTransition();
  const [logoFile, setLogoFile] = useState<File | null>(null);
```

- [ ] **Step 2: Adicionar o estado do campo `@` logo após o `useForm`**

Depois do bloco:
```tsx
  const whatsappValue = watch("whatsapp");
  const formattedPreview = whatsappValue ? new AsYouType("BR").input(whatsappValue) : "";
```
adicionar:
```tsx

  // --- Campo "@" -----------------------------------------------------------
  // Mesmo hook que Configurações usa (`useSlugField`), com duas diferenças
  // específicas do onboarding: (1) autofill a partir do nome digitado, até a
  // pessoa editar o @ à mão; (2) sugestão automática de alternativa quando o
  // autofill colide com um @ já existente.
  const nameValue = watch("name");
  const [slugTouched, setSlugTouched] = useState(false);
  const slugField = useSlugField(provisionalSlug);
  const { setRawSlug: setSlugRaw } = slugField;

  // Autofill: `slugify(nome)` sempre que o nome mudar, ENQUANTO a pessoa não
  // tiver editado o campo @ diretamente. Fallback pra "loja" no mesmo padrão
  // de `ensure-store.ts` — nunca autofilla um campo literalmente vazio (nome
  // só com emoji/símbolo, por exemplo).
  useEffect(() => {
    if (slugTouched) return;
    setSlugRaw(slugify(nameValue || "") || "loja");
  }, [nameValue, slugTouched, setSlugRaw]);

  // Edição manual do @ marca `slugTouched` e para o autofill — igual campo
  // de slug de URL de qualquer admin (CMS, encurtador de link etc.): segue o
  // nome até o usuário mexer, depois vira independente.
  const handleSlugInputChange = (value: string) => {
    setSlugTouched(true);
    setSlugRaw(value);
  };

  // Sugestão automática quando o @ atual está ocupado — tenta @nome2,
  // @nome3... e mostra a primeira livre como atalho de um clique.
  const [suggestedSlug, setSuggestedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (slugField.status !== "taken") {
      setSuggestedSlug(null);
      return;
    }

    let cancelled = false;
    resolveAvailableSlug(slugField.slug).then((result) => {
      if (!cancelled) setSuggestedSlug(result);
    });

    return () => {
      cancelled = true;
    };
  }, [slugField.status, slugField.slug]);

  const slugBlocksSubmit =
    !!slugField.formatError || slugField.status === "checking" || slugField.status === "taken";
```

- [ ] **Step 3: Incluir o slug no `FormData` do submit**

No `onSubmit`, trocar:
```tsx
  const onSubmit = (values: OnboardingInput) => {
    const formData = new FormData();
    formData.set("name", values.name);
```
por:
```tsx
  const onSubmit = (values: OnboardingInput) => {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("slug", slugField.slug);
```

- [ ] **Step 4: Renderizar o campo `@` no JSX, logo abaixo do campo "Nome da loja"**

Trocar:
```tsx
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-gray-700">
            Nome da loja
          </label>
          <input
            id="name"
            type="text"
            autoComplete="organization"
            {...register("name")}
            className="rounded-xl border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.name && <span className="text-sm text-error-solid">{errors.name.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="logo" className="text-sm font-medium text-gray-700">
            Logo
          </label>
```
por:
```tsx
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-gray-700">
            Nome da loja
          </label>
          <input
            id="name"
            type="text"
            autoComplete="organization"
            {...register("name")}
            className="rounded-xl border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.name && <span className="text-sm text-error-solid">{errors.name.message}</span>}
        </div>

        <SlugFieldProvider value={{ ...slugField, setRawSlug: handleSlugInputChange }}>
          <div className="flex flex-col gap-1">
            <SlugEditor />
            {suggestedSlug && (
              <button
                type="button"
                onClick={() => handleSlugInputChange(suggestedSlug)}
                className="self-start text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Usar @{suggestedSlug}
              </button>
            )}
          </div>
        </SlugFieldProvider>

        <div className="flex flex-col gap-1">
          <label htmlFor="logo" className="text-sm font-medium text-gray-700">
            Logo
          </label>
```

- [ ] **Step 5: Travar o submit enquanto o @ não estiver pronto**

Trocar:
```tsx
          <button
            type="submit"
            disabled={isPending || !logoFile}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none"
          >
            {isPending ? "Salvando…" : "Concluir e ver minha vitrine"}
          </button>
```
por:
```tsx
          <button
            type="submit"
            disabled={isPending || !logoFile || slugBlocksSubmit}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none"
          >
            {isPending ? "Salvando…" : "Concluir e ver minha vitrine"}
          </button>
```

- [ ] **Step 6: Atualizar o chamador em `onboarding/page.tsx` (fecha a Task 8) e checar tipos**

Confirmar que `src/app/admin/onboarding/page.tsx` (Task 8, Step 1) já passa `provisionalSlug={result.slug}` — se ainda não foi aplicado, aplicar agora.

Run: `npx tsc --noEmit`
Expected: PASS, sem erros.

Run: `npx eslint src/app/admin/onboarding/onboarding-wizard.tsx`
Expected: sem erros (conferir especialmente a regra `react-hooks/exhaustive-deps` nos dois `useEffect` novos — ambos já declaram todas as dependências usadas).

- [ ] **Step 7: Verificação visual manual**

Rodar `npm run dev`, criar uma conta nova, chegar em `/admin/onboarding`. Digitar "RL Esportes" no campo "Nome da loja" e confirmar que o campo `@` abaixo preenche sozinho com `rlesportes` enquanto digita. Editar o `@` manualmente e confirmar que ele para de seguir o nome. Digitar um `@` de uma loja que já existe (ex.: repetir o slug de uma conta de teste anterior) e confirmar que aparece "Este link já está em uso." + o link "Usar @<sugestão>" clicável. Confirmar que o botão "Concluir" fica desabilitado enquanto o status for "Verificando…" ou "Este link já está em uso.".

- [ ] **Step 8: Commit (Tasks 8 e 9 juntas)**

```bash
git add src/app/admin/onboarding/page.tsx src/app/admin/onboarding/onboarding-wizard.tsx
git commit -m "feat(onboarding): campo @ com autofill do nome, checagem e sugestao de colisao"
```

---

## Task 10: `saveOnboarding` valida e grava o slug

**Files:**
- Modify: `src/lib/onboarding/actions.ts`
- Test: `tests/onboarding/store-settings.test.ts` (adicionar casos novos)

**Interfaces:**
- Consumes: `slugSchema` (Task 2).
- Produces: `saveOnboarding(formData)` passa a exigir/gravar um campo `slug` no `FormData` — quebra de contrato com quem chama sem esse campo (só a Task 9, já ajustada). Testado por esta task.

- [ ] **Step 1: Escrever os testes novos (falham primeiro)**

Em `tests/onboarding/store-settings.test.ts`, no teste de sucesso já existente ("salva nome/cor/frase..."), adicionar `formData.set("slug", "chuteirasdorayan");` junto dos outros `formData.set(...)` (antes do `formData.set("logo", ...)`), e depois do bloco que já confere `stores`, adicionar a asserção do slug:

```ts
    expect(stores![0].slug).toBe("chuteirasdorayan");
```

Adicionar dois testes novos no final do `describe` existente (mesmo arquivo):

```ts
  it("rejeita um slug fora do formato (com hifen) sem gravar nada", async () => {
    const { email } = await signUpAndGetCredentials("slug-invalid-format");
    void email;

    const formData = new FormData();
    formData.set("name", "Chuteiras Inválidas");
    formData.set("accentColor", "#00C46A");
    formData.set("tagline", "");
    formData.set("whatsapp", "(11) 99999-9999");
    formData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formData.set("slug", "chuteiras-com-hifen");
    formData.set("logo", makeFakeLogoFile());

    const result = await saveOnboarding(formData);
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("retorna erro amigavel quando o slug ja pertence a outra loja", async () => {
    const { email: emailA, password: passwordA } = await signUpAndGetCredentials("slug-taken-a");

    const formDataA = new FormData();
    formDataA.set("name", "Loja A");
    formDataA.set("accentColor", "#00C46A");
    formDataA.set("tagline", "");
    formDataA.set("whatsapp", "(11) 99999-9999");
    formDataA.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formDataA.set("slug", `lojaataken${Date.now()}`);
    formDataA.set("logo", makeFakeLogoFile());
    await expect(saveOnboarding(formDataA)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard");

    const verifyClientA = createAnonClient();
    const { data: signInDataA } = await verifyClientA.auth.signInWithPassword({
      email: emailA,
      password: passwordA,
    });
    const { data: storesA } = await verifyClientA
      .from("stores")
      .select("slug")
      .eq("owner_id", signInDataA.user!.id);
    const takenSlug = storesA![0].slug;

    const { email: emailB } = await signUpAndGetCredentials("slug-taken-b");
    void emailB;

    const formDataB = new FormData();
    formDataB.set("name", "Loja B");
    formDataB.set("accentColor", "#00C46A");
    formDataB.set("tagline", "");
    formDataB.set("whatsapp", "(11) 98888-8888");
    formDataB.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formDataB.set("slug", takenSlug);
    formDataB.set("logo", makeFakeLogoFile());

    const result = await saveOnboarding(formDataB);
    expect(result).toEqual({ error: "Este link já está em uso. Escolha outro." });
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run tests/onboarding/store-settings.test.ts`
Expected: FAIL — `saveOnboarding` ainda não lê `formData.get("slug")` nem grava `slug` em `stores`, então `stores![0].slug` continua sendo o slug provisório do signup (não `"chuteirasdorayan"`), e o teste de colisão não recebe o erro esperado (o `UPDATE` de hoje não toca `slug`, então não colide).

- [ ] **Step 3: Implementar a mudança em `saveOnboarding`**

Em `src/lib/onboarding/actions.ts`, adicionar o import:
```ts
import { onboardingSchema } from "@/lib/validation/onboarding";
import { resolveTimeZone } from "@/lib/time/store-timezone";
```
vira:
```ts
import { onboardingSchema } from "@/lib/validation/onboarding";
import { slugSchema } from "@/lib/slug/validation";
import { resolveTimeZone } from "@/lib/time/store-timezone";
```

Logo depois do parse do `onboardingSchema` (antes da checagem de logo obrigatória), trocar:
```ts
  const parsed = onboardingSchema.safeParse({
    name: formData.get("name"),
    accentColor: formData.get("accentColor") ?? "",
    tagline: formData.get("tagline") ?? "",
    whatsapp: formData.get("whatsapp"),
    messageTemplate: formData.get("messageTemplate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
```
por:
```ts
  const parsed = onboardingSchema.safeParse({
    name: formData.get("name"),
    accentColor: formData.get("accentColor") ?? "",
    tagline: formData.get("tagline") ?? "",
    whatsapp: formData.get("whatsapp"),
    messageTemplate: formData.get("messageTemplate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  // `slug` nunca entra em `onboardingSchema` — esse schema é compartilhado
  // com `saveStoreSettings` (Configurações), que não tem esse campo no
  // FormData. Validado separadamente, igual `checkSlugAvailability`/
  // `updateStoreSlug` já fazem hoje.
  const slugParsed = slugSchema.safeParse(formData.get("slug"));
  if (!slugParsed.success) {
    return { error: slugParsed.error.issues[0]?.message ?? "Link inválido" };
  }
```

E no `UPDATE` de `stores`, trocar:
```ts
  const { error: storeUpdateError } = await supabase
    .from("stores")
    .update({
      name: parsed.data.name,
      accent_color: parsed.data.accentColor || null,
      tagline: parsed.data.tagline || null,
      logo_url: logoUrl,
      timezone,
    })
    .eq("id", store.id);

  if (storeUpdateError) {
    return { error: "Não foi possível salvar os dados da loja." };
  }
```
por:
```ts
  const { error: storeUpdateError } = await supabase
    .from("stores")
    .update({
      name: parsed.data.name,
      slug: slugParsed.data,
      accent_color: parsed.data.accentColor || null,
      tagline: parsed.data.tagline || null,
      logo_url: logoUrl,
      timezone,
    })
    .eq("id", store.id);

  if (storeUpdateError) {
    // Corrida entre a checagem debounced no client e este save (mesma
    // classe de problema que `updateStoreSlug`, em Configurações, já trata
    // — TOCTOU contra a UNIQUE constraint de `stores.slug`). O revendedor já
    // viu uma sugestão de alternativa no client antes de chegar aqui; se
    // mesmo assim colidir, pedir pra tentar de novo é suficiente.
    if (storeUpdateError.code === "23505") {
      return { error: "Este link já está em uso. Escolha outro." };
    }
    return { error: "Não foi possível salvar os dados da loja." };
  }
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run tests/onboarding/store-settings.test.ts`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira de onboarding/auth pra checar regressão**

Run: `npx vitest run tests/onboarding tests/auth`
Expected: PASS (inclui o teste da Task 3 e o de `message-template.test.ts`, que não passa `slug` no `FormData` hoje — conferir se esse teste precisa do campo novo; se sim, adicionar `formData.set("slug", ...)` nele também, seguindo o mesmo formato dos outros testes de sucesso deste arquivo).

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding/actions.ts tests/onboarding/store-settings.test.ts
git commit -m "feat(onboarding): saveOnboarding valida e grava o slug definitivo"
```

---

## Task 11: Fixtures de teste sem hífen em Configurações

**Files:**
- Modify: `tests/settings/slug-availability.test.ts`
- Modify: `tests/settings/update-slug.test.ts`

**Interfaces:** nenhuma — só dados de teste.

- [ ] **Step 1: Rodar os dois arquivos como baseline (podem já estar quebrados pelas Tasks 2/6 — confirmar o motivo exato)**

Run: `npx vitest run tests/settings/slug-availability.test.ts tests/settings/update-slug.test.ts`
Expected: dois casos falhando pelo motivo identificado na spec — `` `slug-livre-${Date.now()}` `` e `` `slug-novo-${Date.now()}` `` agora são rejeitados por formato (contêm hífen), não pelo motivo que o teste quer provar.

- [ ] **Step 2: Trocar os fixtures com hífen por equivalentes sem hífen**

Em `tests/settings/slug-availability.test.ts`, trocar:
```ts
  const takenSlug = `loja-b-ocupado-${Date.now()}`;
```
por:
```ts
  const takenSlug = `lojabocupado${Date.now()}`;
```

E trocar:
```ts
    const unusedSlug = `slug-livre-${Date.now()}`;
```
por:
```ts
    const unusedSlug = `slugdisponivel${Date.now()}`;
```

Em `tests/settings/update-slug.test.ts`, trocar:
```ts
    const takenSlug = `loja-b-taken-${Date.now()}`;
```
por:
```ts
    const takenSlug = `lojabtaken${Date.now()}`;
```

E trocar:
```ts
    const freshSlug = `slug-novo-${Date.now()}`;
```
por:
```ts
    const freshSlug = `slugnovo${Date.now()}`;
```

- [ ] **Step 3: Rodar e confirmar que passam**

Run: `npx vitest run tests/settings/slug-availability.test.ts tests/settings/update-slug.test.ts`
Expected: PASS (6/6 no total entre os dois arquivos)

- [ ] **Step 4: Commit**

```bash
git add tests/settings/slug-availability.test.ts tests/settings/update-slug.test.ts
git commit -m "test(settings): fixtures de slug sem hifen, alinhados ao novo charset"
```

---

## Task 12: Suíte completa + typecheck + lint

**Files:** nenhum arquivo novo — validação final.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 2: Lint completo**

Run: `npx eslint .`
Expected: PASS, zero erros (avisos pré-existentes não relacionados a esta mudança podem continuar, mas nenhum novo).

- [ ] **Step 3: Suíte de testes completa**

Run: `npx vitest run`
Expected: PASS. Prestar atenção especial em:
- `tests/slug/*` (Tasks 1, 2, 4)
- `tests/auth/ensure-store-slug.test.ts` (Task 3)
- `tests/settings/slug-availability.test.ts`, `tests/settings/update-slug.test.ts` (Tasks 6, 11)
- `tests/onboarding/*` (Task 10)

Se algum teste falhar por rate limit do Supabase de teste (padrão conhecido do projeto — falhas em massa na suíte tendem a ser rate limit, não bug real), rodar de novo só o arquivo afetado antes de investigar como regressão.

- [ ] **Step 4: Checklist manual final (cadastro → onboarding → vitrine)**

Com `npm run dev` rodando:
1. Criar uma conta nova com um email de teste.
2. Em `/admin/onboarding`, digitar um nome de loja com espaço e acento (ex.: "Ção Ótimo Sapatos") e confirmar que o `@` vira `caootimosapatos`, sem hífen.
3. Completar o onboarding (logo + WhatsApp) e confirmar o redirect pro dashboard.
4. Abrir a vitrine pública (`/<slug>`) e confirmar que a URL e o `@{slug}` exibido no topo (`store-hero.tsx:217`) batem com o que foi digitado.
5. Ir em `/admin/configuracoes`, digitar um `@` com hífen manualmente e confirmar que o campo mostra o erro "Use apenas letras e números (3 a 30 caracteres)." e trava o "Salvar alterações".
6. Digitar um `@` válido só de letras/números com mais de 20 caracteres e confirmar que aparece o aviso "Meio longo pra passar por WhatsApp", sem travar o save.

- [ ] **Step 5: Commit final (se qualquer ajuste tiver sido feito durante a checagem)**

```bash
git add -A
git commit -m "chore: ajustes finais da validacao do @ sem hifen"
```

(Pular este commit se nenhum arquivo mudou durante a Task 12 — os steps anteriores são só validação.)
