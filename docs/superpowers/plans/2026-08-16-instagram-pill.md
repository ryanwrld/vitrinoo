# Pill de Instagram na vitrine + campo no onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar um botão pill de Instagram ao lado do `@slug` na vitrine pública, e permitir que o revendedor informe o Instagram já no onboarding (hoje só dá pra fazer isso depois, em Configurações).

**Architecture:** Três mudanças independentes e sequenciais sobre a mesma coluna já existente `stores.instagram`: (1) o servidor de onboarding passa a ler/normalizar/gravar esse campo, replicando o padrão já usado em `settings/actions.ts`; (2) o formulário de onboarding ganha o input correspondente; (3) a vitrine pública ganha um `<a>` em formato pill, condicional a `store.instagram`, ao lado do texto `@{store.slug}`.

**Tech Stack:** Next.js 16 App Router, React 19, react-hook-form + zod, Tailwind CSS v4, Supabase (testes de integração contra o projeto real, sem mocks de banco).

## Global Constraints

- Toda URL de perfil do Instagram vem só de `instagramProfileUrl` (`src/lib/social/instagram.ts`) — nunca concatenar `instagram.com/` manualmente de novo.
- Todo link para fora (WhatsApp, Instagram) usa `<a href>` real — nunca `onClick`/`window.open`, por causa dos webviews in-app do Instagram/WhatsApp.
- Normalização de Instagram roda **uma única vez**, no servidor, via `normalizeInstagramHandle` — nunca reimplementar a validação em outro lugar.
- Testes de Server Actions rodam contra o Supabase real (padrão do projeto) — nunca mockar o cliente Supabase.
- Sem migração de banco: a coluna `stores.instagram` já existe.

---

### Task 1: `saveOnboarding` lê, normaliza e grava o Instagram

**Files:**
- Modify: `src/lib/onboarding/actions.ts`
- Test: `tests/onboarding/store-settings.test.ts`

**Interfaces:**
- Consumes: `normalizeInstagramHandle(raw: string | null | undefined): { handle: string | null } | { error: string }` de `src/lib/social/instagram.ts` (já existe, já usada em `src/lib/settings/actions.ts:330`).
- Produces: `stores.instagram` passa a ser gravada por `saveOnboarding` (antes só era gravada por `updateStoreSettings`).

- [ ] **Step 1: Escrever o teste que falha — Instagram salvo com sucesso**

Adicionar ao final do primeiro `describe` em `tests/onboarding/store-settings.test.ts`, depois do teste `"salva nome/cor/frase, normaliza o WhatsApp e seta onboarding_completed_at"`:

```ts
  it("salva o Instagram normalizado quando informado", async () => {
    const { email, password } = await signUpAndGetCredentials("instagram-ok");

    const formData = new FormData();
    formData.set("name", "Loja Com Instagram");
    formData.set("accentColor", "#00C46A");
    formData.set("tagline", "");
    formData.set("whatsapp", "(11) 97777-6666");
    formData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formData.set("slug", "lojacominstagram");
    formData.set("instagram", "@RLEsportes");
    formData.set("logo", makeFakeLogoFile());

    await expect(saveOnboarding(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard");

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: stores } = await verifyClient
      .from("stores")
      .select("*")
      .eq("owner_id", signInData.user!.id);
    expect(stores).toHaveLength(1);
    expect(stores![0].instagram).toBe("rlesportes");

    await verifyClient.from("stores").delete().eq("id", stores![0].id);
  }, 30000);

  it("rejeita Instagram inválido sem salvar nada", async () => {
    await signUpAndGetCredentials("instagram-invalido");

    const formData = new FormData();
    formData.set("name", "Loja Instagram Inválido");
    formData.set("accentColor", "");
    formData.set("tagline", "");
    formData.set("whatsapp", "(11) 96666-5555");
    formData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formData.set("instagram", "https://instagram.com/@espaço inválido");
    formData.set("logo", makeFakeLogoFile());

    const result = await saveOnboarding(formData);
    expect(result).toEqual({ error: expect.any(String) });
  });
```

**Note:** `normalizeInstagramHandle` já é responsável por reduzir `@RLEsportes` para `rlesportes` (lowercase, sem `@`) — ver `src/lib/social/instagram.ts:30-60` para o comportamento exato antes de escrever o teste, para não inventar uma expectativa que a função não cumpre.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/onboarding/store-settings.test.ts -t "Instagram"`
Expected: FAIL — `stores![0].instagram` vem `null` porque `saveOnboarding` ainda não grava o campo (primeiro teste falha na asserção; segundo teste falha porque não há validação de Instagram, então nada retorna erro e a Server Action redireciona em vez de devolver `{ error }`).

- [ ] **Step 3: Implementar — ler, normalizar e gravar**

Em `src/lib/onboarding/actions.ts`, importar `normalizeInstagramHandle`:

```ts
import { normalizeInstagramHandle } from "@/lib/social/instagram";
```

Logo antes do bloco `const { error: storeUpdateError } = await supabase.from("stores").update({...})` (linha ~160), adicionar a normalização — mesmo lugar relativo (antes do update de `stores`) que `settings/actions.ts` usa:

```ts
  const instagramResult = normalizeInstagramHandle(formData.get("instagram") as string | null);
  if ("error" in instagramResult) {
    return { error: instagramResult.error };
  }
```

E incluir o campo no objeto do `.update(...)` de `stores` já existente:

```ts
  const { error: storeUpdateError } = await supabase
    .from("stores")
    .update({
      name: parsed.data.name,
      slug: slugParsed.data,
      accent_color: parsed.data.accentColor || null,
      tagline: parsed.data.tagline || null,
      instagram: instagramResult.handle,
      logo_url: logoUrl,
      timezone,
    })
    .eq("id", store.id);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/onboarding/store-settings.test.ts -t "Instagram"`
Expected: PASS — os dois testes novos passam; rodar o arquivo inteiro depois (`npx vitest run tests/onboarding/store-settings.test.ts`) para confirmar que os testes pré-existentes continuam passando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/actions.ts tests/onboarding/store-settings.test.ts
git commit -m "feat(onboarding): saveOnboarding normaliza e grava o Instagram"
```

---

### Task 2: Campo de Instagram no formulário de onboarding

**Files:**
- Modify: `src/app/admin/onboarding/onboarding-wizard.tsx`

**Interfaces:**
- Consumes: `onboardingSchema` de `src/lib/validation/onboarding.ts` (já tem `instagram: z.string().trim().max(120).optional().or(z.literal(""))` — nenhuma mudança de schema necessária). `saveOnboarding` de Task 1, que já lê `formData.get("instagram")`.
- Produces: nada consumido por tasks futuras — este componente é folha.

Esta task não tem teste automatizado dedicado (é um formulário client-side sem lógica nova além de exibir/registrar um input já coberto pelo schema existente); a verificação é visual, feita no Step 3.

- [ ] **Step 1: Adicionar o campo no JSX, entre "Frase de apresentação" e "WhatsApp"**

Em `src/app/admin/onboarding/onboarding-wizard.tsx`, depois do bloco `tagline` (que termina em `{errors.tagline && ...}</div>`, por volta da linha 232) e antes do bloco `whatsapp` (que começa com `<label htmlFor="whatsapp"`, por volta da linha 234), inserir:

```tsx
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="instagram" className="text-sm font-medium text-gray-700">
              Instagram
            </label>
            <span className="text-xs text-gray-500">Opcional</span>
          </div>
          <div className="flex items-center rounded-xl border border-gray-300 bg-white transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle">
            <span className="pl-3 text-base text-gray-400">@</span>
            <input
              id="instagram"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="rlesportes"
              {...register("instagram")}
              className="h-11 w-full bg-transparent px-2 text-base text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>
          {errors.instagram && (
            <span className="text-sm text-error-solid">{errors.instagram.message}</span>
          )}
        </div>
```

- [ ] **Step 2: Incluir o campo no `FormData` enviado ao servidor**

No handler que monta o `FormData` (onde já existe `formData.set("tagline", values.tagline ?? "");`, por volta da linha 117), adicionar logo depois:

```ts
    formData.set("instagram", values.instagram ?? "");
```

- [ ] **Step 3: Verificar visualmente**

Run: `npm run dev` (ou confirmar que o servidor dev já está rodando em outra aba, per project convention — perguntar antes de reiniciar se já estiver de pé)
Abrir `/admin/onboarding` com uma conta nova, digitar um nome, confirmar que o campo "Instagram" aparece entre "Frase de apresentação" e "WhatsApp", com o prefixo `@` fixo e o rótulo "Opcional". Preencher com um handle (ex.: `rlesportes`) e completar o onboarding — confirma que não há erro de validação bloqueando o submit quando o campo fica vazio, e que também aceita um valor preenchido.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/onboarding/onboarding-wizard.tsx
git commit -m "feat(onboarding): campo opcional de Instagram no wizard"
```

---

### Task 3: Pill de Instagram na vitrine pública

**Files:**
- Modify: `src/app/[slug]/store-hero.tsx`

**Interfaces:**
- Consumes: `store.instagram: string | null` (já existe em `StoreHeroData`, já populado por `src/app/[slug]/page.tsx:175`). `instagramProfileUrl(handle: string): string` de `src/lib/social/instagram.ts` (já importado no arquivo). `InstagramIcon` de `src/components/icons/instagram-icon.tsx` (já importado no arquivo).
- Produces: nada consumido por tasks futuras — este componente é folha.

Sem teste automatizado dedicado: `store-hero.tsx` é puramente apresentacional (Server Component sem lógica de branching além do `store.instagram &&` já usado nos outros dois blocos existentes no mesmo arquivo); a verificação é visual.

- [ ] **Step 1: Envolver a linha do `@slug` em um `flex` com o pill condicional**

Em `src/app/[slug]/store-hero.tsx`, dentro do bloco (por volta da linha 205-218):

```tsx
        <div className="mt-4 flex flex-col gap-1">
          <h1 className="flex items-center gap-1.5 font-display text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl lg:text-3xl">
            {store.name}
            <BadgeCheck
              className="relative top-[2px] h-[22px] w-[22px] shrink-0 sm:top-[3px] sm:h-6 sm:w-6 lg:top-1 lg:h-7 lg:w-7"
              style={{ fill: "#1DA1F2", color: "white" }}
              aria-label="Loja verificada"
            />
          </h1>
          <p className="text-sm text-gray-500">@{store.slug}</p>
        </div>
```

substituir o `<p>@{store.slug}</p>` isolado por:

```tsx
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-500">@{store.slug}</p>
            {store.instagram && (
              <a
                href={instagramProfileUrl(store.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Instagram de ${store.name}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-900 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              >
                <InstagramIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {store.instagram}
              </a>
            )}
          </div>
```

Note: `instagramProfileUrl` e `InstagramIcon` já estão importados no topo do arquivo (linhas 3 e 8) — nenhum novo import necessário. Não remover nem alterar o ícone circular nas ações do topo (linhas ~191-201) nem a linha `instagram.com/{store.instagram}` mais abaixo (linhas ~247-263) — os três convivem, por decisão do usuário.

- [ ] **Step 2: Verificar visualmente**

Abrir a vitrine pública de uma loja de teste que já tenha `instagram` preenchido (ex.: via Configurações, se nenhuma tiver ainda) em `/{slug}`. Confirmar:
- O pill aparece ao lado de `@{slug}`, com cantos totalmente arredondados, borda fina cinza, fundo branco, ícone do Instagram + handle.
- Em uma loja sem `instagram` preenchido, o pill não aparece e a linha do `@slug` continua normal (sem espaço vazio estranho).
- Clicar no pill abre `https://instagram.com/<handle>` em nova aba.
- Testar em viewport estreito (mobile): o pill quebra para a linha de baixo do `@slug` se não couber, em vez de espremer o texto.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[slug]/store-hero.tsx"
git commit -m "feat(vitrine): pill de Instagram ao lado do @slug no cabeçalho"
```
