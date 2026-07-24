# Fase 1: Fundação, Conta e Isolamento Multi-Tenant - Pesquisa

**Pesquisado em:** 2026-07-10
**Domínio:** Auth (Supabase Auth email/senha + recuperação de senha), multi-tenancy por RLS (schema compartilhado Postgres), middleware de rota escopado, onboarding pós-cadastro (identidade da loja + WhatsApp)
**Confiança:** MÉDIA-ALTA (padrões de Supabase Auth/RLS/middleware são bem documentados e cruzados entre 2-3 fontes; ausência de MCP de busca dedicado nesta sessão — WebSearch nativo foi usado como fallback em todos os itens, inclusive nos que normalmente iriam para Context7)

<user_constraints>
## Restrições do Usuário (de CONTEXT.md)

### Decisões Travadas

**Autenticação e Sessão**
- **D-01:** Cadastro com email/senha dá acesso imediato ao painel — sem exigir verificação de email antes de liberar o acesso.
- **D-02:** Recuperação de senha ("esqueci minha senha" via link de email) faz parte do escopo desta fase. **Novo requisito: AUTH-05** — Revendedor pode solicitar redefinição de senha via link enviado por email.
- **D-03:** Renovação de sessão é silenciosa em segundo plano (sem countdown visível). Um aviso visível para o revendedor só deve aparecer se a renovação automática falhar de verdade (ex: perda de conectividade) — nesse caso, mostrar aviso claro para salvar o trabalho e refazer login. Não implementar um contador de sessão sempre visível.

**Fluxo Pós-Cadastro (Onboarding)**
- **D-04:** Após criar a conta, o revendedor passa por um wizard de onboarding — NÃO vai direto para um Dashboard vazio. Esse wizard coleta: nome da loja, logo, cor de destaque, frase de apresentação (LOJA-01), e número de WhatsApp + template de mensagem (WPP-01, WPP-02). Só depois de completar esse onboarding o revendedor chega ao Dashboard.
- **D-05:** Slug personalizável (LOJA-02), QR Code (LOJA-03) e cópia de link (LOJA-04) **permanecem na Fase 2** — não fazem parte do onboarding inicial, só a identidade da loja e o WhatsApp.

### Discrição do Claude
- Exato fluxo de UI do onboarding (uma tela só vs. wizard multi-step) fica a critério da implementação/planejamento — o que foi decidido é QUAIS dados são coletados (identidade da loja + WhatsApp), não o layout exato.
- Estratégia técnica de sessão (cookies httpOnly do Supabase Auth vs. outra abordagem) é decisão de arquitetura, não do usuário.

### Ideias Adiadas (FORA DE ESCOPO nesta fase)
- Slug personalizável (LOJA-02), QR Code (LOJA-03), cópia de link (LOJA-04) → Fase 2.
- Verificação de email obrigatória → considerada e descartada para o MVP; pode voltar em v2 se abuso de contas virar problema real.

**Nota:** apesar de estar fora do escopo funcional desta fase, a constraint `UNIQUE` no nível do banco para a coluna de slug **pertence ao schema desta fase** (a tabela `stores` é criada agora) — apenas a UI de edição/validação em tempo real do slug fica para a Fase 2.
</user_constraints>

<phase_requirements>
## Requisitos da Fase

| ID | Descrição | Suporte da Pesquisa |
|----|-----------|----------------------|
| AUTH-01 | Revendedor pode criar conta com email e senha | Padrão `supabase.auth.signUp({email, password})` via Server Action + cliente `@supabase/ssr` server-side — ver Código de Exemplo 1 |
| AUTH-02 | Revendedor pode fazer login e permanecer logado entre sessões (refresh) | `signInWithPassword` + sessão em cookies httpOnly geridos por `@supabase/ssr`; persistência de sessão é automática via cookie, não localStorage — ver Padrão 1 |
| AUTH-03 | Revendedor pode fazer logout de qualquer página do painel | `supabase.auth.signOut()` chamado a partir de um Server Action ou client component, disponível no layout do grupo `(admin)` |
| AUTH-04 | Sessão renovada automaticamente com aviso apenas se falhar | `onAuthStateChange` ouvindo `TOKEN_REFRESHED` (sucesso, silencioso) e `SIGNED_OUT` (falha de refresh, dispara aviso) — ver Padrão 2 e Armadilha 1 |
| AUTH-05 | Revendedor pode solicitar redefinição de senha via link por email | `resetPasswordForEmail` + fluxo `token_hash`/`verifyOtp`/`updateUser` — ver Código de Exemplo 2 |
| LOJA-01 | Revendedor configura nome, logo, cor de destaque e frase (≤100 caracteres) | Tabela `store_settings`/`stores`, upload para Supabase Storage escopado por `owner_id`, validação Zod incluindo limite de caracteres — ver Estrutura de Projeto |
| WPP-01 | Cadastro de WhatsApp normalizado para padrão internacional | `libphonenumber-js` (`parsePhoneNumberFromString(input, 'BR')`) normalizando para E.164 apenas-dígitos no momento de salvar — ver Código de Exemplo 3 e Armadilha 2 |
| WPP-02 | Template de mensagem editável com variáveis `{modelo}`/`{solado}`/`{tamanho}`/`{preço}` | Campo de texto longo em `store_settings`, validado com Zod (placeholders obrigatórios presentes), consumido pela função pura `buildWhatsAppLink` (Fase 5) |

Isolamento multi-tenant (RLS) e escopo do middleware `/admin/:path*` são pré-requisitos estruturais que sustentam TODOS os IDs acima — tratados na seção Arquitetura abaixo.
</phase_requirements>

## Resumo

Esta fase estabelece a fundação inteira do projeto: banco de dados multi-tenant com isolamento por RLS, autenticação Supabase (cadastro, login, logout, renovação silenciosa, recuperação de senha) e um wizard de onboarding pós-cadastro que coleta identidade da loja e configuração de WhatsApp antes de liberar o Dashboard. Como é a primeira fase de um projeto greenfield, ela também é responsável por decisões que todas as fases seguintes herdam: o padrão de política RLS por tabela, a separação estrutural entre rota pública e rota admin via `middleware.ts` escopado, e a convenção de normalização de telefone que a Fase 5 (botão "Pedir agora") vai consumir sem poder re-derivar.

A pesquisa de stack e arquitetura do projeto (`STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`) já cobre em profundidade os padrões de Supabase Auth + `@supabase/ssr` + Next.js 16, RLS de schema compartilhado, e o antipadrão crítico de middleware catch-all. Esta pesquisa de fase adiciona os detalhes de implementação que a pesquisa de projeto deixou em aberto: o fluxo exato de reset de senha no App Router (`token_hash` + `verifyOtp`, não parsing de fragmento de URL), o padrão de escuta de `onAuthStateChange` para renovação silenciosa vs. falha real, o padrão de teste de isolamento RLS com duas contas seedadas, e a biblioteca recomendada para normalização de telefone brasileiro (`libphonenumber-js`, não estava no `STACK.md` original).

**Recomendação primária:** construir o schema (`stores`, `store_settings`, RLS habilitado desde a primeira migration) e o par login/cadastro ANTES do onboarding wizard; o wizard é a "keystone" — o Dashboard literalmente não deve ser alcançável (redirecionar) enquanto os campos obrigatórios de `store_settings` (nome, WhatsApp normalizado) estiverem NULL. Trate isso como um guard de rota, não uma convenção de UI opcional.

## Mapa de Responsabilidade Arquitetural

| Capacidade | Camada Primária | Camada Secundária | Justificativa |
|------------|-----------------|--------------------|----------------|
| Cadastro/login/logout (AUTH-01..03) | API/Backend (Supabase Auth via Server Actions) | Frontend Server (SSR, formulário) | Supabase Auth é o backend de identidade; Server Actions são a interface, não a fronteira de segurança |
| Persistência/renovação de sessão (AUTH-02, AUTH-04) | Frontend Server (SSR, cookies httpOnly via `@supabase/ssr`) | Browser/Client (`onAuthStateChange` listener) | Cookie é gerido no servidor a cada requisição; o listener client-side é só para reagir a `SIGNED_OUT`/`TOKEN_REFRESHED` na UI já aberta |
| Recuperação de senha (AUTH-05) | API/Backend (Supabase Auth: `resetPasswordForEmail`, `verifyOtp`, `updateUser`) | Frontend Server (rota `/auth/confirm`, formulário de nova senha) | Todo o ciclo de token de recuperação é responsabilidade do GoTrue (Supabase); o app só hospeda os formulários e a rota de callback |
| Isolamento multi-tenant (RLS) | Database/Storage (Postgres RLS policies) | — | A aplicação NUNCA deve reimplementar isolamento em código — RLS é a única fronteira de verdade, por decisão de arquitetura do projeto |
| Escopo de rota admin vs. pública | Frontend Server (`middleware.ts`, matcher `/admin/:path*`) | — | Estrutural, não uma checagem em runtime — a vitrine pública deve ser inalcançável pelo middleware por construção |
| Onboarding wizard (LOJA-01, WPP-01, WPP-02) | Frontend Server (Server Actions gravando em `store_settings`) | Browser/Client (formulário multi-step, upload de logo) | Escrita segue o mesmo padrão RLS de owner que o CRUD de produtos herdará nas próximas fases |
| Upload de logo | Database/Storage (Supabase Storage, bucket escopado por `owner_id`) | Browser/Client (compressão client-side antes do upload) | Mesma disciplina de `{owner_id}/...` do bucket `product-images` já definida no `ARCHITECTURE.md` do projeto |
| Normalização de telefone (WPP-01) | Frontend Server (Server Action de validação, uma única vez no save) | — | Normalizar uma vez no momento de salvar; nunca re-derivar no clique do botão WhatsApp (Fase 5) — ver Armadilha 2 |

## Constraints do Projeto (de CLAUDE.md)

- Stack travada: Next.js 16.2.x (App Router) + Tailwind CSS 4.x + Supabase (`@supabase/supabase-js` + `@supabase/ssr`) + Vercel. Não usar Next.js 14, não usar `auth-helpers-nextjs` (depreciado).
- Rota pública (`/loja/[slug]`) nunca pode ter middleware de autenticação — restrição rígida do PROJECT.md, aplicável desde esta fase mesmo que a vitrine em si só seja construída na Fase 4.
- Toda ação do painel precisa de feedback visual imediato (toast) — `sonner` já é a biblioteca padrão do projeto.
- Sem OAuth no MVP — email/senha é suficiente.
- Sem verificação de email obrigatória no MVP (decisão desta fase, D-01).
- Workflow GSD: mudanças de arquivo devem passar por um comando GSD (`/gsd-execute-phase` para esta fase), não edições diretas fora do fluxo.
- `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: "high"` em `config.json` — a seção Security Domain abaixo é obrigatória e qualquer achado de severidade alta nesta fase deve bloquear o merge.
- `nyquist_validation: true` em `config.json` — a seção Validation Architecture abaixo é obrigatória.

## Standard Stack

### Core

| Biblioteca | Versão | Propósito | Por Que é Padrão |
|------------|--------|-----------|--------------------|
| `@supabase/supabase-js` | 2.110.2 [VERIFIED: npm registry] | Cliente Supabase (Auth + Postgres + Storage) | Já travado no `STACK.md` do projeto; confirmado disponível no registry nesta pesquisa |
| `@supabase/ssr` | 0.12.0 [VERIFIED: npm registry] | Gerenciamento de sessão baseado em cookies para App Router (substitui `auth-helpers-nextjs`, depreciado) | Pacote atual e não-depreciado para SSR do Supabase Auth no Next.js App Router [CITED: supabase.com/docs/guides/auth/server-side/nextjs] |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Validação de formulários (cadastro, login, onboarding, WhatsApp) | Já padrão do projeto; usado tanto no client (formulário) quanto no Server Action |
| `react-hook-form` + `@hookform/resolvers` | 7.81.0 [VERIFIED: npm registry] | Estado dos formulários de auth e do wizard de onboarding | Combinação padrão do projeto com Zod para feedback inline |
| `sonner` | 2.0.7 [VERIFIED: npm registry] | Toasts de feedback (cadastro ok, erro de login, sessão expirada) | Já padrão do projeto — atende ao requisito de feedback imediato |

### Suporte (novo nesta fase)

| Biblioteca | Versão | Propósito | Quando Usar |
|------------|--------|-----------|-------------|
| `libphonenumber-js` | 1.13.8 [ASSUMED — descoberto via WebSearch, não estava no STACK.md original] | Normalizar o número de WhatsApp do revendedor para E.164 (`parsePhoneNumberFromString(input, 'BR')`) | No Server Action de salvamento de `store_settings` (onboarding, WPP-01) — normalizar uma única vez, nunca no momento do clique do botão WhatsApp (Fase 5) |

**Nota sobre `libphonenumber-js`:** não fazia parte do `STACK.md` de projeto original, que só menciona a *regra* de normalização (`55DDXXXXXXXXX`) sem indicar biblioteca. Uma normalização manual por regex é possível (o formato BR é reconhecível: DDI 55 + DDD 2 dígitos + 8-9 dígitos), mas `libphonenumber-js` cobre edge cases que uma regex ingênua erra (zero à esquerda no DDD, números de 8 dígitos legados, espaços não-quebráveis colados do próprio WhatsApp) — ver "Don't Hand-Roll" abaixo. Esta recomendação está tagueada `[ASSUMED]` e deve ser confirmada pelo planejador/usuário antes de virar decisão travada (ver Assumptions Log).

### Alternativas Consideradas

| Ao invés de | Poderia Usar | Trade-off |
|--------------|---------------|-----------|
| `libphonenumber-js` | Regex manual de normalização BR | Mais leve (zero dependência), mas historicamente é a fonte da Armadilha 1 do `PITFALLS.md` do projeto ("número de WhatsApp não validado/formatado") — regex ingênua não cobre todos os formatos de entrada reais que um revendedor não-técnico vai digitar |
| `token_hash` + `verifyOtp` para reset de senha | Parsing de `access_token`/`refresh_token` do fragmento de URL (`#access_token=...`) | O padrão antigo de fragmento de URL é o que a maioria dos tutoriais desatualizados mostra, mas quebra em SSR puro (o fragmento nunca chega ao servidor) — `verifyOtp` é o padrão correto para App Router [CITED: github.com/orgs/supabase/discussions] |
| `citext` para case-insensitive slug | Normalizar slug para lowercase no momento de salvar + `UNIQUE` simples em `text` | `citext` exige habilitar extensão Postgres; normalizar em lowercase no Server Action é mais simples e suficiente para o MVP — recomendado |

**Instalação:**
```bash
npm install @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers sonner libphonenumber-js
```

**Verificação de versão:** todas as versões acima foram confirmadas via `npm view <pacote> version` nesta sessão de pesquisa (2026-07-10/11) e batem com o `STACK.md` de projeto, exceto `libphonenumber-js` que é uma adição desta fase.

## Auditoria de Legitimidade de Pacotes

| Pacote | Registro | Idade/Última Versão | Downloads/semana | Repo Fonte | Veredito | Disposição |
|--------|----------|----------------------|-------------------|------------|----------|-------------|
| `@supabase/supabase-js` | npm | última versão publicada 2026-07-09 (pacote maduro, lançamentos frequentes) | ~21,0M | github.com/supabase/supabase-js | SUS (motivo: "too-new" — refere-se à data da ÚLTIMA versão publicada, não à idade do pacote) | Aprovado — falso positivo do heurístico devido à alta cadência de releases; volume de downloads (21M/semana) e repo oficial confirmam legitimidade |
| `@supabase/ssr` | npm | última versão publicada 2026-06-09 | ~5,0M | github.com/supabase/ssr | OK | Aprovado |
| `zod` | npm | última versão publicada 2026-05-04 | ~215,7M | github.com/colinhacks/zod | OK | Aprovado |
| `react-hook-form` | npm | última versão publicada 2026-07-05 (pacote maduro, lançamentos frequentes) | ~55,9M | github.com/react-hook-form/react-hook-form | SUS (motivo: "too-new" — mesma ressalva acima) | Aprovado — mesmo falso positivo; volume de downloads e histórico do repo confirmam maturidade |
| `sonner` | npm | última versão publicada 2025-08-02 | ~47,8M | github.com/emilkowalski/sonner | OK | Aprovado |
| `libphonenumber-js` | npm | última versão publicada 2026-07-03 (pacote maduro, lançamentos frequentes) | ~19,5M | gitlab.com/catamphetamine/libphonenumber-js | SUS (motivo: "too-new" — mesma ressalva acima) | Aprovado, mas ver nota `[ASSUMED]` acima — planejador deve inserir `checkpoint:human-verify` antes de travar esta dependência, já que foi descoberta via WebSearch nesta sessão, não via Context7/docs oficiais |

**Pacotes removidos por veredito [SLOP]:** nenhum.
**Pacotes flagados como suspeitos [SUS]:** `@supabase/supabase-js`, `react-hook-form`, `libphonenumber-js` — todos com verdict SUS motivado por "too-new", que neste heurístico mede a data de publicação da última versão instalada, não a idade real do pacote. Os três têm dezenas de milhões de downloads semanais e repositórios oficiais ativos há anos — o padrão de projeto (`STACK.md`) já recomenda os dois primeiros. `libphonenumber-js` é a única adição genuinamente nova desta fase; nenhum `postinstall` script suspeito foi encontrado em nenhum dos seis pacotes (`npm view <pkg> scripts.postinstall` retornou vazio para todos).

*`libphonenumber-js` foi descoberto via WebSearch nesta sessão (não via Context7/documentação oficial) e é tagueado `[ASSUMED]` — o planejador deve adicionar um `checkpoint:human-verify` antes da instalação, conforme o protocolo de proveniência de pacotes.*

## Padrões de Arquitetura

### Diagrama de Arquitetura do Sistema (escopo desta fase)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NAVEGADOR (revendedor)                     │
│  Formulário de cadastro/login  →  Wizard de onboarding  →  Dashboard│
└───────────────┬───────────────────────────┬──────────────────────────┘
                │                            │
                ▼                            ▼
     ┌────────────────────┐      ┌─────────────────────────┐
     │ middleware.ts        │      │  (rota /loja/[slug] —    │
     │ matcher: /admin/:*   │      │   fora do escopo desta   │
     │ (nunca amplo/allow-  │      │   fase, mas a estrutura  │
     │  list — só este      │      │   de pastas já garante   │
     │  prefixo é tocado)   │      │   que não é interceptada)│
     └──────────┬───────────┘      └─────────────────────────┘
                │ getUser() válido?
                │  não → redirect /login
                │  sim → segue
                ▼
     ┌───────────────────────────────────────────────────────┐
     │  (admin)/layout.tsx — checagem de sessão server-side    │
     │  ├── /login, /cadastro, /esqueci-senha (NÃO protegidas) │
     │  ├── /onboarding (protegida, mas guard separado:         │
     │  │    store_settings incompleto → força ficar aqui)      │
     │  └── /dashboard (protegida E exige onboarding completo)  │
     └──────────────────────┬────────────────────────────────┘
                             │ Server Actions (cliente Supabase
                             │ autenticado, cookies via @supabase/ssr)
                             ▼
     ┌───────────────────────────────────────────────────────┐
     │  SUPABASE (projeto único)                                │
     │  Auth (GoTrue): signUp/signInWithPassword/signOut/       │
     │    resetPasswordForEmail/verifyOtp/updateUser            │
     │  Postgres: stores, store_settings — RLS habilitado,       │
     │    policy owner_id = auth.uid()                           │
     │  Storage: bucket store-assets/{owner_id}/logo.*           │
     └───────────────────────────────────────────────────────┘
```

### Estrutura de Projeto Recomendada (escopo desta fase)

```
src/
├── app/
│   ├── (admin)/
│   │   ├── layout.tsx              # checagem de sessão via getUser(); redireciona se ausente
│   │   ├── login/page.tsx          # NÃO atrás de guard de sessão (entrada pública do admin)
│   │   ├── cadastro/page.tsx       # idem
│   │   ├── esqueci-senha/page.tsx  # solicita reset (resetPasswordForEmail)
│   │   ├── redefinir-senha/page.tsx # formulário de nova senha (após verifyOtp)
│   │   ├── onboarding/page.tsx     # wizard — nome, logo, cor, frase, WhatsApp, template
│   │   └── dashboard/page.tsx      # guard adicional: só acessível com onboarding completo
│   ├── auth/
│   │   └── confirm/route.ts        # Route Handler: verifyOtp(token_hash) → estabelece sessão → redirect
│   └── loja/[slug]/                 # placeholder desta fase — NÃO recebe middleware (Fase 4 implementa)
├── lib/
│   └── supabase/
│       ├── server.ts                # createServerClient (cookies, Server Actions/Components)
│       ├── client.ts                # createBrowserClient (client components, listener de auth)
│       └── middleware.ts             # helper de refresh de sessão usado pelo middleware.ts
├── lib/auth/
│   ├── actions.ts                    # signUp/signInWithPassword/signOut/reset Server Actions
│   └── onboarding-guard.ts           # função que checa store_settings completo
├── lib/phone/
│   └── normalize-br.ts               # wrapper sobre libphonenumber-js, testável unitariamente
└── middleware.ts                     # matcher: ['/admin/:path*'] — único ponto de entrada do middleware
```

### Padrão 1: Sessão Supabase via cookies httpOnly (`@supabase/ssr`)

**O quê:** `createServerClient` (server) e `createBrowserClient` (client) compartilham a mesma sessão via cookies httpOnly geridos pelo `@supabase/ssr`; persistência entre refresh do navegador (AUTH-02) é automática porque o cookie sobrevive ao reload, não depende de estado em memória.
**Quando usar:** Em toda leitura/escrita autenticada nesta fase — Server Actions de cadastro/login/logout/onboarding, e no `middleware.ts` para refresh de token a cada requisição.
**Exemplo:**
```typescript
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs (padrão oficial documentado)
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```
Sempre usar `getUser()` (revalida contra o servidor Supabase) para checagens de gate/middleware — nunca `getSession()` sozinho, que confia no cookie local sem revalidar [CITED: supabase.com/docs/guides/auth/server-side/nextjs].

### Padrão 2: Renovação silenciosa + aviso apenas em falha real (AUTH-04, D-03)

**O quê:** Um listener client-side em `onAuthStateChange` no root layout/provider do admin reage a dois eventos: `TOKEN_REFRESHED` (renovação automática funcionou — não fazer nada visível, conforme D-03) e `SIGNED_OUT` (a lib tentou renovar e falhou — SÓ AQUI mostrar o aviso "sua sessão expirou, salve seu trabalho e faça login novamente").
**Quando usar:** Um único provider/hook compartilhado por todo o grupo `(admin)`, não reimplementado por página.
**Exemplo:**
```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-onauthstatechange (padrão documentado)
'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export function SessionWatcher() {
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Renovação falhou de verdade (ex.: perda de conectividade, refresh token revogado/expirado)
        toast.error('Sua sessão expirou. Salve seu trabalho e faça login novamente.', { duration: Infinity })
      }
      // TOKEN_REFRESHED: silencioso por design (D-03) — nenhuma ação de UI aqui
    })
    return () => subscription.unsubscribe()
  }, [])
  return null
}
```
**Ressalva [ASSUMED]:** há relatos de que, em contexto puramente server-side do App Router, o listener client-side pode não disparar de forma confiável para refreshes que acontecem inteiramente no servidor (ex.: dentro de uma Server Action de longa duração) [CITED: github.com/orgs/supabase/discussions/44953]. Mitigação recomendada: tratar também o caso de uma Server Action retornar erro de auth (401/token inválido) explicitamente na UI que a chamou, não depender só do listener global.

### Padrão 3: Recuperação de senha via `token_hash` + `verifyOtp` (AUTH-05)

**O quê:** `resetPasswordForEmail(email, { redirectTo })` envia o email; o template de email deve usar a variável `{{ .TokenHash }}` (não o link padrão de fragmento de URL) apontando para uma Route Handler `/auth/confirm`; essa rota chama `verifyOtp({ type: 'recovery', token_hash })` para estabelecer uma sessão válida, e só então redireciona para uma página de "definir nova senha" que chama `updateUser({ password })`.
**Quando usar:** Sempre, para qualquer fluxo de recuperação de senha em SSR/App Router — o padrão antigo de parsing de `access_token`/`refresh_token` do fragmento `#` da URL não funciona de forma confiável em apps renderizados no servidor, porque o fragmento nunca é enviado ao servidor.
**Exemplo:**
```typescript
// Source: padrão documentado em supabase.com/docs/guides/auth/passwords +
// github.com/orgs/supabase/discussions/28655 (fluxo PKCE-safe para App Router)

// app/auth/confirm/route.ts
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type === 'recovery') {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash })
    if (!error) redirect('/redefinir-senha')
  }
  redirect('/login?error=link_invalido_ou_expirado')
}
```
**Importante:** configurar o template de email de recuperação no painel do Supabase (Auth → Email Templates → "Reset Password") para usar `{{ .TokenHash }}` em vez do link padrão — isso é uma configuração de projeto Supabase, não código, e deve estar no checklist de setup desta fase.

### Padrão 4: Isolamento multi-tenant por RLS — política de owner (`stores`, `store_settings`)

**O quê:** Cada linha em `stores`/`store_settings` carrega `owner_id` referenciando `auth.uid()`. Política RLS `for all using (owner_id = auth.uid())` restringe todo SELECT/INSERT/UPDATE/DELETE ao dono. Já documentado em profundidade no `ARCHITECTURE.md` do projeto (Padrão 1) — replicado aqui no contexto específico das tabelas desta fase.
**Exemplo:**
```sql
-- Source: .planning/research/ARCHITECTURE.md (padrão de projeto já estabelecido) +
-- https://supabase.com/docs/guides/database/postgres/row-level-security (documentação oficial)

create table stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,          -- constraint UNIQUE desde a primeira migration (Armadilha 4 do PITFALLS.md)
  logo_url text,
  accent_color text,
  tagline text check (char_length(tagline) <= 100),
  created_at timestamptz not null default now()
);

alter table stores enable row level security;

create policy "owner_full_access_stores" on stores
  for all using (owner_id = auth.uid());

create table store_settings (
  store_id uuid primary key references stores(id) on delete cascade,
  whatsapp_e164 text,                 -- apenas dígitos, formato 55DDXXXXXXXXX
  message_template text
);

alter table store_settings enable row level security;

create policy "owner_full_access_settings" on store_settings
  for all using (store_id in (select id from stores where owner_id = auth.uid()));
```
**Teste de isolamento obrigatório (conforme D-05/CONTEXT.md e PITFALLS.md Armadilha 5):** seedar duas contas reais (Loja A, Loja B) e confirmar via chamadas diretas de API (cliente Supabase autenticado como cada usuário, não apenas via UI) que a sessão da Loja A não consegue ler/escrever nenhuma linha de `stores`/`store_settings` pertencente à Loja B. Rodar esse teste antes de considerar a fase pronta — é um critério de aceitação explícito, não apenas um "seria bom fazer".

### Padrão 5: Guard de onboarding — Dashboard inalcançável sem configuração completa (D-04)

**O quê:** Um guard de rota separado (não o middleware de auth) checa, no `layout.tsx` do grupo `(admin)` ou em cada página protegida, se `store_settings` tem os campos obrigatórios preenchidos (nome da loja + WhatsApp normalizado, no mínimo). Se não, força redirect para `/onboarding` mesmo que a sessão seja válida.
**Quando usar:** Em toda rota dentro de `(admin)` exceto o próprio `/onboarding` e as rotas de auth (`/login`, `/cadastro`, etc.) — para não criar um loop de redirect.
**Trade-off:** este guard é uma checagem de dados (existe uma linha `store_settings` completa?), não uma checagem de auth — deve ser explicitamente uma segunda camada, não misturada com a lógica do `middleware.ts` de auth (que só decide "tem sessão válida?").

### Antipadrões a Evitar

- **Middleware com matcher amplo + allowlist interna:** já documentado como Antipadrão 1 no `ARCHITECTURE.md` do projeto — nunca usar `matcher: ['/((?!_next|static).*)']` com exceções manuais. Usar `matcher: ['/admin/:path*']` diretamente.
- **Misturar o guard de onboarding com o guard de auth:** se o middleware ou o layout tentar decidir "sessão válida E onboarding completo" em uma única checagem, um bug em qualquer uma das duas condições pode acidentalmente bloquear ou liberar a rota errada. Manter as duas checagens como funções separadas e explícitas.
- **Confiar em `getSession()` sem `getUser()` para decisões de proteção de rota:** `getSession()` não revalida o token contra o servidor Supabase; usar `getUser()` no middleware/layout para qualquer decisão de acesso.
- **Re-normalizar o telefone no momento do clique do botão WhatsApp (Fase 5):** a normalização deve acontecer uma única vez, no Server Action de salvamento desta fase — a Fase 5 apenas lê o valor já normalizado.

## Não Reinvente a Roda

| Problema | Não Construa | Use Em Vez | Por Quê |
|----------|---------------|-------------|---------|
| Normalização de número de telefone BR para WhatsApp | Uma função regex customizada que remove parênteses/traços/zero à esquerda | `libphonenumber-js` (`parsePhoneNumberFromString(input, 'BR')`) | Cobre edge cases reais (DDD com zero à esquerda, números de 8 dígitos legados, espaços não-quebráveis colados) que uma regex ingênua tipicamente erra — exatamente a Armadilha 1 do `PITFALLS.md` do projeto |
| Ciclo de token de recuperação de senha (geração, expiração, single-use) | Uma tabela `password_reset_tokens` própria + envio de email via serviço externo | `resetPasswordForEmail` + `verifyOtp` do Supabase Auth (GoTrue) | O GoTrue já implementa expiração, single-use e assinatura segura do token; reimplementar isso é reimplementar uma superfície de segurança inteira sem necessidade |
| Isolamento multi-tenant (quem vê os dados de quem) | Filtros `WHERE owner_id = ?` espalhados em cada query do código da aplicação | Políticas RLS no Postgres (`owner_id = auth.uid()`) | Um único filtro esquecido em uma query nova é um vazamento de dados; RLS aplica a regra no nível do banco, não importa de onde a query venha |
| Hash/verificação de senha | Qualquer lib de hashing próprio (bcrypt/argon2 manual) | Delegado inteiramente ao Supabase Auth (GoTrue) | Já é parte do backend de auth escolhido — não há necessidade nem espaço de decisão aqui |
| Escuta de expiração/renovação de sessão | Um timer customizado de "sessão expira em X minutos" | `onAuthStateChange` (`TOKEN_REFRESHED`/`SIGNED_OUT`) do cliente Supabase | O SDK já implementa renovação proativa em segundo plano; um timer customizado duplicaria essa lógica e divergiria do comportamento real do token |

**Insight chave:** nesta fase, praticamente todo "problema difícil" (hash de senha, ciclo de token de reset, isolamento de dados) já tem uma solução embutida no par Supabase Auth + RLS escolhido pelo projeto. O trabalho real de engenharia aqui é a **disciplina de configuração** (RLS habilitado em toda tabela, matcher de middleware estreito, template de email correto) — não a construção de novos mecanismos.

## Armadilhas Comuns

### Armadilha 1: Renovação de sessão "silenciosa" oculta uma falha real de conectividade sem aviso (AUTH-04, D-03)

**O que dá errado:** Se o app só trata o "caminho feliz" (sessão sempre renova), um revendedor com conectividade instável (celular, wifi ruim) pode ter o refresh token falhar silenciosamente — a UI continua mostrando dados antigos em cache até a próxima ação, que falha com um 401 confuso, sem o aviso "salve seu trabalho" que D-03 exige.
**Por que acontece:** `onAuthStateChange` emite `SIGNED_OUT` em vez de um erro explícito quando o refresh falha — é fácil só tratar `SIGNED_OUT` como "logout normal do usuário" e redirecionar sem aviso, em vez de diferenciar "usuário clicou logout" de "renovação falhou".
**Como evitar:** o listener de `SIGNED_OUT` deve sempre mostrar o aviso de D-03 antes de redirecionar (mesmo que na prática cubra os dois casos — um aviso "sua sessão foi encerrada" nunca é errado de mostrar, mesmo após um logout intencional).
**Sinais de alerta:** nenhum teste manual de "deixar a aba ociosa além da expiração do token e tentar salvar algo".
**Fase para abordar:** esta fase — é o próprio requisito AUTH-04.

### Armadilha 2: Normalização de telefone feita na hora errada ou de forma incompleta (WPP-01)

**O que dá errado:** já documentado em profundidade no `PITFALLS.md` do projeto (Armadilha 1) — números com parênteses/traços/zero à esquerda/sem DDI quebram o link `wa.me` silenciosamente. Adicional específico desta fase: se a normalização acontecer no client-side apenas (nunca revalidada no servidor), uma chamada direta à Server Action (bypassando o formulário) pode gravar um número não normalizado.
**Como evitar:** normalizar com `libphonenumber-js` DENTRO do Server Action (não só no formulário client-side), rejeitando e retornando erro claro se `isValid()` for `false`; mostrar ao revendedor uma prévia do número formatado antes de confirmar salvar (conforme já recomendado no `STACK.md` do projeto).
**Fase para abordar:** esta fase (onboarding) — a Fase 5 (botão "Pedir agora") depende deste valor já estar correto e não deve re-validar.

### Armadilha 3: Constraint UNIQUE de slug ausente na migration inicial (D-05, LOJA-02 adiado mas schema é desta fase)

**O que dá errado:** já documentado no `PITFALLS.md` do projeto (Armadilha 4) — se a tabela `stores` for criada nesta fase SEM a constraint `UNIQUE` na coluna `slug` (mesmo que a UI de edição de slug só chegue na Fase 2), qualquer geração automática de slug no onboarding (ex.: slug derivado do nome da loja) pode colidir silenciosamente entre dois revendedores cadastrados quase ao mesmo tempo.
**Como evitar:** incluir `slug text not null unique` na primeira migration desta fase, mesmo que a única forma de definir o slug nesta fase seja auto-gerada a partir do nome da loja (a UI de customização em tempo real é da Fase 2, mas o valor precisa existir e ser único desde já, já que a linha `stores` é criada no cadastro).
**Fase para abordar:** esta fase (schema inicial) — retrofitar depois exige limpeza manual de dados se já houver duplicatas em produção.

### Armadilha 4: RLS habilitado mas política incompleta gera "bug fantasma" (D-05, teste de isolamento)

**O que dá errado:** já documentado no `PITFALLS.md` do projeto (Armadilha 5) — se a política RLS de `stores`/`store_settings` estiver ausente ou incompleta, o sintoma não é um erro visível: é uma lista vazia ou um "salvamento" que não persiste nada, facilmente confundido com bug de frontend.
**Como evitar:** habilitar RLS na mesma migration que cria a tabela (nunca como um passo separado posterior); testar com duas contas reais seedadas — não apenas a conta de desenvolvimento do próprio dev, que costuma ter acesso irrestrito ao banco local.
**Sinais de alerta:** dashboard mostrando "nenhum dado" para um usuário autenticado, sem nenhum erro no console.
**Fase para abordar:** esta fase — é o critério de aceitação central de D-05/CONTEXT.md.

### Armadilha 5: Middleware amplo captura a futura rota pública antes mesmo dela existir

**O que dá errado:** mesmo que `/loja/[slug]` só seja implementada na Fase 4, o `middleware.ts` desta fase já define o padrão que todas as fases seguintes herdam. Se o matcher for escrito como catch-all com exceções, a Fase 4 herda um risco estrutural que só se manifesta quando a rota pública existir — quando o bug for descoberto, pode já estar em produção.
**Como evitar:** escrever `matcher: ['/admin/:path*']` (ou o path group equivalente do projeto) desde o primeiro commit do middleware, nunca um catch-all.
**Fase para abordar:** esta fase — é fundacional, mas o critério de verificação completo ("rota pública acessível com zero cookies") só pode ser plenamente testado a partir da Fase 4, quando a rota existir. Nesta fase, o critério de verificação é: "o matcher do middleware não corresponde a nenhum caminho fora de `/admin`".

## Exemplos de Código

### Cadastro (AUTH-01) e Login (AUTH-02) via Server Action

```typescript
// Source: padrão https://supabase.com/docs/guides/auth/server-side/nextjs
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signUpAction(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  if (error) return { error: error.message }
  redirect('/onboarding') // D-01: acesso imediato, sem verificação de email; D-04: vai para onboarding, não Dashboard
}

export async function signInAction(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  if (error) return { error: 'Email ou senha inválidos' }
  redirect('/dashboard') // guard de onboarding (Padrão 5) decide se realmente chega lá
}
```

### Normalização de WhatsApp (WPP-01)

```typescript
// Source: padrão de uso da lib https://github.com/catamphetamine/libphonenumber-js
import { parsePhoneNumberFromString } from 'libphonenumber-js'

export function normalizeWhatsAppBR(input: string): { e164Digits: string } | { error: string } {
  const phone = parsePhoneNumberFromString(input, 'BR')
  if (!phone || !phone.isValid()) {
    return { error: 'Número de WhatsApp inválido. Confira o DDD e o número.' }
  }
  // phone.number vem como "+5511999999999" — remover o "+" para o formato usado no link wa.me
  return { e164Digits: phone.number.replace('+', '') }
}
```

## Estado da Arte

| Abordagem Antiga | Abordagem Atual | Quando Mudou | Impacto |
|-------------------|-------------------|----------------|---------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Pacote antigo depreciado; `@supabase/ssr` é o atual para App Router | Usar `@supabase/ssr` desde o primeiro commit — já refletido no `STACK.md` do projeto |
| Parsing de `access_token`/`refresh_token` do fragmento de URL para reset de senha | Template de email com `{{ .TokenHash }}` + `verifyOtp({type: 'recovery', token_hash})` | Recomendação atual para apps SSR/App Router — fragmentos de URL não chegam ao servidor | Configurar o template de email de recuperação no painel Supabase para usar `TokenHash`, não o link padrão |
| `getSession()` para gates de auth | `getUser()` para gates de auth | `getSession()` não revalida contra o servidor; prática recomendada atual é sempre `getUser()` em código de proteção de rota | Usar `getUser()` no `middleware.ts` e no guard do layout `(admin)` |

**Depreciado/desatualizado:**
- `@supabase/auth-helpers-nextjs`: substituído por `@supabase/ssr`.
- Matcher de middleware catch-all com allowlist: continua tecnicamente funcional, mas é o antipadrão #1 documentado no `ARCHITECTURE.md` do projeto — evitar desde o início.

## Registro de Suposições

| # | Alegação | Seção | Risco se Errado |
|---|----------|--------|-------------------|
| A1 | `libphonenumber-js` é a biblioteca recomendada para normalizar telefone BR (não estava no `STACK.md` original do projeto) | Standard Stack / Não Reinvente a Roda | Baixo-médio: se a lib não for adotada, uma normalização manual ainda é viável, mas herda o risco de edge cases não cobertos (Armadilha 2). O planejador deve confirmar com o usuário antes de travar esta dependência nova |
| A2 | Em contexto SSR puro do App Router, `onAuthStateChange` client-side pode não disparar de forma confiável para refreshes ocorridos inteiramente no servidor | Padrão 2 / Armadilha 1 | Médio: se a mitigação (tratar erro de auth explicitamente em cada Server Action) não for implementada, um usuário pode não ver o aviso de sessão expirada em certos caminhos — validar com teste manual de ociosidade real antes de fechar a fase |
| A3 | Normalizar slug para lowercase no momento de salvar (em vez de usar extensão `citext`) é suficiente para o MVP | Alternativas Consideradas | Baixo: se dois revendedores cadastrarem nomes de loja que geram o mesmo slug em cases diferentes, a normalização em lowercase já previne a colisão — risco só se materializa se essa normalização for pulada |

**Se esta tabela estivesse vazia:** não está — todas as três suposições acima precisam de confirmação do planejador/usuário antes de virarem decisão travada de implementação, especialmente A1 (nova dependência).

## Perguntas em Aberto

1. **Onde exatamente mora a checagem de "onboarding completo" — campo booleano dedicado ou inferência a partir de campos NULL?**
   - O que sabemos: `store_settings` precisa ter nome da loja e WhatsApp normalizado preenchidos antes do Dashboard ser acessível (D-04).
   - O que não está claro: se o planejador deve adicionar um campo explícito `onboarding_completed_at timestamptz` (mais simples de checar e mais à prova de futuros campos opcionais) ou inferir via `WHERE name IS NOT NULL AND whatsapp_e164 IS NOT NULL`.
   - Recomendação: usar um campo explícito `onboarding_completed_at` — mais barato de checar no guard de rota e não quebra se um campo obrigatório virar opcional no futuro (ex.: se o logo deixar de ser obrigatório).

2. **O template de mensagem padrão (WPP-02) já vem pré-preenchido no onboarding ou o revendedor precisa digitar do zero?**
   - O que sabemos: o `PROJECT.md` já define um template padrão de copy ("Olá! Vi sua vitrine e tenho interesse...").
   - O que não está claro: se o onboarding wizard já popula esse texto como valor inicial editável do campo, ou se o campo começa vazio.
   - Recomendação: pré-popular com o template padrão do `PROJECT.md` como valor inicial editável — reduz fricção para o revendedor não-técnico (conforme a diretriz "poucos campos obrigatórios, percebido como rápido" em CONTEXT.md).

3. **O bucket de logo é o mesmo `product-images` do `ARCHITECTURE.md` de projeto ou um bucket separado (`store-assets`)?**
   - O que sabemos: o `ARCHITECTURE.md` do projeto define `product-images` para fotos de produto (Fase 3).
   - O que não está claro: se o logo da loja deve reusar o mesmo bucket com um path diferente (`{owner_id}/logo.*`) ou um bucket dedicado.
   - Recomendação: bucket separado `store-assets` (ou path `store-assets/{owner_id}/logo.*`) — mantém a política de storage do logo (1 arquivo por loja, sem relação com produtos) estruturalmente distinta da política de `product-images` (N arquivos por produto), evitando que uma política de Storage precise lidar com dois casos de uso diferentes.

## Disponibilidade de Ambiente

| Dependência | Necessária Para | Disponível | Versão | Fallback |
|--------------|-------------------|--------------|---------|-----------|
| Node.js ≥20.9 | Next.js 16 (requisito de compatibilidade) | Verificar no ambiente de execução antes do scaffold | — | Nenhum — Node 18 não é suportado pelo Next 16 |
| Projeto Supabase (Auth + Postgres + Storage) | Toda a fase (Auth, RLS, bucket de logo) | Deve ser provisionado como parte do Wave 0 desta fase — nenhum projeto Supabase existe ainda (greenfield) | — | Nenhum — é a própria fundação da fase |
| Configuração de template de email no painel Supabase (Auth → Email Templates) | AUTH-05 (recuperação de senha, padrão `TokenHash`) | Configuração manual necessária no painel — não é código versionado | — | Nenhum — sem essa configuração, o link de reset usa o formato de fragmento de URL que não funciona em SSR |
| Variáveis de ambiente `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Todo cliente Supabase (server e browser) | A provisionar no Wave 0 | — | Nenhum |

**Dependências ausentes sem fallback:**
- Projeto Supabase provisionado (Auth/Postgres/Storage) — bloqueia toda a fase até existir.
- Configuração do template de email de recuperação de senha no painel Supabase — bloqueia AUTH-05 especificamente.

**Dependências ausentes com fallback:**
- Nenhuma identificada — esta fase é fundacional e a maioria das dependências não tem alternativa viável.

<!-- ## Validation Architecture (marcador estrutural para detecção automática do pipeline — título visível traduzido abaixo) -->
## Arquitetura de Validação

### Framework de Teste
| Propriedade | Valor |
|-------------|-------|
| Framework | Nenhum ainda configurado — projeto greenfield, zero código existente |
| Arquivo de config | nenhum — ver Lacunas do Wave 0 |
| Comando de execução rápida | a definir no Wave 0 (recomendado: `vitest` para unitários de `normalize-br.ts`/RLS smoke test) |
| Comando de suíte completa | a definir no Wave 0 |

### Mapa Requisitos da Fase → Testes
| ID Req | Comportamento | Tipo de Teste | Comando Automatizado | Arquivo Existe? |
|--------|----------------|-----------------|--------------------------|-------------------|
| AUTH-01 | Cadastro cria usuário e redireciona para onboarding | integração (Server Action + Supabase local/test project) | `vitest run tests/auth/signup.test.ts` | ❌ Wave 0 |
| AUTH-02 | Sessão persiste após refresh do navegador | e2e manual (Playwright opcional) ou verificação manual documentada | manual-only — justificativa: requer navegador real com cookies persistidos entre reloads | ❌ Wave 0 (ou manual-only, decisão do planejador) |
| AUTH-03 | Logout de qualquer página do painel encerra a sessão | unitário/integração no Server Action de logout | `vitest run tests/auth/signout.test.ts` | ❌ Wave 0 |
| AUTH-04 | `TOKEN_REFRESHED` silencioso, `SIGNED_OUT` mostra aviso | manual-only — justificativa: requer simular expiração real de token/perda de conectividade, difícil de automatizar de forma confiável | teste manual documentado (ociosidade além da expiração + tentativa de salvar) | ❌ Wave 0 (checklist manual) |
| AUTH-05 | Link de reset de senha estabelece sessão e permite `updateUser` | integração (`verifyOtp` com token de teste ou mock) | `vitest run tests/auth/reset-password.test.ts` | ❌ Wave 0 |
| LOJA-01 | Onboarding salva nome/logo/cor/frase, frase ≤100 caracteres | unitário (validação Zod) + integração (Server Action) | `vitest run tests/onboarding/store-settings.test.ts` | ❌ Wave 0 |
| WPP-01 | Número normalizado corretamente para E.164, entradas malformadas rejeitadas com mensagem clara | unitário (`normalize-br.ts`) — cobrir parênteses, traços, zero à esquerda, sem DDI, espaços colados | `vitest run tests/phone/normalize-br.test.ts` | ❌ Wave 0 |
| WPP-02 | Template salvo contém os placeholders esperados | unitário (validação Zod do template) | `vitest run tests/onboarding/message-template.test.ts` | ❌ Wave 0 |
| (RLS, D-05) | Isolamento: Loja A não lê/escreve dados de Loja B | integração com duas contas seedadas reais, via cliente Supabase autenticado (não SQL Editor) | `vitest run tests/rls/isolation.test.ts` (ou script SQL dedicado, decisão do planejador) | ❌ Wave 0 |
| (Middleware) | Matcher do middleware não corresponde a nada fora de `/admin` | unitário (teste do array `config.matcher`) | `vitest run tests/middleware/matcher.test.ts` | ❌ Wave 0 |

### Taxa de Amostragem
- **Por commit de task:** comando de execução rápida (unitários relevantes ao arquivo alterado).
- **Por merge de wave:** suíte completa definida no Wave 0.
- **Gate da fase:** suíte completa verde antes de `/gsd:verify-work`, mais os itens `manual-only` (AUTH-02, AUTH-04) confirmados via checklist manual documentado no PLAN.md.

### Lacunas do Wave 0
- [ ] Instalar e configurar framework de teste: `npm install -D vitest` (ou equivalente escolhido pelo planejador) — nenhum framework de teste existe ainda neste projeto greenfield.
- [ ] `tests/auth/*.test.ts` — cobre AUTH-01, AUTH-03, AUTH-05.
- [ ] `tests/onboarding/*.test.ts` — cobre LOJA-01, WPP-02.
- [ ] `tests/phone/normalize-br.test.ts` — cobre WPP-01, incluindo os casos malformados do `PITFALLS.md` (parênteses, traços, zero à esquerda, sem DDI).
- [ ] `tests/rls/isolation.test.ts` — cobre o teste de isolamento com duas contas seedadas (D-05/CONTEXT.md), provavelmente precisa de um projeto Supabase local (`supabase start`) ou de test project dedicado.
- [ ] `tests/middleware/matcher.test.ts` — cobre a garantia estrutural do escopo `/admin/:path*`.
- [ ] Provisionar projeto Supabase (local via CLI ou projeto de teste dedicado) para os testes de integração/RLS rodarem no CI.
- [ ] Checklist manual documentado (não automatizável) para AUTH-02 (persistência de sessão em refresh real de navegador) e AUTH-04 (aviso de sessão expirada em ociosidade real).

## Domínio de Segurança

### Categorias ASVS Aplicáveis

| Categoria ASVS | Aplica | Controle Padrão |
|------------------|--------|--------------------|
| V2 Autenticação | Sim | Delegado ao Supabase Auth (GoTrue) — hashing de senha, política de senha mínima, rate limiting de tentativas de login já gerenciados pelo backend de auth escolhido |
| V3 Gerenciamento de Sessão | Sim | Cookies httpOnly geridos por `@supabase/ssr`; `getUser()` (não `getSession()`) para toda decisão de proteção de rota; renovação silenciosa via `onAuthStateChange` (Padrão 2) |
| V4 Controle de Acesso | Sim | RLS por `owner_id = auth.uid()` em `stores`/`store_settings` (Padrão 4) — a única fronteira de autorização real; nunca confiar em `raw_user_meta_data`/claims de JWT editáveis pelo cliente para decisões de autorização, conforme já sinalizado no `PITFALLS.md` do projeto |
| V5 Validação de Entrada | Sim | Zod em todos os formulários (email/senha no cadastro, campos do onboarding, WhatsApp via `libphonenumber-js`, frase ≤100 caracteres via `check` constraint + Zod) |
| V6 Criptografia | Sim (indireto) | Hash de senha inteiramente delegado ao Supabase Auth (GoTrue/bcrypt interno) — nunca hand-roll |

### Padrões de Ameaça Conhecidos para esta Stack

| Padrão | STRIDE | Mitigação Padrão |
|---------|--------|---------------------|
| Vazamento de dados entre tenants via RLS ausente/incompleta | Tampering / Information Disclosure | RLS habilitado na mesma migration que cria a tabela; teste de isolamento com duas contas reais seedadas (Padrão 4) |
| Bypass de autorização via matcher de middleware amplo | Elevation of Privilege / Information Disclosure | Matcher estreito `/admin/:path*`; nunca confiar apenas no middleware como única camada de auth — revalidar com `getUser()` no layout/Server Action também (CVE-2025-29927 é o precedente concreto citado no `PITFALLS.md` do projeto) |
| Sessão sequestrada via token não revalidado (`getSession()` sem verificação server-side) | Spoofing | Sempre `getUser()` para decisões de gate, nunca confiar cegamente em `getSession()` |
| Enumeração de contas via mensagens de erro diferenciadas em login/reset de senha | Information Disclosure | Usar mensagens genéricas ("email ou senha inválidos", "se o email existir, um link foi enviado") em vez de confirmar/negar existência de conta — comportamento padrão do Supabase Auth, mas checar que a UI não sobrescreve isso com uma mensagem mais específica |
| Upload de logo malicioso disfarçado de imagem | Tampering | Mesma disciplina já definida no `STACK.md`/`PITFALLS.md` do projeto para fotos de produto: validar content-type/magic-bytes no servidor, não confiar na extensão do arquivo |

## Fontes

### Primárias (confiança ALTA)
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` (pesquisa de projeto já existente, reaproveitada e expandida nesta fase)
- Registro npm (`npm view` direto): `@supabase/supabase-js@2.110.2`, `@supabase/ssr@0.12.0`, `zod@4.4.3`, `react-hook-form@7.81.0`, `sonner@2.0.7`, `libphonenumber-js@1.13.8`

### Secundárias (confiança MÉDIA)
- [Supabase — Setting up Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — via WebSearch, conteúdo de documentação oficial
- [Supabase — onAuthStateChange reference](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) — via WebSearch
- [Supabase — Password-based Auth](https://supabase.com/docs/guides/auth/passwords) — via WebSearch
- [Supabase Discussion #28655 — reset de senha PKCE-safe no App Router](https://github.com/orgs/supabase/discussions/28655) — via WebSearch
- [Supabase Discussion #44953 — onAuthStateChange não dispara em refresh server-side](https://github.com/orgs/supabase/discussions/44953) — via WebSearch
- [Next.js — Middleware matcher](https://nextjs.org/docs/15/pages/api-reference/file-conventions/middleware) — via WebSearch
- [PostgreSQL — citext](https://www.postgresql.org/docs/current/citext.html) — via WebSearch
- [libphonenumber-js — npm/GitHub](https://github.com/catamphetamine/libphonenumber-js) — via WebSearch

### Terciárias (confiança BAIXA)
- Nenhuma — todos os achados desta pesquisa foram cruzados com pelo menos uma fonte de documentação oficial ou o padrão já estabelecido no `ARCHITECTURE.md`/`PITFALLS.md` do projeto, exceto `libphonenumber-js` como escolha de biblioteca (tagueada `[ASSUMED]`, ver Registro de Suposições A1).

## Metadados

**Detalhamento de confiança:**
- Standard Stack: ALTA — versões verificadas via npm registry; `libphonenumber-js` é MÉDIA/BAIXA (nova, tagueada ASSUMED)
- Arquitetura: ALTA — reaproveita padrões já verificados do projeto (`ARCHITECTURE.md`) e cruza com documentação oficial Supabase/Next.js
- Armadilhas: ALTA — 4 das 5 armadilhas desta fase já estavam documentadas em profundidade no `PITFALLS.md` de projeto; apenas o detalhe de `onAuthStateChange` em SSR puro é uma adição nova desta pesquisa (MÉDIA)

**Data da pesquisa:** 2026-07-10/11
**Válida até:** 2026-08-10 (30 dias — stack estável, mas Supabase Auth/GoTrue e Next.js middleware têm histórico de mudanças de comportamento entre versões menores; revalidar se a fase for replanejada após esse prazo)

---
*Pesquisa de fase para: Vitrinoo — Fase 1: Fundação, Conta e Isolamento Multi-Tenant*
*Pesquisado em: 2026-07-10*
