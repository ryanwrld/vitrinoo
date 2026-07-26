# Design — Busca global (command palette) do painel

**Data:** 2026-07-26
**Status:** Aprovado no brainstorming, pronto pra virar plano de implementação

## Contexto e objetivo

O painel admin do Vitrinoo tem uma sidebar com 3 itens de menu (Dashboard, Produtos, Configurações) e um punhado de sub-rotas. O usuário-alvo é um revendedor não-técnico de chuteiras importadas que gerencia o catálogo no painel. Conforme o catálogo cresce (80+ produtos), achar um produto específico exige rolar a lista de `/produtos` ou filtrar manualmente.

Objetivo: um campo de busca na sidebar (entre o logo e "Dashboard") que abre um **command palette central** (modal) servindo como atalho pra:

1. **Navegar** pros destinos fixos do app (menus, seções de configuração, ações rápidas).
2. **Buscar produtos** por nome e pular direto pra edição do produto.

Decisão de valor tomada no brainstorming: busca **navegação + produtos** (não só navegação — atalho pra 9 rotas fixas isolado teria valor baixo; produtos é o que justifica a feature). Layout **modal central** (não dropdown transbordando a sidebar de 232px — cards de produto precisam de largura e um painel transbordando lê como glitch pro usuário leigo).

## Escopo

**Dentro:**
- Campo de busca compacto na sidebar desktop, entre o logo e o primeiro item de menu.
- Abre um modal central (fundo escurecido) ao clicar no campo ou apertar `⌘K` / `Ctrl+K`.
- Busca em duas fontes: registro estático de rotas/ações + produtos (dinâmico).
- Buscas recentes persistidas em `localStorage`.
- Navegação por teclado (↑ ↓ Enter Esc) e por clique.
- Estados: vazio (sem query), sem resultados, carregando produtos.
- Dark mode via tokens.

**Fora (follow-up, não neste ciclo):**
- Gatilho no drawer mobile — primeira entrega é **desktop-first**. O modal em si funciona em qualquer largura, mas onde/como acionar dentro do drawer mobile fica pra um segundo momento.
- Busca em ações complexas (marcar esgotado, copiar link, trocar tema pelo palette) — o escopo é rotas + produtos; ações extras são um follow-up.
- Deep-link pra seções internas de Configurações via âncora (Tema/Senha rolam pra seção) — opcional, ver "Melhorias futuras".

## Fontes de busca

### 1. Registro estático de rotas/ações (`lib/search/registry.ts`)

Array tipado, fácil de estender. Cada item:

```ts
type SearchEntry = {
  id: string;
  label: string;        // "Novo produto"
  keywords: string[];   // ["cadastrar", "adicionar", "criar"] — tolera como o usuário chama
  icon: LucideIcon;
  kind: "route" | "external" | "action";
  href?: string;        // rota interna ou URL externa
};
```

Itens iniciais (derivados das rotas reais do app):

| Label | href / ação | kind | keywords (exemplos) |
|---|---|---|---|
| Dashboard | `/dashboard` | route | início, home, painel, visão geral |
| Notificações | `/dashboard/notificacoes` | route | atividade, avisos, sino |
| Produtos | `/produtos` | route | catálogo, chuteiras, itens |
| Novo produto | `/produtos/novo` | route | cadastrar, adicionar, criar |
| Configurações | `/configuracoes` | route | ajustes, preferências, conta |
| Configurações da loja | `/configuracoes/loja` | route | identidade, whatsapp, link, slug, logo |
| Ver minha vitrine | `/loja/<slug>` | external | pública, link, compartilhar |
| Falar com suporte | `wa.me/...` | action | ajuda, contato, whatsapp |

Filtro por texto: normaliza (minúsculo, sem acento) o input e casa contra `label` + `keywords`. "Ver minha vitrine" só aparece quando há `storeSlug`.

### 2. Produtos (dinâmico) — `lib/search/actions.ts`

Server Action `searchProducts(q: string)`:
- Resolve a loja pelo `owner_id` (mesmo padrão de `getOwnedStore` em `settings/actions.ts` — nunca confia em id vindo do client).
- `ilike` no `name` (reaproveita o padrão já existente em `lib/products/list.ts`), escopado por `store_id`.
- Limite ~6 resultados, ordenado por relevância simples (ex.: `created_at desc` ou match no início do nome).
- Retorna `{ id, name, price, status, coverPath }` por produto; a capa resolve pra URL pública no client (mesmo helper de `getPublicUrl` já usado no dashboard).
- Chamada com **debounce ~250ms** no client; não dispara com query vazia ou < 2 caracteres.
- Cada resultado navega pra `/produtos/<id>/editar`.

## UX e comportamento

**Abrir:** clique no campo da sidebar OU `⌘K`/`Ctrl+K` (hint visível dentro do campo). Foca o input do modal automaticamente.

**Digitar:**
- Query vazia → mostra "Buscas recentes" (localStorage) e, abaixo, os itens de navegação principais (Dashboard, Produtos, Novo produto, Configurações) como acesso rápido. Se não houver buscas recentes, mostra só a navegação principal.
- Query ≥ 2 chars → filtra o registro estático (instantâneo, client) + dispara `searchProducts` debounced.
- Seções no resultado, na ordem: **Navegação** (rotas/ações que casam) → **Produtos** (cards com capa + nome + preço + badge disponível/esgotado).

**Selecionar:**
- Teclado: ↑ ↓ move o item destacado (índice unificado através das seções), Enter navega, Esc fecha.
- Clique: usar `onMouseDown` (não `onClick`) pra o clique registrar antes de qualquer blur/fechamento.
- Ao selecionar, grava o termo em "Buscas recentes" e navega (`router.push` interno; `window.open`/`<a>` pra external; dispara a ação pra kind=action).

**Fechar:** Esc, clique no backdrop, ou após selecionar. Foco volta pro campo da sidebar.

**Estados:**
- Sem resultados: "Nenhum resultado — tente o nome do modelo."
- Carregando produtos: skeleton leve nos cards (não spinner solto), enquanto a navegação estática já aparece instantânea.

## Animação

Espírito da referência (fade + leve deslize/escala ao abrir), porém aplicado ao modal e **controlado por estado React** (não `:focus`/`peer-focus` puro — CSS sozinho não filtra lista, não navega por teclado, e o `:focus` fecharia o painel antes do clique num resultado registrar). Reaproveita as keyframes que já existem em `globals.css` (`animate-scale-in`/`animate-fade-in`) pro modal + backdrop. Respeita `prefers-reduced-motion` (já tratado no projeto).

## Dark mode

Tudo via tokens `--color-*` do design system (a referência é `bg-white` fixo — não copiar hex). Modal, backdrop, hover de item, badges seguem os mesmos tokens já usados no popup de notificações e nos cards do dashboard.

## Arquitetura (isolamento)

| Arquivo | Papel | Depende de |
|---|---|---|
| `src/components/sidebar-search.tsx` (novo, client) | Campo na sidebar + modal + estado/teclado/debounce | registry, actions, localStorage helper |
| `src/lib/search/registry.ts` (novo) | Array estático de rotas/ações + função de filtro normalizado | tipos lucide |
| `src/lib/search/actions.ts` (novo, server) | `searchProducts(q)` com `ilike` + limite, escopado por owner | supabase server client |
| `src/lib/search/recent-searches.ts` (novo, client) | Ler/gravar buscas recentes no localStorage (chave escopada) | — |
| `src/components/admin-sidebar.tsx` (editar) | Renderiza `<SidebarSearch>` entre o logo e `NavLinks` (desktop) | sidebar-search |

Cada unidade tem uma responsabilidade só e interface clara. `sidebar-search.tsx` é o único com estado; registry/actions/recent são puros/isoláveis e testáveis fora do componente.

## Gaps de UX e mitigações (preventivas)

| Gap | Mitigação |
|---|---|
| "Digitei e não achei" (produto inexistente / erro de digitação) | Estado vazio explícito + normalização sem acento no filtro estático; produtos via `ilike` (case-insensitive) |
| Usuário não sabe que existe / que dá teclado | Placeholder claro + hint `⌘K` no campo |
| Cards de produto não cabem na sidebar (232px) | Modal central resolve — largura confortável |
| Dark mode (painel tem) vs referência branca | Tokens `--color-*`, sem hex fixo |
| Clique no resultado fecha antes de navegar | `onMouseDown` em vez de `onClick` |
| Buscas recentes sem escopo por loja | Chave localStorage escopada; limpar não afeta outros dados |
| Digitação rápida disparando muitas queries | Debounce 250ms + mínimo 2 chars |

## Critérios de aceite

1. Campo aparece na sidebar desktop entre o logo e "Dashboard".
2. `⌘K`/`Ctrl+K` e clique abrem o modal; Esc/backdrop/seleção fecham.
3. Digitar filtra rotas instantâneo e produtos com debounce.
4. Selecionar uma rota navega; selecionar um produto abre `/produtos/<id>/editar`.
5. Teclado ↑↓ Enter Esc funciona; clique funciona sem fechar antes.
6. Buscas recentes persistem entre navegações (localStorage).
7. Estados vazio/sem-resultado/carregando presentes.
8. Funciona em claro e escuro via tokens; respeita reduced-motion.
9. Nenhuma regressão na sidebar/drawer existentes; lint limpo.

## Testes

- `registry`: filtro normalizado (com/sem acento, por keyword, item external só com slug) — teste unitário puro.
- `recent-searches`: adicionar/limitar/deduplicar — teste unitário puro.
- `searchProducts`: escopo por owner e `ilike` — segue o padrão dos testes de `list.ts` (dependem do Supabase de teste, hoje não configurado nesta máquina; marcar/skip conforme convenção do projeto).
- Interação do componente (teclado, mousedown) — teste de componente se o setup do projeto permitir; senão, checklist manual nos critérios de aceite.

## Melhorias futuras (fora deste ciclo)

- Gatilho e layout no drawer mobile.
- Deep-link pras seções de Configurações (Tema/Senha) via âncora.
- Ações no palette (marcar esgotado, copiar link da vitrine, trocar tema).
- Ranqueamento de resultados por uso/recência.
