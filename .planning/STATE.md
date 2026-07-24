---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Dashboard de Tendência
status: planning
last_updated: "2026-07-21T23:27:16.939Z"
last_activity: 2026-07-21
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Estado do Projeto

## Referência do Projeto

Ver: .planning/PROJECT.md (atualizado 2026-07-15)

**Valor central:** O cliente final consegue escolher um modelo e tamanho na vitrine e disparar uma mensagem de pedido pronta no WhatsApp do revendedor — sem fricção, sem cadastro, sem o revendedor precisar estar online.
**Foco atual:** Milestone v1.0 completo (6/6 fases) — pronto para `/gsd-complete-milestone`

## Posição Atual

Phase: 06 (última fase do milestone)
Plan: 4/4 completos
Status: Complete
Última atividade: 2026-07-15 — Fase 6 (Métricas e Dashboard) concluída e verificada: migration `0006_pageviews_and_metric_views.sql` aplicada em produção e teste via checkpoint humano (push bloqueado pelo gate de segurança do ambiente, retomado manualmente pelo usuário); captura de pageview (grid+produto) e dashboard com 4 stat cards + Top-10 duplo implementados; sidebar/drawer de navegação criada com 2 bugs de responsividade encontrados e corrigidos no checkpoint humano (hambúrguer mal posicionado, drawer não fechava no resize mobile→desktop); UAT final (D-02: troca de filtro não duplica pageview) aprovado pelo usuário. MTR-01/MTR-02 completos.

Progresso: [██████████] 100% (34/34 plans concluídos — Fases 1-6 completas, milestone v1.0 finalizado)

## Métricas de Desempenho

**Velocidade:**

- Total de planos concluídos: 0
- Duração média: —
- Tempo total de execução: —

**Por Fase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 03 | 6 | - | - |
| 05 | 4 | - | - |
| 06 | 4 | - | - |

**Tendência recente:**

- Últimos 5 planos: —
- Tendência: —

*Atualizado após a conclusão de cada plano*

## Contexto Acumulado

### Decisões

Decisões são registradas na tabela Key Decisions do PROJECT.md.
Decisões recentes que afetam o trabalho atual:

- [Init]: Stack Next.js 16 + Supabase + Vercel (pesquisa recomenda Vercel Pro; usuário optou por Hobby no MVP — risco aceito)
- [Init]: Multi-tenancy de schema compartilhado com isolamento por RLS
- [Init]: Sem OAuth/cobrança no MVP; email/senha e Free para todos

### Todos Pendentes

Nenhum ainda.

### Bloqueadores/Preocupações

- [Fase 5] Compatibilidade do `wa.me` com navegadores in-app (Instagram/WhatsApp) tem confiança BAIXA — validar em dispositivos reais durante a fase.
- [Fase 2] Normalização de telefone é focada no BR (55DDXXXXXXXXX) — deve estar travada e testada antes da Fase 5 consumi-la. (Já implementada e testada na Fase 1 — `normalizeWhatsAppBR`.)
- [Fase 1 — deferido] M-3 (AUTH-05, reset de senha por email real) ficou bloqueado no UAT: depende de configurar o template de email "Reset Password" no Supabase Dashboard (usar `{{ .TokenHash }}`) e de SMTP customizado no tier free (ver memória `project_supabase_free_tier_email_template`). Código está implementado e testado via integração — só falta a configuração manual + validação end-to-end com email real.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260715-du7 | Rebrand de cores: paleta verde → azul (Vivid Royal #0D21A1, Alice Blue #E7F2FD, preto #000000) em src/ e UI-SPECs | 2026-07-15 | 03e664e | [260715-du7-rebrand-de-cores-substituir-a-paleta-ver](./quick/260715-du7-rebrand-de-cores-substituir-a-paleta-ver/) |
| 260715-odl | Criar README.md de apresentação do projeto para o GitHub | 2026-07-15 | a74432b | [260715-odl-criar-readme-md-de-apresenta-o-do-projet](./quick/260715-odl-criar-readme-md-de-apresenta-o-do-projet/) |
| 260716-fl8 | Aplicar novo design system visual ao Vitrinoo (tokens, cores, tipografia, espaçamento, raio, sombra, motion) a partir do pacote em `# Vitrinoo Design System/` — migração puramente de estilo | 2026-07-16 | ef39414 | [260716-fl8-aplicar-novo-design-system-visual-ao-vit](./quick/260716-fl8-aplicar-novo-design-system-visual-ao-vit/) |

## Itens Adiados

Itens reconhecidos e carregados do fechamento do milestone anterior:

| Categoria | Item | Status | Adiado em |
|-----------|------|--------|-----------|
| *(nenhum)* | | | |

## Continuidade de Sessão

Última sessão: 2026-07-15
Parou em: Milestone v1.0 completo (6/6 fases) — pronto para /gsd-complete-milestone
Arquivo de retomada: Nenhum

## Session

**Last session:** 2026-07-15
**Stopped at:** Milestone v1.0 completo (6/6 fases) — pronto para /gsd-complete-milestone
**Resume file:** Nenhum

## Accumulated Context

### Roadmap Evolution

- Phase 1 edited: Escopo expandido: onboarding pós-cadastro absorve identidade da loja e WhatsApp (LOJA-01, WPP-01, WPP-02); novo requisito AUTH-05 (recuperação de senha)
- Phase 2 edited: Escopo reduzido: agora só link compartilhável (LOJA-02, LOJA-03, LOJA-04); identidade da loja e WhatsApp migraram para a Fase 1
- Phase 05.1 edited: edited fields: title, goal, requirements, success_criteria, ui_hint
- Phase 05.1 inserted after Phase 5: Rebrand de Identidade Visual — nova paleta de cores aplicada em todo o app antes da Fase 06 (URGENT)

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 02 P01 | 8min | 2 tasks | 2 files |
| Phase 02 P02 | 7min | 3 tasks | 8 files |
| Phase 02 P03 | 50min | 3 tasks | 6 files |
| Phase 02 P04 | 20min | 2 tasks | 4 files |
| Phase 02 P05 | 12min | 2 tasks | 1 files |
| Phase 02 P06 | 15min | 2 tasks | 5 files |
| Phase 03 P01 | 25min | 3 tasks | 4 files |
| Phase 03 P02 | 47min | 3 tasks | 10 files |
| Phase 03 P03 | 12min | 2 tasks | 6 files |
| Phase 03 P04 | 50min | 3 tasks | 6 files |
| Phase 03 P05 | 15min | 3 tasks | 6 files |
| Phase 03 P06 | 57min | 4 tasks | 6 files |
| Phase 04 P01 | 9min | 3 tasks | 4 files |
| Phase 04 P02 | 4min | 3 tasks | 7 files |
| Phase 04 P05 | 5min | 3 tasks | 10 files |
| Phase 04 P03 | 8min | 3 tasks | 4 files |
| Phase 04 P04 | 5min | 3 tasks | 5 files |
| Phase 04 P06 | 3min | 2 tasks | 3 files |

## Decisions

- [Phase 2]: lucide-react aprovado no gate de legitimidade (T-02-SC) — repositório github.com/lucide-icons/lucide confirmado, sem postinstall
- [Phase 02]: generateStoreSlug refatorado para delegar ao slugify() compartilhado — elimina o segundo algoritmo de slug que 02-CONTEXT.md proibia
- [Phase 02]: RPC is_slug_available (SECURITY DEFINER, boolean-only, search_path fixado) aplicada no projeto remoto — padrão para futuras checagens cross-tenant sob RLS restritiva
- [Phase 02]: settings-form.tsx escrito do zero (D-07) reusando onboardingSchema, sem importar onboarding-wizard.tsx — inclui o campo de logo (já suportado por saveStoreSettings) além de nome/cor/tagline/WhatsApp
- [Phase 02]: status checking/idle do slug-editor derivado no render (needsCheck + useTransition isPending) em vez de setState síncrono no useEffect, para conformidade com react-hooks/set-state-in-effect
- [Phase 02]: readyUrl derivado no render (comparado com publicUrl) em vez de setState síncrono no efeito do QrCodePanel — mesma correção de react-hooks/set-state-in-effect aplicada proativamente
- [Phase 02]: Plan 02-06 fechado formalmente por sessão de closeout (implementação foi feita fora do fluxo normal de orquestração) — todos os acceptance_criteria e artifacts reverificados, sem defeitos encontrados; único ajuste foi sincronizar REQUIREMENTS.md (LOJA-03/LOJA-04 Pendente para Completo)
- [Phase 03 P01]: brand/sole/category/fulfillment ficam text nullable sem check constraint de enumeração — validação de listas fixas só na camada de aplicação (Zod + constants.ts no Plan 03-02), evitando migration de correção se a lista mudar
- [Phase 03 P01]: atalho "esgotar produto inteiro" (D-04) implementado como UPDATE em lote de product_sizes, sem coluna extra de disponibilidade agregada em products — a Fase 4 deriva disponibilidade via EXISTS
- [Phase 03 P01]: PROD-01/PROD-02 NÃO marcados como Completo em REQUIREMENTS.md ainda — 03-01 entrega só a fundação de schema/RLS; 03-02-PLAN.md lista os mesmos IDs como requisito porque é lá que a UI de cadastro (o comportamento visível ao usuário) é entregue. Marcar como Completo será feito ao fechar 03-02.
- [Phase 03 P02]: BRANDS removeu Under Armour e Umbro (pedido do usuário — fora do ICP)
- [Phase 03 P02]: getOwnedStore() duplicado em products/actions.ts (mesma convenção de settings/actions.ts)
- [Phase 03 P03]: productSchema.sizes usa `.optional()` em vez de `.default([])` — `.default()` quebra a compatibilidade de tipos entre zodResolver (zod 4.4.3 + @hookform/resolvers 5.4.0) e useForm<ProductInput>; fallback `?? []` aplicado explicitamente no client e no servidor
- [Phase 03 P03]: atalho "Marcar tudo como esgotado" no size-grid.tsx diferencia modo criação (só form state, via `replace`) de modo edição (chama markProductEsgotado + toast) via prop opcional `productId` em ProductForm — preparação para o Plan 03-05
- [Phase 03 P04]: uploadAndInsertPhotos compartilhado entre saveProduct (criação) e addProductPhotos (edição) — nunca duas implementações do pipeline de validação/recontagem
- [Phase 03 P04]: updatePhotoOrder em duas fases (offset negativo temporário → posição final) para nunca violar UNIQUE(product_id, position) ao reordenar
- [Phase 03 P04]: PhotoUploader com dois modos no mesmo componente (criação: File[] pendente via onPendingFilesChange; edição: Server Actions chamadas imediatamente) — preparação para o Plan 03-05
- [Phase 03 P04, pós-checkpoint]: handleFilesSelected copia FileList para array antes de limpar input.value (bug em Edge/Chromium); crypto.randomUUID() trocado por localSlotId() com fallback não-criptográfico (exige contexto seguro, falhava via IP local em HTTP) — commit f8be197, aplicado pelo orquestrador durante a pausa do checkpoint humano
- [Phase 03 P04, pós-checkpoint]: next.config.ts ganhou allowedDevOrigins para permitir acesso ao dev server via IP de rede local (necessário para o próprio checkpoint mobile) — commit d5bbe75
- [Phase 03 P04, pós-checkpoint]: photo-uploader.tsx — notificação de fotos pendentes movida para useEffect (evita setState do pai durante render do filho) e handleDragEnd computa reorder fora do updater de setSlots (evita duplicar persistência sob Strict Mode); botões de drag/remover encolhidos mantendo 44x44px de área de toque — commit cddd237
- [Phase 03 P05]: parseProductFormData extraído de saveProduct para reuso em updateProduct — nunca duas implementações divergentes da mesma validação
- [Phase 03 P05]: product_sizes reescrito via delete+insert em updateProduct (não diff parcial), aceitável dado o tamanho pequeno do conjunto (max 10 linhas)
- [Phase 03 P05]: publishProduct/unpublishProduct sem gate de completude e sem diálogo de confirmação — toggle manual reversível (D-10, T-03-12)
- [Phase 03 P06]: queryProducts com duas queries separadas (products filtrado/ordenado + product_sizes/product_photos via .in(productIds)) + join em memória, em vez de embed único do Supabase — consistente com o precedente já estabelecido em /produtos/[id]/editar/page.tsx
- [Phase 03 P06]: ProductToolbar nunca mantém estado de filtro próprio — cada mudança reconstrói a URL via router.push a partir de currentParams (prop derivada do searchParams real), URL sempre como única fonte de verdade
- [Phase 03 P06, pós-checkpoint]: experimental.serverActions.bodySizeLimit ampliado para 10mb em next.config.ts — limite padrão de 1MB do Next quebrava saveProduct/updateProduct ao somar poucas fotos comprimidas (~1MB cada); commit 81cf8b5, aplicado pelo orquestrador durante a pausa do checkpoint humano
- [Phase 03]: Fase 3 (CRUD de Produtos e Pipeline de Mídia) completa — checkpoint humano final aprovado pelo usuário em dispositivo móvel real (caso de teste Nike/Mercurial/FG: cadastro+fotos+tamanhos, publicar/despublicar, buscar/filtrar/ordenar, editar, excluir, dois empty states)
- [Phase 04 P01]: RLS pública (to anon, for select, restrita a status='published') aditiva às policies owner_full_access_* existentes — nunca substitui; store_settings deliberadamente excluída (WhatsApp fica privado até a Fase 5 decidir como expô-lo)
- [Phase 04 P01/P05/P06]: hide_when_sold_out (products) nullable sem default — null distingue "sem exceção configurada" de "configurado como false", necessário para D-11 (reset em lote ao mudar o padrão global da loja)
- [Phase 04 P02]: queryPublicProducts espelha queryProducts do admin (duas queries + join em memória) mas status é sempre fixo 'published' no código, nunca aceito via params
- [Phase 04 P03]: Filtros de marca/solado/modalidade da vitrine pública são multi-select via .in() (nunca .eq()) — diferença deliberada do admin (single-select), decisão D-02
- [Phase 04 P04]: fetchNextPage vive em src/lib/products/public-actions.ts, arquivo novo e separado de src/lib/products/actions.ts (owner-scoped) — decisão do executor por separação de responsabilidades de segurança, divergindo da sugestão original do pattern map
- [Phase 04 P06]: Regra de visibilidade de esgotado (D-09/D-10/D-11) resolvida inteiramente dentro de queryPublicProducts, nunca replicada em componentes de UI — filtro roda pós-paginação (trade-off assumido: uma página pode ter menos que 20 itens visíveis quando parte do lote é oculta, mas hasMore permanece correto)
- [Phase 04]: Fase 4 (Vitrine Pública e Filtragem) completa — 6 plans executados sequencialmente (worktrees degradadas para modo sequencial por fork-ref desconhecido, #683), todos os testes automatizados verdes (22/22 na sweep final de coerência), typecheck limpo exceto o erro pré-existente já documentado em server-cookies.test.ts
- [Phase 05.1]: Rebrand de paleta verde→azul (Vivid Royal #0D21A1, Alice Blue #E7F2FD, preto #000000) executado como quick task (não como fase própria) — find-and-replace mecânico em 27 arquivos `.tsx` + 4 UI-SPECs + PROJECT.md, sem token centralizado (Tailwind v4 CSS-first, sem `@theme` de marca definido)
- [Phase 06 P01]: `pageviews` (product_id nullable, NULL=acesso ao grid/preenchido=produto) espelha a RLS de `order_clicks` (Fase 5): anon insert-only, dono lê só a própria loja; duas views agregadas Top-N (`product_pageview_counts`, `product_order_click_counts`) com `security_invoker = true` obrigatório — primeiras views do projeto, regra nova análoga ao RLS obrigatório em tabelas
- [Phase 06 P01, checkpoint]: push da migration 0006 ao Supabase remoto bloqueado pelo gate de segurança do ambiente de execução (schema push é operação sensível, plano já previa `autonomous: false`); usuário aplicou manualmente nos dois projetos (teste `jnlptpdzpajyqmtprfgn` + produção `yuyprdjzeslanxbgcemj`), confirmado via `supabase migration list` (0001-0006 em paridade)
- [Phase 06 P02]: `PageviewTracker` depende só de `usePathname()` (nunca `useSearchParams()`) e fica montado em `layout.tsx` (que nunca recebe `searchParams`, diferente de `page.tsx`) — garante que trocar filtro/busca na vitrine não duplica pageview (D-02), confirmado em UAT humano
- [Phase 06 P04, checkpoint]: sidebar/drawer de navegação (`AdminSidebar`) teve 2 bugs de responsividade encontrados no checkpoint humano e corrigidos: hambúrguer preso numa flex row `min-h-dvh` esticava verticalmente (corrigido com barra de topo dedicada `md:hidden` + layout `flex-col`/`md:flex-row`); `<dialog>` do drawer não fechava ao redimensionar de mobile→desktop (corrigido com `useEffect` + `matchMedia('(min-width: 768px)')`)
- [Phase 06]: Fase 6 (Métricas e Dashboard) completa — última fase do milestone v1.0. 4 plans, 2 checkpoints humanos (push de schema + verificação de UI), 1 item de UAT pós-verificação (D-02) aprovado. Gate de regressão pós-merge não encontrou quebras atribuíveis à fase (15 falhas pré-existentes de rate-limit/credencial do Supabase Auth, confirmadas já quebradas antes da fase começar)

### Blockers

- [Fase 3, herdado, mitigação disponível 2026-07-14] Suíte completa npm test não fica verde por rate-limit de signup do Supabase Auth — código já suporta seed via admin.createUser (service_role) para contornar o rate limit (ver tests/setup/supabase-test.ts e deferred-items.md do Plan 03-04/03-06), mas requer o usuário configurar `SUPABASE_SERVICE_ROLE_KEY` em `.env.local` (não commitável) para o benefício surtir efeito.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-21 — Milestone v1.1 started

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
