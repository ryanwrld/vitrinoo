# Design — @ (slug) limpo desde o cadastro, sem hífen

**Data:** 2026-08-16
**Status:** Aprovado no brainstorming, pronto pra virar plano de implementação

## Contexto e objetivo

Hoje o @ de uma loja nova nasce automático e feio em `ensure-store.ts` (`generateStoreSlug`): `slugify(parte-antes-do-@-do-email) + "-" + 6 caracteres aleatórios` (ex.: `maria-tenis-a8f3k2`). Esse slug é ao mesmo tempo a URL pública (`vitrinoo.app/<slug>`) e o handle exibido na vitrine (`@{store.slug}`, `store-hero.tsx:217`) — não existem dois campos, é a mesma string usada nos dois lugares.

O onboarding wizard (`onboarding-wizard.tsx`) já pede o **nome da loja**, mas isso acontece *depois* que a loja foi criada com o slug feio, e `saveOnboarding` hoje só atualiza `stores.name` — nunca `stores.slug`. O dado limpo (nome digitado) existe e não é aproveitado.

**Objetivo:** o slug (= URL = @) nasce limpo, curto e **sem hífen** direto no cadastro, a partir do nome que o revendedor já digita no onboarding — sem exigir uma segunda visita a Configurações pra ficar apresentável.

Cadeia de valor que justifica a prioridade (dita pelo usuário): nome limpo → fácil de lembrar/digitar → mais acesso direto → mais tráfego pra vitrine → mais conversão pro WhatsApp → venda.

**Sem usuários reais hoje** (confirmado) — o escopo é só o que passa a acontecer daqui pra frente. Nenhuma migração de contas antigas, nenhum banner de aviso, nenhum domínio customizado.

## Regra de formato nova: sem hífen, tipo handle de rede social

Decisão explícita do usuário: o slug não pode ter traço — nem os gerados automaticamente, nem os digitados manualmente. `@rlesportes`, nunca `@rl-esportes`.

Isso muda dois arquivos que hoje são compartilhados entre onboarding (novo) e Configurações (já existe):

### `src/lib/slug/slugify.ts`

Hoje: qualquer run de caractere fora de `[a-z0-9]` vira um único hífen.
Novo: qualquer run de caractere fora de `[a-z0-9]` é **removido** (concatena as palavras em vez de separar por hífen).

```
"RL Esportes"              → "rlesportes"           (hoje: "rl-esportes")
"Chuteiras SP - Original"  → "chuteirassporiginal"  (hoje: "chuteiras-sp-original")
```

Nota: nomes com múltiplas palavras viram uma palavra grudada, igual handle de Instagram (`@lojadetenis`, não `@loja-de-tenis`). É a consequência direta e aceita da regra "sem traço" — não tem meio-termo (hífen como separador é a única alternativa a concatenar ou truncar palavras, e ambas as opções descartadas na conversa).

Passo de fold de acento (NFD) continua igual — só muda o que acontece com o separador.

### `src/lib/slug/validation.ts`

`SLUG_CHARSET_REGEX` sai de `/^[a-z0-9-]+$/` pra `/^[a-z0-9]+$/`. Os dois `.refine()` de hífen nas pontas (`startsWith("-")`/`endsWith("-")`) somem — ficam impossíveis com o novo charset, checagem morta.

Copy de erro muda de "Use apenas letras, números e hífens (3 a 30 caracteres)." pra **"Use apenas letras e números (3 a 30 caracteres)."**

O comentário do arquivo cita essa mensagem como "contrato de copy exato do 02-UI-SPEC.md — não parafrasear". Esse arquivo não existe no repo (busquei, não achei) — provavelmente doc de planejamento externo/arquivado. Tratando o código como fonte de verdade atual: a mensagem nova acima é o novo contrato: atualizar o comentário no próprio arquivo pra refletir isso, sem depender de um doc externo que não está versionado aqui.

**Reserved slugs** (`admin`, `api`, `static`, `public`, `www`) continuam — nenhum deles tem hífen, nada muda ali.

Essa mudança de charset vale pros dois fluxos que usam `slugSchema`: o campo novo no onboarding E a edição existente em Configurações (`updateStoreSlug`/`checkSlugAvailability` em `settings/actions.ts`) — mesma regra nos dois lugares, por coerência.

## Descoberta que muda o plano: o campo já existe, só não está no onboarding

Configurações (`configuracoes/`) já tem um campo de slug **inteiro e funcionando**, com exatamente o comportamento que o onboarding precisa:

- `slug-editor.tsx` — o componente visual (input + prévia `/{slug}` + pill de status).
- `slug-field-context.tsx` — o contrato de estado (`rawSlug`, `slug` normalizado, `formatError`, `status`).
- A lógica de normalização síncrona (`slugify`) + validação síncrona (`slugSchema`) + checagem de disponibilidade debounced (`checkSlugAvailability`) vive hoje **inline dentro de `settings-form.tsx`** (linhas ~154-193), alimentando o contexto acima.

Construir um campo `@` novo do zero no onboarding, do jeito que o rascunho anterior desta spec propunha, duplicaria essa lógica em dois lugares — exatamente o tipo de coisa que diverge com o tempo (um lugar ganha uma correção, o outro não). A abordagem correta é **extrair** a lógica inline de `settings-form.tsx` pra um hook compartilhado e reusar `SlugEditor`/`SlugFieldProvider` tal como já são, nos dois formulários.

## Fluxo proposto

### 1. Cadastro (signup) — sem mudança visível

`ensure-store.ts` continua criando a loja na hora com um slug provisório (ninguém vê isso — é só pra linha existir no banco antes do onboarding rodar). Único ajuste: `generateStoreSlug` para de colar o sufixo aleatório com hífen (`` `${base}-${suffix}` `` → `` `${base}${suffix}` ``) — a `slugify` nova já não insere hífen no `base`. **Sem adicionar checagem de disponibilidade aqui** (isso ficaria pro passo 2/3): o retry-on-`23505` que já existe (`MAX_SLUG_ATTEMPTS`) continua sendo a única rede de segurança neste ponto, de propósito — este slug é descartável, e uma chamada de rede extra no caminho crítico do cadastro (RPC de disponibilidade) é custo sem benefício real, já que ninguém vê esse valor.

### 2. Novo hook compartilhado: `src/lib/slug/use-slug-field.ts`

Extrai o bloco inline de `settings-form.tsx` (linhas ~154-193: `slugify(rawSlug)`, debounce, `slugSchema.safeParse`, chamada a `checkSlugAvailability` via `startTransition`) pra:

```ts
function useSlugField(params: { currentSlug: string }): SlugFieldState & { setRawSlug: (v: string) => void }
```

`settings-form.tsx` passa a chamar esse hook em vez de ter a lógica inline — refatoração mecânica, comportamento idêntico ao de hoje (mesmos testes, `update-slug.test.ts`/`slug-availability.test.ts`, continuam validando o mesmo caminho, só que agora através do hook em vez de código solto no componente).

### 3. Onboarding (continua tela única) — reusa `SlugEditor`

Abaixo do campo "Nome da loja", renderiza o mesmo `<SlugEditor />` de Configurações, alimentado por `useSlugField` + um `SlugFieldProvider` local no wizard. Duas diferenças de comportamento em relação a Configurações, específicas do onboarding:

- **Autofill enquanto não editado à mão:** o `rawSlug` inicial e todo update subsequente do campo "Nome da loja" (via `watch("name")` do react-hook-form) atualiza o `@` automaticamente com `slugify(nome)` — **até** a pessoa tocar o campo `@` diretamente. A partir daí, o autofill para (padrão "campo dependente até edição manual", comum em qualquer admin com slug de URL). Um `slugManuallyEdited` boolean local resolve isso.
- **`currentSlug` do hook = o slug provisório** que `ensure-store.ts` já gravou no signup — então `needsSlugCheck` (a comparação que já existe no hook) dispara a checagem de disponibilidade naturalmente assim que o autofill produzir algo diferente do provisório, sem nenhum caso especial.

**Colisão** → mesma UI que Configurações já tem hoje (pill "Este link já está em uso."); adicionalmente, ao detectar colisão o campo sugere `nome2`, `nome3`... automaticamente em vez de deixar a pessoa adivinhar (essa parte É nova, Configurações não tem — ver "Util novo" abaixo).

**Trava de submit:** o botão "Concluir" fica desabilitado enquanto `status` for `"checking"` ou `"taken"` ou houver `formatError` — mesmo princípio que já existe em `settings-form.tsx` ("Trava o save enquanto o link estiver inválido/ocupado", linha ~234), só replicado pro botão do wizard.

**Aviso de tamanho (não bloqueante):** o `SlugEditor` compartilhado ganha um indicador leve abaixo do slug — neutro até ~20 caracteres, aviso sutil ("meio longo pra passar por WhatsApp") acima disso. Vai no componente compartilhado, não só no onboarding — Configurações se beneficia igual, e evita duas versões do mesmo campo com comportamento visual diferente.

### 4. Util novo compartilhado: `resolveAvailableSlug` (usado só no client, pra sugestão de colisão)

```ts
// src/lib/slug/resolve-available.ts
async function resolveAvailableSlug(base: string, maxAttempts = 20): Promise<string | null>
```

Chama `checkSlugAvailability` (a mesma Server Action que já existe) tentando `base`, `base2`, `base3`... até achar uma livre ou esgotar `maxAttempts`. Roda **só no onboarding**, e só quando `status === "taken"`, pra popular a sugestão automática — não entra no caminho de `ensure-store.ts` (ver passo 1: lá o objetivo é o oposto, zero chamada de rede extra) nem substitui a rede de segurança server-side do passo 5.

### 5. `saveOnboarding` passa a atualizar `stores.slug`

Hoje o `UPDATE` em `stores` (linha ~149-158 de `src/lib/onboarding/actions.ts`) seta `name`, `accent_color`, `tagline`, `logo_url`, `timezone`. Passa a incluir `slug` também, **validado com `slugSchema` diretamente no server action — nunca adicionado ao `onboardingSchema`** (motivo detalhado na seção de efeitos colaterais abaixo: `onboardingSchema` é compartilhado com `settings-form.tsx`, que não tem esse campo).

Em caso de colisão na gravação (corrida entre a checagem debounced e o save — mesma classe de problema que `updateStoreSlug` já trata hoje via `error.code === "23505"`), devolve o mesmo erro amigável que `updateStoreSlug` já usa ("Este link já está em uso. Escolha outro.") em vez de tentar resolver sozinho no servidor — o usuário já viu a sugestão de colisão no client (passo 4); se mesmo assim colidir na gravação (corrida rara), pedir pra tentar de novo é suficiente, não precisa de retry automático duplicando a lógica do passo 4 no servidor.

## Efeitos colaterais identificados e já resolvidos no desenho acima

Levantamento feito ANTES de qualquer código, lendo todo o código e testes que dependem de `slugify`/`slugSchema`/`onboardingSchema` hoje (`grep` em `src` e `tests`), pra não descobrir isso já com o ambiente pela metade.

1. **`tests/slug/slugify.test.ts` vai quebrar — precisa ser atualizado como parte desta mudança, não depois.** Os testes atuais afirmam hífen no resultado (`slugify("Sapatênis São Paulo") === "sapatenis-sao-paulo"`, `slugify("  --Nike__Air!!  ") === "nike-air"`). Com a normalização nova, os valores esperados passam a ser `"sapatenissaopaulo"` e `"nikeair"`. Isso faz parte do plano de implementação (não é um efeito colateral a mitigar, é uma atualização de teste esperada e consciente).

2. **`tests/settings/slug-availability.test.ts` e `tests/settings/update-slug.test.ts` têm fixtures com hífen que passam pelo `slugSchema` novo.** Dois casos especificamente quebrariam pelo motivo ERRADO (rejeição de formato, não o que o teste quer provar):
   - `slug-availability.test.ts`: `` `slug-livre-${Date.now()}` `` no teste "retorna available=true para um slug não utilizado" — com hífen, passaria a falhar no formato antes mesmo de chegar na checagem de unicidade que o teste existe pra provar.
   - `update-slug.test.ts`: `` `slug-novo-${Date.now()}` `` no teste "salva com sucesso um slug novo" — mesmo problema.
   - Os outros fixtures com hífen (`loja-b-ocupado-*`, `loja-b-taken-*`) são inseridos **direto via `.insert()` no client bruto de teste**, contornando o `slugSchema` (banco não tem CHECK de charset — confirmado lendo `0001_init_stores_rls.sql`) — esses continuam funcionando como "slug de outro tenant", mas o motivo do `available:false`/erro muda de "é de outro tenant" pra "formato inválido" nos dois testes que passam esse valor pra `checkSlugAvailability`/`updateStoreSlug`. Testa a coisa errada mesmo sem quebrar.
   - **Resolução:** trocar os geradores desses fixtures pra não usar hífen (ex.: `` `lojabocupado${Date.now()}` ``, `` `slugnovo${Date.now()}` ``) como parte desta mudança, mantendo a intenção original de cada teste.

3. **`supabase/migrations/0007_cleanup_test_data_pollution.sql` é uma migration histórica já aplicada** que limpa lixo de teste antigo casando por padrões com hífen (`loja-b-taken-%`, etc.). Não deve ser editada retroativamente (migration já rodou). Consequência prática: se a suíte de teste voltar a poluir o banco de teste depois desta mudança, os padrões de limpeza precisam ser uma migration NOVA com os padrões sem hífen — não é bloqueador agora (sem usuário real, sem poluição ainda), só uma nota pra quem for escrever a próxima limpeza.

4. **`onboardingSchema` é compartilhado entre `onboarding-wizard.tsx` E `settings-form.tsx`** (D-07 — mesmo schema reusado de propósito, confirmado em `settings/actions.ts:202` e `settings-form.tsx:111`). Adicionar `slug` DENTRO desse schema quebraria `saveStoreSettings`, que roda o mesmo `onboardingSchema.safeParse` sem nenhum campo `slug` no FormData que envia. **Resolução, já refletida no fluxo acima:** o slug é validado separadamente com `slugSchema` direto em `saveOnboarding`, nunca dentro de `onboardingSchema` — os dois schemas continuam independentes, exatamente como `checkSlugAvailability`/`updateStoreSlug` já fazem hoje.

5. **Nome que produz slug vazio ou curto demais** (ex.: nome só com emoji/símbolo, ou nome de 1-2 caracteres — `onboardingSchema.name` só exige `min(1)`). Já coberto sem código extra: o `formatError` do `slugSchema` ("O link precisa ter entre 3 e 30 caracteres") aparece no `SlugEditor` reusado e trava o submit, igual já acontece em Configurações hoje pra qualquer slug fora do padrão. Único ajuste preventivo: manter o fallback `slugify(name) || "loja"` (mesmo padrão que `ensure-store.ts` já usa) como valor inicial do autofill, pra nunca autofillar um campo `@` literalmente vazio.

6. **Banco de dados:** confirmado em `0001_init_stores_rls.sql` (`slug text not null unique`) e `0002_slug_availability_rpc.sql` (RPC faz `=` exato) — nenhum CHECK de charset no schema, nenhuma migration necessária. A mudança é 100% na camada de validação da aplicação.

## Fora de escopo

- Migração de contas/slugs antigos (não existem usuários reais).
- Banner ou incentivo pra quem "já tem" um slug feio.
- Remoção automática de palavras de preenchimento (de/da/loja) do nome digitado — mencionada como ideia na conversa, mas não fechada; fica de fora deste ciclo.
- Domínio customizado.
- Mudança na tela de Configurações além do charset compartilhado (o fluxo de troca lá — `updateStoreSlug`, confirmação destrutiva — continua exatamente como está).

## Arquitetura (isolamento)

| Arquivo | Papel | Muda? |
|---|---|---|
| `src/lib/slug/slugify.ts` | Normalização de texto livre → slug | Sim — remove separador em vez de virar hífen |
| `src/lib/slug/validation.ts` | Schema Zod (charset, tamanho, reservados) | Sim — charset sem hífen, copy de erro nova, refines de hífen nas pontas removidos |
| `src/lib/slug/use-slug-field.ts` (novo) | Hook extraído: estado do campo slug (raw, normalizado, formatError, status debounced) | Novo — extraído de `settings-form.tsx`, comportamento idêntico |
| `src/lib/slug/resolve-available.ts` (novo) | Sugestão de slug livre no client (`base`, `base2`, `base3`...) via `checkSlugAvailability` | Novo — só usado pelo onboarding em caso de colisão |
| `src/lib/auth/ensure-store.ts` | Cria loja no signup com slug provisório | Sim — só remove o hífen de junção em `generateStoreSlug`; sem chamada de rede nova |
| `src/app/admin/(painel)/configuracoes/settings-form.tsx` | Formulário de Configurações | Sim — refatoração mecânica: passa a usar `use-slug-field.ts` em vez da lógica inline; comportamento e testes existentes preservados |
| `src/app/admin/(painel)/configuracoes/slug-editor.tsx` | Componente visual do campo `@` | Sim — ganha o indicador de tamanho (não bloqueante); resto reusado como está, também pelo onboarding |
| `src/app/admin/(painel)/configuracoes/slug-field-context.tsx` | Contrato de estado do campo `@` | Não muda |
| `src/app/admin/onboarding/onboarding-wizard.tsx` | Formulário de onboarding (client) | Sim — renderiza `<SlugEditor>` via `use-slug-field.ts`, autofill a partir de `name` até edição manual, submit travado em `checking`/`taken`/erro de formato |
| `src/lib/onboarding/actions.ts` (`saveOnboarding`) | Server Action do onboarding | Sim — grava `slug` (validado direto com `slugSchema`, fora do `onboardingSchema`), trata colisão de gravação com a mesma mensagem de `updateStoreSlug` |
| `src/lib/settings/actions.ts` (`checkSlugAvailability`, `updateStoreSlug`) | Checagem/troca de slug em Configurações | Não muda de comportamento — só herda o `slugSchema` com charset novo automaticamente |

## Critérios de aceite

1. Cadastrar uma conta nova e completar o onboarding com "RL Esportes" no nome produz `@rlesportes` (sem hífen) como slug final, refletido tanto na URL pública quanto no `@` exibido na vitrine.
2. Editar o campo `@` no onboarding mostra disponibilidade em tempo real (igual ao que já existe em Configurações).
3. Colisão de nome sugere `nome2`, `nome3`... automaticamente, nunca sufixo aleatório nem hífen.
4. Digitar um caractere inválido (espaço, hífen, acento, símbolo) no campo `@` é bloqueado/normalizado antes do submit, com a mensagem "Use apenas letras e números (3 a 30 caracteres)." quando aplicável.
5. `saveOnboarding` revalida o slug no servidor (não confia só no client) e trata colisão de corrida (`23505`) sem quebrar o fluxo.
6. Trocar o @ em Configurações continua funcionando exatamente como hoje, agora só aceitando o charset sem hífen.
7. Nenhuma regressão no fluxo de cadastro/onboarding existente; lint limpo.

## Testes

- **`tests/slug/slugify.test.ts`** (atualização obrigatória, não opcional): valores esperados trocam de `"sapatenis-sao-paulo"`/`"nike-air"` pra `"sapatenissaopaulo"`/`"nikeair"`; demais casos (fold de acento, string vazia) continuam valendo como estão.
- **`tests/settings/slug-availability.test.ts` e `tests/settings/update-slug.test.ts`** (atualização obrigatória): trocar os fixtures `` `slug-livre-${Date.now()}` `` e `` `slug-novo-${Date.now()}` `` por equivalentes sem hífen, pra continuarem testando disponibilidade/gravação em vez de rejeição de formato. Os fixtures inseridos direto no banco (`loja-b-ocupado-*`, `loja-b-taken-*`) idealmente trocam junto, por consistência, mesmo não sendo estritamente obrigatório (não passam pelo schema).
- `slugSchema`: charset novo rejeita hífen; aceita só `[a-z0-9]`, 3-30 chars; reservados continuam bloqueados.
- `use-slug-field`: teste do hook extraído — mesmo comportamento do bloco inline que ele substitui (normalização síncrona, debounce, transição de status).
- `resolveAvailableSlug`: unitário com mock de `checkSlugAvailability` — encontra base livre, incrementa em colisão, retorna `null` ao esgotar tentativas.
- `saveOnboarding`: cenário de colisão de slug na gravação (retorna a mesma mensagem de `updateStoreSlug`) — segue o padrão de teste já existente pro resto da action (Supabase de teste, hoje não configurado nesta máquina; marcar/skip conforme convenção do projeto).

## Melhorias futuras (fora deste ciclo)

- Remoção de palavras de preenchimento (de/da/loja/importados) do nome ao gerar o slug default.
- Incentivo pra contas que crescerem organicamente com slug feio a trocar (só relevante quando existirem usuários reais).
