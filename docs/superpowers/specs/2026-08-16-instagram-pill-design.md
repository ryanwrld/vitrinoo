# Pill de Instagram na vitrine + campo no onboarding

## Contexto

O campo `stores.instagram` já existe no banco e já é usado em três lugares:

- `settings-form.tsx` — formulário de configurações já pede o Instagram (opcional).
- `store-hero.tsx` — vitrine pública já mostra um ícone circular de Instagram nas ações do topo e uma linha de texto `instagram.com/handle` abaixo do bloco de estatísticas.
- `store-sticky-bar.tsx` — barra fixa que aparece ao rolar também tem seu próprio ícone de Instagram.

O que falta:

1. Um botão em formato **pill** na vitrine pública, **ao lado do `@{slug}`** (linha do handle da loja), visualmente igual à referência do usuário (badge do Threads ao lado do handle do Instagram): `rounded-full`, borda fina, fundo neutro, ícone + `@handle`. Este pill é **adicional** — o ícone circular das ações e a linha de texto `instagram.com/handle` continuam existindo, sem mudança (decisão confirmada com o usuário).
2. O onboarding (`onboarding-wizard.tsx`) ainda não pede Instagram — só o `@slug` da própria loja. O schema (`onboardingSchema`) já aceita o campo opcional; falta o input no formulário e a gravação no servidor.

## Escopo

Fora de escopo (não mexer):

- `settings-form.tsx` (já tem o campo, não precisa mudar).
- `store-sticky-bar.tsx` (ícone próprio, fora do pedido do usuário).
- Qualquer rota de dashboard/admin não citada aqui.

## Design

### 1. Pill na vitrine pública (`store-hero.tsx`)

Local: dentro do bloco `<div className="mt-4 flex flex-col gap-1">` que hoje só tem `<h1>` (nome) e `<p>@{store.slug}</p>` (linha ~205-218).

A linha do `@slug` passa a ser um `flex` com o pill ao lado, só quando `store.instagram` existir:

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

Pontos de disciplina do projeto que este trecho já respeita:

- `<a href>` real, não `onClick`/`window.open` — mesma regra do CTA de WhatsApp, pelos mesmos webviews problemáticos (Instagram/WhatsApp in-app browser).
- URL montada só por `instagramProfileUrl` (fonte única, já existe em `lib/social/instagram.ts`) — nunca concatenar `instagram.com/` à mão de novo.
- `InstagramIcon` reaproveitado (mesmo componente usado no ícone circular e na linha de texto), sem nova dependência.
- `flex-wrap` na linha: em tela estreita com nome de loja e handle longos, o pill quebra para a linha de baixo em vez de espremer.

### 2. Campo de Instagram no onboarding (`onboarding-wizard.tsx`)

Novo bloco logo após "Frase de apresentação" (antes de "WhatsApp"), mesmo padrão visual do campo equivalente em `settings-form.tsx` (label + rótulo "Opcional" + prefixo `@` fixo dentro do input, sem registrar o `@` no valor):

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
  {errors.instagram && <span className="text-sm text-error-solid">{errors.instagram.message}</span>}
</div>
```

`useForm<OnboardingInput>` não precisa de `defaultValues.instagram` — string opcional já nasce `undefined`, igual aos outros campos opcionais do wizard.

No `handleFormSubmit` (onde hoje monta o `FormData`), adicionar:

```ts
formData.set("instagram", values.instagram ?? "");
```

### 3. Persistência (`saveOnboarding` em `lib/onboarding/actions.ts`)

Hoje a action nem lê nem grava `instagram`. Replicar exatamente o padrão já usado em `settings/actions.ts`:

```ts
const instagramResult = normalizeInstagramHandle(formData.get("instagram") as string | null);
if ("error" in instagramResult) {
  return { error: instagramResult.error };
}
```

E incluir `instagram: instagramResult.handle` no `.update({...})` de `stores` que já existe (linhas ~160-169), junto de `name`, `slug`, `accent_color`, `tagline`, `logo_url`, `timezone`.

Nenhuma migração de banco — a coluna já existe e já é lida por `store-hero.tsx`.

## Fluxo conectado (revendedor → cliente final)

1. Revendedor preenche Instagram (opcional) no onboarding ou depois em Configurações — mesmo campo, mesma normalização (`normalizeInstagramHandle`), uma única fonte de verdade no banco.
2. Se não preencher, nada muda na vitrine: nem pill, nem ícone, nem linha de texto aparecem (todos os três já são condicionais a `store.instagram`).
3. Se preencher, o cliente final vê o pill ao lado do `@slug` assim que abre a vitrine — sem esperar cache, sem passo extra — e um clique abre o perfil exato do Instagram em nova aba, funcionando dentro de webviews do Instagram/WhatsApp (link real, não JS).

## Testes

Não há teste de servidor para `saveOnboarding` cobrindo Instagram ainda. Ao implementar, adicionar um caso ao arquivo de teste de onboarding existente (mesmo arquivo/padrão de `tests/onboarding/store-settings.test.ts`, se aplicável) cobrindo: (a) Instagram vazio não bloqueia o onboarding, (b) handle inválido retorna erro, (c) handle salvo aparece depois em `stores.instagram`.
