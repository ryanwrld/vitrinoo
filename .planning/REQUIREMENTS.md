# Requirements: Vitrinoo — v1.1 Dashboard de Tendência

**Defined:** 2026-07-21
**Core Value:** O cliente final consegue escolher um modelo e tamanho na vitrine e disparar uma mensagem de pedido pronta no WhatsApp do revendedor — sem fricção, sem cadastro, sem o revendedor precisar estar online.

## v1 Requirements

Continuando a numeração MTR (Fase 6 já usou MTR-01/MTR-02 nos comentários de código — acessos e Top-10 all-time).

### Dashboard — Placar do dia e atividade

- [ ] **MTR-03**: Revendedor vê visualizações de hoje, cliques em "Pedir agora" de hoje e taxa de conversão (view→clique) de hoje, sempre relativos ao dia atual (não acumulado histórico)
- [ ] **MTR-04**: Revendedor vê feed cronológico de atividade recente (views e cliques por produto) com teto de linhas visíveis e um "Ver mais" pra expandir o restante

### Dashboard — Estoque

- [ ] **MTR-05**: Revendedor vê cards "Disponíveis" e "Esgotados" no lugar do card "Total de produtos" e do card "Acessos" (métrica all-time removida)

### Dashboard — Ranking de tendência

- [ ] **MTR-06**: Revendedor vê ranking "Mais visualizados" e ranking "Cliques no WhatsApp" (top 5) comparando o período selecionado contra o período anterior de mesma duração — não a soma acumulada desde sempre. Produtos com volume de eventos insuficiente no período (sinal fraco demais pra gerar % confiável) ficam de fora do ranking em vez de aparecer com percentual enganoso
- [ ] **MTR-07**: Revendedor filtra os dois rankings por janela de 7, 15 ou 30 dias
- [ ] **MTR-08**: A ordenação do ranking pondera percentual de crescimento com volume absoluto de eventos, pra um produto de baixo volume não ultrapassar um de alto volume só por ter percentual maior
- [ ] **MTR-09**: Cada item do ranking exibe marca, linha e status de estoque (Disponível/Esgotado)
- [ ] **MTR-10**: Produto "em alta" (crescendo ou novo) e esgotado ao mesmo tempo recebe destaque visual distinto no ranking, com um atalho de ação direto pro cadastro do produto

### Dashboard — Estado vazio

- [ ] **MTR-11**: Loja sem nenhum produto cadastrado vê um estado vazio dedicado no dashboard (mensagem + CTA de cadastro), não cards e listas zerados sem contexto

## Out of Scope

Explorado no mockup navegável desta conversa e explicitamente descartado — documentado aqui pra não reabrir sem nova validação.

| Feature | Reason |
|---------|--------|
| Nudge "isso já vendeu?" baseado em cliques recentes | Heurística de "3 cliques = suspeita de venda" nunca foi validada com dado real; risco de virar ruído/interrupção forçada numa loja de alto tráfego (30-500 produtos) |
| "Avise-me quando chegar" (captura de contato + fila de envio manual) | Cria trabalho manual (enviar aviso por lead) que cresce junto com o sucesso da loja — o oposto do objetivo de "mão beijada"; demanda real nunca validada |
| "Compartilhar catálogo atualizado" (imagem/texto pra colar no grupo) | Prototipado com sucesso (geração real via Canvas), mas descartado nesta rodada em favor do ranking de tendência; candidato a milestone futuro se a dor do print manual persistir |
| Filtro de período customizado (além de 7/15/30 dias) | Não solicitado; três janelas fixas cobrem o caso de uso descrito |
| Notificação por push/e-mail com resumo do dashboard | Fora do escopo desta rodada — mencionado como gap ("e se ele nunca mais abrir o app"), mas não commitado como requisito |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MTR-03 | TBD | Pending |
| MTR-04 | TBD | Pending |
| MTR-05 | TBD | Pending |
| MTR-06 | TBD | Pending |
| MTR-07 | TBD | Pending |
| MTR-08 | TBD | Pending |
| MTR-09 | TBD | Pending |
| MTR-10 | TBD | Pending |
| MTR-11 | TBD | Pending |

**Coverage:**
- v1 requirements: 9 total
- Mapped to phases: 0 (roadmap pendente)
- Unmapped: 9 ⚠️

---
*Requirements defined: 2026-07-21*
*Last updated: 2026-07-21 after initial definition*
