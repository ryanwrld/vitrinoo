# Pesquisa de Arquitetura

**Domínio:** Micro-SaaS de catálogo/vitrine multi-tenant (Next.js + Supabase), painel admin de revendedor + vitrine pública sem autenticação
**Pesquisado em:** 2026-07-10
**Confiança:** MÉDIA (padrões são padrão/bem documentados; limites específicos de tier de plano verificados contra a documentação atual do Supabase)

## Arquitetura Padrão

### Visão Geral do Sistema

```
┌───────────────────────────────────────────────────────────────────────┐
│                         NAVEGADOR (2 públicos)                        │
│  ┌───────────────────┐             ┌────────────────────────────┐     │
│  │  Revendedor (admin) │             │  Cliente final (público)   │     │
│  │  autenticado        │             │  sem auth, mobile-first    │     │
│  └─────────┬──────────┘             └──────────────┬─────────────┘    │
├────────────┼─────────────────────────────────────────┼────────────────┤
│            ▼         NEXT.JS APP ROUTER                ▼               │
│  ┌────────────────────┐               ┌─────────────────────────┐    │
│  │ /admin/**           │               │ /loja/[slug]/**         │    │
│  │ (route group,       │               │ (route group,           │    │
│  │  protegido)         │               │  PÚBLICO — nenhum       │    │
│  │ - middleware checa  │               │  middleware de auth     │    │
│  │   sessão do Supabase│               │  jamais)                │    │
│  │ - Server Actions    │               │ - renderizado no servidor│   │
│  │   para escritas CRUD│               │ - filtros via parâmetros│    │
│  │                     │               │   de URL                │    │
│  └──────────┬──────────┘               └────────────┬─────────────┘  │
├─────────────┼───────────────────────────────────────┼────────────────┤
│             ▼         SUPABASE (projeto único)        ▼               │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  Postgres (RLS aplicado em cada tabela)                        │   │
│  │  stores | products | product_sizes | store_settings | events   │   │
│  ├───────────────────────────────────────────────────────────────┤   │
│  │  Auth (apenas email/senha — identidades de revendedor)          │   │
│  ├───────────────────────────────────────────────────────────────┤   │
│  │  Storage (bucket: product-images, leitura pública, escrita owner)│  │
│  └───────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│  WhatsApp (link profundo wa.me) — apenas client-side, sem round-trip│
│  para o servidor                                                    │
└───────────────────────────────────────────────────────────────────────┘
```

### Responsabilidades dos Componentes

| Componente | Responsabilidade | Implementação Típica |
|-----------|----------------|------------------------|
| Auth do Admin | Cadastro/login do revendedor, sessão, protege `/admin/**` | Supabase Auth (email/senha), middleware do Next.js escopado APENAS ao prefixo de caminho `/admin` |
| Modelo de Dados (Postgres + RLS) | Fonte única de verdade para lojas, produtos, tamanhos/estoque, configurações, eventos; aplica isolamento por revendedor | Supabase Postgres, um schema compartilhado, FK `store_id`/`owner_id` em toda tabela de tenant, política RLS por tabela |
| CRUD de Produtos | Criar/editar/excluir produtos, marcar tamanhos esgotados, gerenciar fotos | Server Actions do Next.js escrevendo via cliente Supabase (autenticado, escopado por RLS a `auth.uid()`) |
| Pipeline de Mídia | Aceitar uploads, comprimir, armazenar, servir rápido | Compressão no lado do cliente (browser-image-compression ou redimensionamento via canvas) antes do upload → bucket do Supabase Storage → `next/image` com loader remoto |
| Configuração da Loja | Número de WhatsApp, template de mensagem, branding (logo, cor, frase) | Uma única linha `store_settings` por loja, mesmo padrão RLS que produtos |
| Renderizador da Vitrine Pública | Resolver slug → renderizar produtos, filtros, paginação, sem auth | Server Component, fetch com **no-store** (ver Fluxo de Dados), Supabase com **chave anon** + política pública de SELECT |
| Gerador de Link Profundo do WhatsApp | Construir URL `wa.me`/`api.whatsapp.com` com mensagem codificada e templatizada | Função pura client-side, roda no clique do botão, sem chamada de backend necessária |
| Métricas/Eventos | Rastrear pageviews, visualizações de produto, cliques no WhatsApp | Tabela `events` leve, inserção fire-and-forget (cliente → política de inserção anon do Supabase, ou uma rota de API fina) |
| Slug + QR | Slug único por loja, QR code para a URL pública | Verificação de unicidade de slug como uma constraint única do Postgres + validação quase em tempo real ao salvar; QR gerado no lado do cliente (lib `qrcode`) a partir da URL resolvida |

## Estrutura de Projeto Recomendada

```
src/
├── app/
│   ├── (admin)/                # árvore autenticada — matcher do middleware mira só nesta
│   │   ├── layout.tsx          # checagem de sessão, redireciona para /login se não houver
│   │   ├── dashboard/page.tsx
│   │   ├── produtos/           # telas de CRUD
│   │   ├── loja/page.tsx       # configurações da loja (branding, WhatsApp)
│   │   └── login/page.tsx      # NÃO fica atrás do middleware (entrada pública para o admin)
│   ├── loja/
│   │   └── [slug]/
│   │       ├── page.tsx        # vitrine pública — NUNCA tocada pelo middleware do admin
│   │       └── loading.tsx     # skeleton loader (conforme PITFALLS: skeleton antes do conteúdo)
│   └── api/
│       └── events/route.ts     # endpoint fino opcional para inserção de métricas
├── lib/
│   ├── supabase/
│   │   ├── server.ts           # cliente servidor (baseado em cookies, respeita RLS como usuário autenticado)
│   │   ├── admin-actions.ts    # server actions para CRUD de produto/loja
│   │   └── public-client.ts    # cliente com chave anon para leituras da vitrine (sem cookies necessários)
│   ├── whatsapp/
│   │   └── build-link.ts       # substituição de template + encodeURIComponent, testável unitariamente
│   └── slug/
│       └── validate.ts         # formato de slug + verificação de unicidade
├── components/
│   ├── admin/                  # formulários CRUD, uploader de imagem, toasts
│   └── storefront/              # ProductCard, SizePicker, FilterBar, OrderButton
└── middleware.ts                # matcher: apenas /admin/:path* — exclusão explícita de /loja
```

### Justificativa da Estrutura

- **Grupo de rotas `(admin)`:** isola cada tela autenticada sob um único matcher de middleware. Isso torna a restrição "a rota pública nunca deve ver middleware de auth" uma garantia estrutural, não uma checagem em tempo de execução que pode ser esquecida em um arquivo.
- **`loja/[slug]` fora de qualquer grupo protegido:** a vitrine pública literalmente não pode ser capturada pelo padrão do matcher do middleware de admin, fechando o modo de falha mais catastrófico citado nos próprios alertas do projeto (middleware de auth interceptando a rota pública).
- **`public-client.ts` separado de `server.ts` para o Supabase:** a vitrine nunca deve construir um cliente que carregue a sessão/cookies do admin — usar a chave anon explicitamente para leituras públicas mantém as duas fronteiras de confiança estruturalmente distintas, não só distintas por política.
- **`lib/whatsapp/build-link.ts` como uma função pura e isolada:** esta é a função de maior valor em todo o produto (conforme o "Core Value" e o alerta #1 do PROJECT.md). Isolá-la permite que seja testada unitariamente diretamente contra os requisitos de acentos/caracteres especiais/codificação sem precisar subir um navegador.

## Padrões Arquiteturais

### Padrão 1: Multi-tenancy de schema compartilhado com isolamento aplicado por RLS

**O quê:** Um schema Postgres, um conjunto de tabelas (`stores`, `products`, `product_sizes`, `store_settings`, `events`), cada tabela pertencente a um tenant carrega `store_id`. Políticas RLS fazem o isolamento, não o código da aplicação.
**Quando usar:** Sempre, nesta escala (dezenas a poucas centenas de revendedores). Schema-por-tenant ou banco-por-tenant é um padrão de escalonamento para tenants muito grandes e sensíveis a isolamento (ex.: compliance corporativo) — irrelevante aqui.
**Trade-offs:** Migrations mais simples, queries de dashboard admin mais simples, mais barato no tier gratuito do Supabase. Custo: toda query e toda nova tabela precisa ter sua política RLS revisada — uma política ausente é um vazamento de dados, não apenas um bug.

**Exemplo (formato conceitual de política):**
```sql
-- Escrita/leitura admin: apenas o proprietário
create policy "owner_full_access" on products
  for all using (store_id in (select id from stores where owner_id = auth.uid()));

-- Leitura pública: apenas lojas publicadas, apenas produtos ativos
create policy "public_read_active_products" on products
  for select to anon
  using (
    status = 'active'
    and store_id in (select id from stores where status = 'published')
  );
```

### Padrão 2: Renderização pública resolvida por slug, sem sessão no meio do caminho

**O quê:** A vitrine pública resolve `[slug]` → `store_id` via uma única consulta indexada, depois consulta produtos escopados àquele `store_id` usando a **chave anon** do Supabase (não a sessão do admin). Sem cookies, sem checagem de auth, sem lógica de redirect nesse caminho de forma alguma.
**Quando usar:** Qualquer rota explicitamente exigida a funcionar para usuários anônimos, especialmente uma acessada via links compartilhados onde atrito de auth mata diretamente a conversão (o Core Value declarado deste projeto).
**Trade-offs:** Requer disciplina para manter o acesso a dados dessa rota estritamente na política RLS pública (nunca importar acidentalmente o cliente Supabase autenticado do admin em um componente alcançável a partir de `/loja/[slug]`).

### Padrão 3: Frescor disparado por mutação em vez de polling em segundo plano

**O quê:** Em vez de um timer de expiração de cache ou uma subscrição websocket, a própria escrita do admin (a server action que marca um tamanho como "esgotado") é o gatilho para o frescor. Duas implementações viáveis, em ordem de recomendação para a escala deste projeto:
1. **Nenhum cache na rota pública, de forma alguma** (`fetch(..., { cache: 'no-store' })` / segmento de rota `export const dynamic = 'force-dynamic'`). Cada visualização da página da vitrine consulta o Postgres diretamente. Na escala de dezenas de lojas e tráfego público realista (links compartilhados abertos por clientes individuais, não carga sustentada), isso está trivialmente dentro dos limites do tier gratuito do Supabase e dá frescor real em tempo real com zero infraestrutura extra.
2. **`revalidateTag`/`revalidatePath` sob demanda** chamado ao final de toda server action que afeta estoque, com a página da vitrine marcada correspondentemente. Adiciona uma camada de cache de volta (útil uma vez que o tráfego cresça o suficiente para que o volume de leitura no BD importe) mas reintroduz uma classe de bugs (esquecer de marcar um caminho de mutação) que o padrão 1 evita completamente.
**Quando usar:** Comece com (1). Mude para (2) apenas quando o volume/latência de leitura do Supabase se tornar um problema medido — não preemptivamente.
**Trade-offs:** O Supabase Realtime (subscrições websocket empurrando mudanças do Postgres para abas de navegador abertas) foi considerado e rejeitado para o MVP: resolve um problema que este produto não tem (um cliente olhando para uma aba já aberta esperando o estoque mudar), enquanto adiciona gerenciamento de ciclo de vida de conexão, tratamento de reconexão, e uma nova classe de bugs no lado do cliente. Revisitar apenas se uma funcionalidade futura precisar de presença multi-visualizador ao vivo (ex.: "3 pessoas vendo agora").

## Fluxo de Dados

### Escrita do admin → leitura pública (o caminho crítico para o requisito de sincronização de estoque)

```
Revendedor marca tamanho "esgotado" em /admin/produtos
    ↓ (Server Action, cliente Supabase autenticado, RLS: owner_id = auth.uid())
UPDATE product_sizes SET status = 'esgotado' WHERE id = ...
    ↓
Commit no Postgres (fonte única de verdade)
    ↓
Toast confirma o salvamento (conforme PITFALLS #9: feedback visual imediato, nunca silencioso)
    ↓
[Sem camada de cache — ver Padrão 3]
    ↓
Próxima requisição a /loja/[slug] (de qualquer lugar, qualquer pessoa) consulta o Postgres diretamente
    ↓ (chave anon, RLS: política public_read_active_products)
Vitrine re-renderiza com o estado de estoque correto e atual
```

Isso satisfaz "atraso de segundos, nunca minutos" por construção — não há camada intermediária de cache para ficar obsoleta, porque não há cache. Se o volume de leitura algum dia exigir a introdução de um, ele deve ser pareado com `revalidateTag` disparado a partir da mesma server action, não desacoplado.

### Fluxo de pedido (a conversão real — sem round-trip para o backend)

```
Cliente seleciona tamanho disponível (apenas estado client-side)
    ↓
Clica "Pedir agora"
    ↓
lib/whatsapp/build-link.ts:
  - substitui {modelo}/{solado}/{tamanho}/{preço} no template de mensagem da loja
  - encodeURIComponent(mensagem)
  - constrói https://wa.me/<numero>?text=<encoded>
    ↓
window.location / <a href> abre o WhatsApp (app ou web)
    ↓ (fire-and-forget, não-bloqueante)
POST /api/events { type: 'whatsapp_click', store_id, product_id }
```

Deliberadamente sem dependência de servidor entre "tamanho selecionado" e "WhatsApp abre" — isso é uma computação puramente client-side. Isso importa porque o revendedor pode estar offline e a rede do cliente pode ser ruim; o único fluxo que o produto não pode falhar não deve depender de um round-trip bem-sucedido.

### Fluxos de Dados Principais

1. **CRUD Admin → Storage:** O upload de imagem comprime no lado do cliente primeiro (respeita a orientação de 5MB pré-upload do PROJECT.md), depois vai para o bucket `product-images` do Supabase Storage (leitura pública, escrita owner via políticas de Storage equivalentes a RLS). A linha do produto armazena a(s) URL(s) pública(s) resultante(s); `next/image` cuida da entrega responsiva.
2. **Métricas:** Pageviews da vitrine e cliques no WhatsApp inserem em uma tabela `events` via uma política RLS de inserção pública somente (ou uma rota fina `/api/events` se você quiser manter a lógica de inserção server-side e validada). O dashboard admin agrega essa tabela com leituras escopadas por RLS ao owner — nenhum serviço de analytics separado necessário nesta escala.

## Considerações de Escalonamento

| Escala | Ajustes de Arquitetura |
|-------|--------------------------|
| 0-1 mil visualizações de vitrine/dia (alvo real de curto prazo deste projeto: dezenas de revendedores) | SSR sem cache em `/loja/[slug]` (Padrão 3, opção 1). Tier gratuito do Supabase. Schema único compartilhado. Sem fila, sem jobs em segundo plano. |
| 1 mil-100 mil visualizações/dia | Introduzir `revalidateTag` + `s-maxage` curto na edge do CDN para a página da vitrine; manter RLS/schema inalterados. Adicionar cursor de paginação (não offset) uma vez que contagens de produtos e visualizadores cresçam. Considerar o add-on de compute do Supabase se as contagens de linhas crescerem para milhões. |
| 100 mil+ visualizações/dia | Não é uma preocupação realista de curto prazo (a própria métrica de sucesso do produto é "primeiro pedido WhatsApp", não escala) — adiar. Se acontecer, olhar para cache edge por loja (a vitrine de cada loja é independentemente cacheável) antes de considerar réplicas de leitura. |

### Prioridades de Escalonamento

1. **Primeiro gargalo (realista para este produto):** custos de egress de imagem/transformação de imagem do Supabase Storage se lojas ricas em fotos ficarem populares — mitigado por compressão no lado do cliente no momento do upload (já exigida pelo PROJECT.md) em vez de depender das Transformações de Imagem server-side do Supabase, que são restritas ao **plano Pro ou superior**, não disponível no tier gratuito que este projeto mira para $0/mês no lançamento.
2. **Segundo gargalo:** paginação do catálogo de produtos — o PROJECT.md já sinaliza "vitrine renderizando todos os produtos de uma vez" como um bug conhecido a evitar; ~20 produtos por carregamento via paginação baseada em cursor ou scroll infinito desde o primeiro dia, não retrofitado depois.

## Antipadrões

### Antipadrão 1: Middleware de auth com um matcher amplo o suficiente para capturar a rota pública

**O que as pessoas fazem:** Escrever `middleware.ts` com `matcher: ['/((?!_next|static).*)']` (catch-all) e adicionar uma checagem de allowlist dentro para caminhos públicos.
**Por que está errado:** Este é exatamente o modo de falha que o PROJECT.md cita como crítico (alerta #5) — uma condição esquecida na allowlist e a vitrine pública dá 404 ou redireciona para o login para todo cliente clicando em um link compartilhado. Uma allowlist é uma checagem em tempo de execução que pode regredir silenciosamente em qualquer edição futura de middleware.
**Faça isto em vez:** Escope o próprio `matcher` do middleware apenas para `/admin/:path*`. A rota pública então se torna inalcançável pelo middleware por construção — não há condição a esquecer.

### Antipadrão 2: Recorrer ao Supabase Realtime/websockets para atender o requisito "segundos, não minutos"

**O que as pessoas fazem:** Ver "quase em tempo real" e pular direto para subscrições Postgres Changes empurradas via websockets para a vitrine.
**Por que está errado:** Adiciona gerenciamento de ciclo de vida de conexão (reconectar após queda de rede — relevante dado as próprias preocupações do projeto com instabilidade de rede móvel), uma nova superfície de dependência, e não melhora de fato a experiência: um cliente carregando uma página nova já recebe dados atuais. O Realtime só importa se a *mesma aba aberta* precisar atualizar sem um reload, o que não é um requisito declarado.
**Faça isto em vez:** Fetch SSR sem cache a cada carregamento de página (Padrão 3). É mais simples, tem menos modos de falha, e atende o requisito real (atraso medido em segundos entre uma edição do admin e o *próximo* carregamento de página, não atualizar ao vivo uma aba já aberta).

### Antipadrão 3: Construir o link do WhatsApp no lado do servidor

**O que as pessoas fazem:** Adicionar uma rota de API que recebe IDs de produto/tamanho/loja e retorna a URL `wa.me` construída, chamando-a no clique do botão.
**Por que está errado:** Introduz um round-trip de rede e um modo de falha (API fora do ar, lenta, ou a conexão do cliente cai) diretamente no único fluxo que o produto não pode falhar (a declaração de Core Value do PROJECT.md é explícita sobre isso). Também adiciona latência ao que deveria parecer instantâneo.
**Faça isto em vez:** Buscar as configurações da loja (número de WhatsApp + template) uma vez quando a página da vitrine renderiza (já necessário para exibição), e fazer a construção do link (incluindo `encodeURIComponent`) inteiramente no lado do cliente no clique.

### Antipadrão 4: Schema-por-tenant ou banco-por-tenant

**O que as pessoas fazem:** Para isolamento multi-tenant "de verdade", provisionar um schema separado ou projeto Supabase separado por revendedor.
**Por que está errado:** Overhead operacional massivo (migrations rodam N vezes, complexidade de pool de conexão) para um produto explicitamente visando "dezenas" de revendedores pré-monetização. Resolve um problema de isolamento que o RLS já resolve no nível de linha.
**Faça isto em vez:** Schema compartilhado, FK `store_id` em toda parte, políticas RLS como a fronteira de isolamento (Padrão 1).

## Pontos de Integração

### Serviços Externos

| Serviço | Padrão de Integração | Notas |
|---------|---------------------|-------|
| Supabase Auth | Apenas email/senha, sessão via cookies (helpers de cliente servidor do Next.js) | Sem OAuth conforme decisão de escopo do PROJECT.md — reduz área de superfície, uma integração a menos para errar |
| Supabase Postgres | Schema compartilhado aplicado por RLS, acessado via cliente servidor `@supabase/ssr` (admin) e cliente anon (público) | Nunca use a chave `service_role` em nenhum caminho de código alcançável pelo navegador |
| Supabase Storage | Bucket `product-images`, leitura pública, política de escrita escopada ao owner, tamanho máximo de arquivo no nível do bucket ajustado para corresponder ao limite de upload de 5MB | Transformações de Imagem server-side requerem plano Pro — fazer compressão no lado do cliente em vez disso para o MVP |
| WhatsApp (`wa.me`) | Link profundo puramente client-side, sem necessidade de integração com a API WhatsApp Business | Testar em Android/iOS × Chrome/Safari/Samsung Internet conforme alerta #1 do PROJECT.md; verificar formatos de número tanto com quanto sem DDI |
| Vercel | Hospedagem para Next.js, middleware de edge para o matcher `/admin` | Tier gratuito suficiente na escala-alvo; revisitar apenas se limites de execução de função ou bandwidth forem aproximados |

### Fronteiras Internas

| Fronteira | Comunicação | Notas |
|----------|---------------|-------|
| Painel admin ↔ Postgres | Server Actions usando o cliente Supabase autenticado (baseado em cookies) | RLS é a aplicação real; Server Actions são a interface, não a fronteira de segurança |
| Vitrine pública ↔ Postgres | Fetch de Server Component usando o cliente com **chave anon**, sem cookies | Nunca deve importar ou compartilhar o módulo de cliente admin autenticado |
| Vitrine ↔ WhatsApp | Apenas chamada de função client-side, sem hop de rede para seu próprio backend | Ver Antipadrão 3 |
| Vitrine/Admin ↔ Métricas | Inserção fire-and-forget, não bloqueia nem restringe nenhuma ação voltada ao usuário | Uma inserção de métricas falha nunca deve quebrar o fluxo do WhatsApp ou a visualização do produto |

## Fontes

- [Next.js — Guides: Multi-tenant](https://nextjs.org/docs/app/guides/multi-tenant) — ALTA (documentação oficial)
- [Next.js — revalidateTag reference](https://nextjs.org/docs/app/api-reference/functions/revalidateTag) — ALTA (documentação oficial)
- [Next.js — Getting Started: Revalidating](https://nextjs.org/docs/app/getting-started/revalidating) — ALTA (documentação oficial)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — ALTA (documentação oficial)
- [Supabase — Using Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) — ALTA (documentação oficial)
- [Supabase — Storage Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) — ALTA (documentação oficial; confirma restrição ao plano Pro)
- [Supabase — Storage v2: Image resizing and Smart CDN (blog)](https://supabase.com/blog/storage-image-resizing-smart-cdn) — MÉDIA (blog oficial)
- [Supabase — Storage Optimizations](https://supabase.com/docs/guides/storage/production/scaling) — ALTA (documentação oficial)
- [MakerKit — Supabase RLS Best Practices: Production Patterns for Multi-Tenant Apps](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) — MÉDIA (comunidade, cruzada com documentação oficial)
- [peal.dev — Multi-Tenant Subdomain Routing in Next.js: The Complete Pattern](https://www.peal.dev/blog/multi-tenant-subdomain-routing-nextjs-patterns) — MÉDIA (comunidade, cruzada com o guia oficial de multi-tenant)
- Restrições específicas do projeto e catálogo de bugs conhecidos: `.planning/PROJECT.md` (este repositório)

---
*Pesquisa de arquitetura para: catálogo/vitrine de revendedor multi-tenant (Vitrinoo)*
*Pesquisado em: 2026-07-10*
