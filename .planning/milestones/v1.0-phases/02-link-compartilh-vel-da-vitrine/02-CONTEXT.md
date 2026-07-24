# Phase 2: Link Compartilhável da Vitrine - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

O revendedor consegue personalizar o slug da vitrine (com validação de unicidade em tempo real), gerar e baixar o QR Code do link, copiar o link com um clique, e revisitar/editar as configurações de loja (nome, logo, cor, frase) e WhatsApp (número, template de mensagem) que foram coletadas no onboarding da Fase 1 — tudo numa nova tela de configurações do painel.

Escopo fixo (LOJA-02, LOJA-03, LOJA-04, mais a edição pós-onboarding de LOJA-01/WPP-01/WPP-02 já coberta pela Fase 1). Não inclui: CRUD de produtos (Fase 3), vitrine pública (Fase 4).

</domain>

<decisions>
## Implementation Decisions

### Troca de Slug
- **D-01:** Slugify automático — o que o revendedor digita é convertido automaticamente (minúsculas, sem acento, espaços viram hífens), reduzindo erro de digitação de um público não-técnico.
- **D-02:** Limite de 3–30 caracteres no slug.
- **D-03:** Validação de unicidade dispara enquanto o revendedor digita, com debounce (~400ms) — feedback "disponível"/"já em uso" antes mesmo de salvar.
- **D-04:** Trocar o slug **quebra o link antigo sem redirect** (404) — decisão consciente de simplicidade para o MVP, sem tabela de histórico de slugs. Por isso o salvamento do slug precisa de confirmação explícita (ver D-06).

### Tela de Configurações
- **D-05:** Nova rota dedicada `/configuracoes` no painel admin, separada do Dashboard — mantém o Dashboard focado em métricas (Fase 6).
- **D-06:** Página única com seções (Loja, WhatsApp, Link/QR) em vez de abas — menos navegação para um usuário não-técnico.
- **D-07:** Formulário **novo, escrito do zero** para esta tela — não reaproveitar `onboarding-wizard.tsx` (Fase 1) como componente. A lógica de validação/normalização (Zod schemas, `normalizeWhatsAppBR`) pode e deve ser reaproveitada; o componente de formulário/wizard em si, não.
- **D-08:** A troca de slug tem **botão "Salvar" e confirmação próprios**, separados do restante do formulário (loja/WhatsApp) — evita que o revendedor quebre o link compartilhado sem querer ao salvar uma alteração não relacionada (ex: só mudar a cor). Diálogo de confirmação deve avisar explicitamente: "Isso vai quebrar links já compartilhados."

### QR Code
- **D-09:** Formato de download: PNG (biblioteca `qrcode`, já escolhida na pesquisa de stack).
- **D-10:** QR Code simples, sem logo da loja no centro — mais confiável de escanear; incluir logo exigiria nível de correção de erro alto (H) e composição de imagem extra, risco desnecessário para o MVP.
- **D-11:** Preview do QR renderizado na tela assim que a página carrega, com botão "Baixar PNG" ao lado — revendedor confirma visualmente antes de baixar/imprimir.

### Copiar Link
- **D-12:** Feedback de cópia via toast "Link copiado!" — consistente com o padrão de feedback (`sonner`) já estabelecido no projeto desde a Fase 1.
- **D-13:** O link completo da vitrine aparece visível como texto na tela (campo readonly, ex: `vitrinoo.app/loja/nome-da-loja`) ao lado do botão "Copiar" — revendedor consegue ler/conferir antes de compartilhar. Mesmo bloco visual do QR Code.

### Claude's Discretion
- Geração do QR Code client-side vs. via Route Handler no servidor — decisão técnica, não de UX; ambas atendidas pela lib `qrcode`.
- Exato texto de erro de validação do slug (caracteres inválidos, já em uso, etc.) fica a critério da implementação.
- Mecanismo técnico de debounce (hook customizado vs. lib) é decisão de implementação.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contexto do Projeto
- `.planning/PROJECT.md` — Contexto geral, identidade visual, catálogo de bugs conhecidos (item 3: "Slug duplicado sem validação em tempo real")
- `.planning/REQUIREMENTS.md` §Loja — LOJA-01 a LOJA-04
- `.planning/ROADMAP.md` §Phase 2 — Goal, Success Criteria, Requirements

### Fase 1 (dependência direta)
- `.planning/phases/01-funda-o-conta-e-isolamento-multi-tenant/01-CONTEXT.md` — D-04/D-05: onboarding já coleta loja+WhatsApp; slug gerado automaticamente no cadastro, customização adiada para esta fase
- `src/lib/auth/actions.ts` — `generateStoreSlug` (geração automática do slug a partir do email no cadastro — a lógica de slugify desta fase deve ser consistente com essa)
- `src/lib/onboarding/actions.ts` — `saveOnboarding`, padrão de validação server-side + normalização de telefone (`normalizeWhatsAppBR`) a reaproveitar
- `src/lib/validation/onboarding.ts` — schema Zod existente para nome/cor/frase/whatsapp/template, reaproveitável nesta tela
- `supabase/migrations/0001_init_stores_rls.sql` — `stores.slug` já é `UNIQUE` no banco; nenhuma migration de schema nova esperada para slug

### Pesquisa de Stack
- `.planning/research/STACK.md` — biblioteca `qrcode` (1.5.4) já recomendada para geração de QR Code client-side ou via Route Handler

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `normalizeWhatsAppBR` (`src/lib/phone/normalize-br.ts`) — normalização de telefone, mesma função usada no onboarding
- Schemas Zod de `src/lib/validation/onboarding.ts` — lógica de validação de loja/WhatsApp reaproveitável na tela de configurações (mesmo que o componente de form seja novo, D-07)
- Padrão de toast (`sonner`) já usado em login/onboarding para feedback de ações

### Established Patterns
- Server Actions com `"use server"` + Supabase client via `createClient()` (`src/lib/supabase/server.ts`) — mesmo padrão usado em `saveOnboarding`, deve ser seguido para a nova action de atualizar slug/loja/whatsapp
- Toda escrita em `stores`/`store_settings` filtra por `owner_id`/`store_id` do usuário autenticado (RLS já garante isolamento, mas a query também busca por dono explicitamente, como em `saveOnboarding`)

### Integration Points
- Nova rota `/configuracoes` entra no route group `(admin)` (mesmo grupo de `/dashboard`, `/onboarding`) — precisa do mesmo guard de auth (`requireCompletedOnboarding` ou equivalente) usado nas outras páginas do painel
- `generateStoreSlug` em `src/lib/auth/actions.ts` deve ser extraída/reaproveitada (ou ter sua lógica de normalização espelhada) para a validação de slug nesta fase, evitando dois algoritmos de slugify divergentes no projeto

</code_context>

<specifics>
## Specific Ideas

- A confirmação de troca de slug deve deixar claro, em linguagem simples (não-técnica), que o link antigo vai parar de funcionar — o revendedor-alvo deste produto não é técnico e pode não entender "404" ou "link quebrado" sem explicação direta.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Link Compartilhável da Vitrine*
*Context gathered: 2026-07-12*
