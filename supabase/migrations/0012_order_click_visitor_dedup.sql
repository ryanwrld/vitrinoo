-- Migration: deduplica order_clicks por visitante/dia (achado ao vivo, 2026-08-06).
--
-- PROBLEMA: `pageviews` foi deduplicada por (visitante, produto, dia) na
-- migration 0010, mas `order_clicks` ficou de fora — a tabela não tem
-- NENHUMA noção de "quem" clicou. O resultado é que as duas métricas
-- passaram a usar réguas DIFERENTES: visualização mede PESSOAS, clique mede
-- TOQUES.
--
-- Isso não é uma imprecisão pequena: o dashboard divide uma pela outra na
-- "Taxa de conversão (view -> clique)". Uma pessoa que abre um produto e
-- toca "Pedir agora" três vezes (cenário corriqueiro — o wa.me não abriu de
-- primeira, ela tentou de novo) gera 1 visualização e 3 cliques, ou seja,
-- 300% de conversão. Um número impossível no topo do painel destrói a
-- confiança do revendedor em TODOS os outros números da tela, inclusive os
-- corretos. Contamina também o ranking "Cliques no WhatsApp" e o card
-- "Tamanhos mais pedidos", ambos `count(*)` sobre esta tabela.
--
-- DECISÃO (confirmada com o usuário, opção A): mesma régua da 0010 —
-- identidade anônima persistida, janela de deduplicação por DIA CIVIL
-- brasileiro. A mesma pessoa conta 1 clique por produto por dia,
-- independentemente de quantos tamanhos tentou; se voltar amanhã, conta de
-- novo (intenção recorrente é sinal legítimo).
--
-- Consequência assumida conscientemente: quem clica no 39 e depois no 40 no
-- mesmo dia registra só o PRIMEIRO tamanho, então "Tamanhos mais pedidos"
-- passa a medir "primeiro tamanho pedido por pessoa/dia". Foi a alternativa
-- B da conversa e o usuário escolheu A — a conversão nunca passar de 100%
-- pesou mais que a granularidade por tamanho.
--
-- FORMA DA CORREÇÃO: idêntica à 0010 — a deduplicação acontece no INSERT,
-- via índice único, nunca na leitura. Como toda métrica é `count(*)` sobre
-- esta tabela, impedir a linha duplicada de nascer corrige o dashboard
-- inteiro sem tocar no código de métricas, e sem risco de uma consulta
-- futura esquecer de aplicar o `distinct`.

-- =============================================================================
-- 1. Zera o histórico incomparável
-- =============================================================================
-- As linhas existentes não têm identificador nenhum, então não há como
-- saber retroativamente quais eram a mesma pessoa. Mantê-las deixaria o
-- dashboard misturando contagem de toques (antigas) com contagem de pessoas
-- (novas) na mesma soma. Roda ANTES do ALTER TABLE também por conveniência:
-- com a tabela vazia, as colunas novas entram como NOT NULL direto, sem
-- backfill nem default falso. Mesmo raciocínio, e mesma ordem, da 0010.
--
-- Na prática esta tabela já foi esvaziada manualmente a pedido do usuário
-- antes desta migration; o delete continua aqui para a migration ser
-- auto-suficiente em qualquer ambiente (test/staging) onde isso não ocorreu.
delete from order_clicks;

-- =============================================================================
-- 2. Identidade anônima + dia civil
-- =============================================================================
-- `visitor_id`: MESMO UUID já usado por `pageviews` — gerado no navegador e
-- guardado em localStorage (ver src/lib/analytics/visitor-id.ts, módulo
-- compartilhado pelos dois trackers exatamente para garantir que o id seja o
-- mesmo nas duas tabelas). NÃO é dado pessoal: não deriva de e-mail,
-- telefone, IP nem fingerprint. Tipado como `uuid` (não `text`) de
-- propósito: o próprio Postgres rejeita lixo enviado pelo cliente.
alter table order_clicks add column visitor_id uuid not null;

-- `click_date`: data civil brasileira, gravada explicitamente em vez de
-- derivada de `created_at` no índice — pelos dois mesmos motivos da 0010:
--   (a) `created_at at time zone 'America/Sao_Paulo'` é STABLE, não
--       IMMUTABLE, então o Postgres não aceita a expressão num índice;
--   (b) `created_at::date` resolveria em UTC, cuja virada de dia cai às 21h
--       de Brasília — quem clica às 20h e às 22h seria contado duas vezes,
--       exatamente o bug que estamos corrigindo.
-- Quem calcula esta data é a Server Action (relógio do servidor, fuso fixo),
-- nunca o cliente: relógio de cliente é manipulável e desregulado.
alter table order_clicks add column click_date date not null;

-- =============================================================================
-- 3. O índice único que efetivamente deduplica
-- =============================================================================
-- Um índice só (diferente da 0010, que precisou de dois parciais): lá
-- `product_id` podia ser NULL para acesso ao grid, e NULLs são distintos
-- entre si no Postgres. Aqui `product_id` é NOT NULL desde a 0005 — não
-- existe clique em "Pedir agora" sem produto —, então o índice simples
-- cobre todos os casos.
create unique index order_clicks_dedup_idx
  on order_clicks (visitor_id, product_id, click_date);

-- NOTA sobre o comportamento esperado no app: a partir daqui, a segunda
-- tentativa de inserir o mesmo (visitante, produto, dia) FALHA com o código
-- 23505 (unique_violation). Isso não é erro — é a deduplicação funcionando,
-- e `logOrderClick` trata esse código específico como sucesso silencioso,
-- igual `logPageview` já faz.

-- =============================================================================
-- 4. RLS
-- =============================================================================
-- As policies da 0005 (`owner_read_order_clicks`, `public_insert_order_clicks`)
-- continuam válidas sem alteração: nenhuma delas referencia as colunas
-- novas, e o WITH CHECK que cruza product_id/store_id + status='published'
-- segue sendo a defesa real da superfície de escrita anônima. Colunas novas
-- em tabela com RLS já habilitada não afetam policies existentes.
