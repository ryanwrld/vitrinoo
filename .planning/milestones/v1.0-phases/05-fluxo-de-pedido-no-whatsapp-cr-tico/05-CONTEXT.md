# Phase 5: Fluxo de Pedido no WhatsApp (CRÍTICO) - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

O cliente final consegue selecionar um tamanho disponível de um produto e disparar uma mensagem de pedido pronta e corretamente codificada no WhatsApp do revendedor — a única conversão que importa no produto. Isso inclui: a página de detalhe do produto (não existe ainda — a vitrine hoje só tem o grid de cards), a seleção de tamanho com validação de estoque, o botão "Pedir agora" com a lógica de encoding e fallback, e o registro fire-and-forget do clique. Testado exaustivamente na matriz obrigatória de dispositivos/navegadores (Android Chrome/Samsung Internet/Firefox, iOS Safari/Chrome, in-app do Instagram e do WhatsApp).

</domain>

<decisions>
## Implementation Decisions

### Onde a seleção de tamanho acontece
- **D-01:** Página de detalhe do produto dedicada (`/loja/[slug]/[produto]`), não modal/accordion inline no grid. O card do grid (`product-card.tsx`) passa a ser um link que navega para essa página. Justificativa: mais espaço pra fotos grandes, URL compartilhável do produto específico, e evita a complexidade de bottom-sheet responsivo no mobile.

### Comportamento do botão "Pedir agora"
- **D-02:** O botão é **sempre clicável** (nunca fica em estado `disabled`/cinza). Se nenhum tamanho estiver selecionado no momento do clique, dispara shake animation + tooltip "Selecione um tamanho" e **nunca** abre o WhatsApp com mensagem incompleta — conforme já especificado no ROADMAP (Success Criteria #4). Confirma explicitamente: não usar o padrão "desabilitado até selecionar", que contradiria essa especificação.
- **D-03:** Ao clicar com sucesso (tamanho já selecionado), o link `<a href="wa.me/...">` real abre o WhatsApp e a página da vitrine permanece exatamente como estava — **sem** toast/confirmação adicional. O próprio WhatsApp abrindo já é a confirmação visual suficiente para o cliente.
- **D-04:** Tamanhos esgotados seguem o Success Criteria #2 do ROADMAP: visual riscado + `pointer-events: none`, com revalidação no momento do clique (incluindo clique rápido/duplo e Enter no teclado) — nenhuma decisão nova aqui além do que já está travado no ROADMAP.

### Limitação técnica crítica: foto do produto na mensagem
- **D-05 [informational] (constraint técnica, não decisão de produto):** O link `wa.me` do WhatsApp só aceita texto no parâmetro da mensagem — é **tecnicamente impossível** anexar uma imagem automaticamente via deep link, em qualquer plataforma (Android, iOS, WhatsApp Web). Isso é uma limitação da API do WhatsApp, não uma limitação do código do Vitrinoo. Não requer cobertura própria em plano — é o motivo pelo qual D-06 existe (URL da foto como texto).
- **D-06:** Resolução escolhida: a mensagem de texto inclui a **URL direta da foto de capa do produto** (ex: `Foto: https://.../produto.jpg`). O WhatsApp normalmente gera um preview automático da imagem a partir do link na conversa, então o revendedor vê a foto sem precisar de anexo manual. Isso resolve a ambiguidade de identificar a variação exata do produto (cor/edição) quando múltiplos produtos compartilham o mesmo nome de modelo (ex: "Nike Mercurial Vapor 16" em cores diferentes).
- **D-07:** O botão secundário "Copiar mensagem" (fallback) copia o **mesmo texto** que seria enviado via wa.me — incluindo a URL da foto — pra área de transferência, com toast "Mensagem copiada!". Não copia número de telefone separadamente (evita misturar dois dados diferentes numa única string colada) e não tenta usar Clipboard API para copiar a imagem binária (cobertura de navegador inconsistente entre Chrome/Android e Safari/iOS — o link de foto no texto já resolve o problema de identificação).
- **D-08:** O botão "Copiar mensagem" é **sempre visível** ao lado/abaixo do "Pedir agora", não é um fallback condicional que aparece só quando o wa.me "falha" — detecção automática de falha de link entre navegadores/apps é pouco confiável (falsos positivos/negativos). É um plano B manual sempre disponível.

### Registro do clique (analytics)
- **D-09:** Cria uma tabela nova e mínima (algo como `order_clicks`: product_id, size, timestamp, scoped por RLS ao owner via join em products→stores) via Server Action fire-and-forget que não bloqueia a abertura do link do WhatsApp. **Sem UI/dashboard nesta fase** — só captura o dado bruto para a Fase 6 (Métricas e Dashboard) consumir depois. Evita retrabalho de schema quando a Fase 6 chegar.
- **D-10:** O disparo do registro de clique deve ser "fire-and-forget" de verdade: a navegação para o link `wa.me` (via `<a href>` real, nunca `window.open` programático — regra já travada no CLAUDE.md) não pode ser bloqueada nem atrasada esperando a Server Action de analytics responder.

### Claude's Discretion
- Estrutura exata da tabela `order_clicks` (nomes de coluna, índices) fica a critério do planner/pesquisador, desde que capture product_id + size + timestamp e respeite RLS multi-tenant.
- Estilo visual exato do shake animation e do tooltip fica a critério do design (mobile-first, consistente com o resto da vitrine pública).
- Mecanismo exato de geração da URL pública da foto de capa (reaproveitar helper existente do Storage da Fase 3, se houver) fica a critério do research/planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Regras de negócio e stack (fonte da verdade)
- `.claude/CLAUDE.md` — regras rígidas de construção do link do WhatsApp (`https://wa.me/<digitos>?text=<encodeURIComponent(mensagem)>`, sempre `<a href>` real nunca `window.open`, encoding uma única vez sobre a mensagem completa, matriz de teste obrigatória incluindo navegadores in-app do Instagram/WhatsApp)
- `.planning/PROJECT.md` — template padrão da mensagem de WhatsApp (linhas ~89-99: Modelo/Solado/Tamanho/Preço), fluxo de pedido descrito na seção de UX, catálogo de bugs a evitar (item #6: encoding, item #7: normalização de telefone)
- `.planning/REQUIREMENTS.md` — requisitos PED-01, PED-02, PED-03, PED-04 desta fase
- `.planning/ROADMAP.md` (seção Phase 5) — Success Criteria travados e matriz de teste obrigatória (bloqueador de encerramento da fase)

### Schema e padrões de fases anteriores
- `.planning/phases/03-crud-de-produtos-e-pipeline-de-m-dia/03-01-SUMMARY.md` — schema `products`/`product_sizes`/`product_photos`, disponibilidade derivada via EXISTS (padrão a seguir para checar tamanho disponível no momento do clique)
- `.planning/phases/01-funda-o-conta-e-isolamento-multi-tenant/01-CONTEXT.md` — normalização do número de WhatsApp para formato E.164 `55DDXXXXXXXXX`, já feita no onboarding (Fase 1) — este número é lido, não re-derivado, no momento do clique

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/loja/[slug]/product-card.tsx` — card atual do grid da vitrine pública (Server Component, sem link de navegação ainda); precisa virar um link para a nova página de detalhe
- `src/app/loja/[slug]/image-with-fallback.tsx` — componente de imagem com fallback visual em caso de falha do CDN do Storage, reutilizável na página de detalhe
- `src/lib/currency/brl.ts` (`formatBRLPrice`) — já usado no card, reutilizável na mensagem/página de detalhe

### Established Patterns
- Disponibilidade agregada derivada via `EXISTS` sobre `product_sizes`, sem coluna extra em `products` (Fase 3) — o mesmo padrão de query deve informar quais tamanhos específicos estão disponíveis nesta fase
- Vitrine pública é Server Component totalmente dinâmico, sem `"use cache"` (decisão de stack já travada) — a página de detalhe do produto deve seguir o mesmo padrão para garantir estoque sempre fresco
- RLS multi-tenant já estabelecido em todas as tabelas desde a Fase 1/3 — a nova tabela `order_clicks` deve seguir o mesmo padrão de policy scoped por `owner_id` via join

### Integration Points
- Nova rota `/loja/[slug]/[produto]` (ou equivalente) precisa ser criada do zero — não existe página de detalhe de produto hoje, só o grid
- `product-card.tsx` precisa ser envolvido num `<Link>` do Next.js apontando para essa nova rota
- O número de WhatsApp normalizado do revendedor (armazenado desde a Fase 1) precisa ser lido no momento de montar o link `wa.me`

</code_context>

<specifics>
## Specific Ideas

- Exemplo concreto dado pelo usuário para justificar a foto na mensagem: "Nike Mercurial Vapor 16" não é um produto único — existe em várias cores/edições, então a mensagem de pedido precisa deixar claro visualmente qual variação exata o cliente quer, via link de foto com preview automático do WhatsApp.

</specifics>

<deferred>
## Deferred Ideas

- Dashboard/UI de métricas consumindo os dados de `order_clicks` — pertence à Fase 6 (Métricas e Dashboard), já no ROADMAP. Esta fase só cria a tabela e o registro fire-and-forget, sem interface.
- Cópia de imagem binária via Clipboard API no botão "Copiar mensagem" — considerado e descartado nesta fase por cobertura de navegador inconsistente; o link de foto no texto já resolve o problema de identificação do produto. Pode ser revisitado no futuro se usuários pedirem.

None — discussão não gerou outras ideias fora do escopo da fase.

</deferred>

---

*Phase: 5-Fluxo de Pedido no WhatsApp (CRÍTICO)*
*Context gathered: 2026-07-14*
