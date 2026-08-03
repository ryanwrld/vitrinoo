-- Migration: deduplica pageviews por visitante/dia (achado ao vivo, 2026-08-03).
--
-- PROBLEMA: `pageviews` não tinha NENHUMA noção de "quem" acessou — cada
-- carregamento de página gravava uma linha nova e anônima. Consequência: a
-- mesma pessoa atualizando a página, ou navegando grid -> produto -> voltar
-- -> produto (navegação absolutamente normal de quem está olhando uma
-- vitrine), inflava a contagem como se fossem várias pessoas diferentes.
-- Isso contamina TODAS as métricas de view do dashboard de uma vez, já que
-- todas são `count(*)` sobre esta tabela: "Visualizações hoje", a taxa de
-- conversão (view -> clique), o ranking "Mais visualizados" e o sparkline.
--
-- DECISÃO (confirmada com o usuário): identidade anônima persistida, janela
-- de deduplicação por DIA CIVIL. A mesma pessoa conta 1 por produto por dia;
-- se voltar amanhã, conta de novo (visitante recorrente é sinal legítimo).
--
-- FORMA DA CORREÇÃO: a deduplicação acontece no INSERT, via índice único —
-- não na leitura. Isso é deliberado: como toda métrica é `count(*)` sobre
-- esta tabela, impedir a linha duplicada de nascer corrige o dashboard
-- inteiro sem tocar em uma linha sequer do código de métricas, e sem risco
-- de alguma consulta futura esquecer de aplicar o `distinct`.

-- =============================================================================
-- 1. Zera o histórico contaminado
-- =============================================================================
-- Pedido explícito do usuário: os números já gravados nasceram inflados por
-- este bug e não há como saber, retroativamente, quais linhas eram a mesma
-- pessoa (não existe identificador nenhum nelas). Preservá-los deixaria o
-- dashboard misturando dados confiáveis com dados sabidamente errados.
-- Roda ANTES do ALTER TABLE também por conveniência: com a tabela vazia, as
-- colunas novas entram como NOT NULL direto, sem backfill nem default falso.
delete from pageviews;

-- =============================================================================
-- 2. Identidade anônima + dia civil
-- =============================================================================
-- `visitor_id`: UUID aleatório gerado no navegador do visitante e guardado
-- localmente. NÃO é dado pessoal — não deriva de e-mail, telefone, IP nem
-- fingerprint; é um número sorteado que só serve pra dizer "estas duas
-- visitas vieram do mesmo navegador". Tipado como `uuid` (não `text`) de
-- propósito: o próprio Postgres rejeita lixo enviado pelo cliente.
alter table pageviews add column visitor_id uuid not null;

-- `view_date`: a data civil brasileira da visita, gravada explicitamente em
-- vez de derivada de `created_at` no índice. Dois motivos:
--   (a) `created_at at time zone 'America/Sao_Paulo'` é STABLE, não
--       IMMUTABLE, então o Postgres não aceita a expressão num índice;
--   (b) `created_at::date` resolveria em UTC, e a virada de dia em UTC cai
--       às 21h de Brasília — uma pessoa vendo o mesmo produto às 20h e às
--       22h seria contada duas vezes, exatamente o bug que estamos
--       corrigindo. Quem calcula esta data é a Server Action (relógio do
--       servidor, fuso fixo America/Sao_Paulo), nunca o cliente: relógio de
--       cliente é manipulável e desregulado.
alter table pageviews add column view_date date not null;

-- =============================================================================
-- 3. Os índices únicos que efetivamente deduplicam
-- =============================================================================
-- São DOIS índices parciais em vez de um único índice com
-- `nulls not distinct` porque `product_id` é NULL para acesso ao grid
-- (D-01 da 0006) e, no Postgres, NULLs são distintos entre si por padrão —
-- um índice ingênuo em (visitor_id, product_id, view_date) deduplicaria as
-- visualizações de produto mas deixaria o grid passar duplicado. A variante
-- `nulls not distinct` existe (PG 15+) mas amarraria a migration a uma
-- versão mínima do Postgres sem necessidade; dois índices parciais fazem o
-- mesmo trabalho e funcionam em qualquer versão.
create unique index pageviews_dedup_product_idx
  on pageviews (visitor_id, product_id, view_date)
  where product_id is not null;

create unique index pageviews_dedup_grid_idx
  on pageviews (visitor_id, view_date)
  where product_id is null;

-- NOTA sobre o comportamento esperado no app: a partir daqui, a segunda
-- tentativa de inserir a mesma (visitante, produto, dia) FALHA com o código
-- 23505 (unique_violation). Isso não é erro — é a deduplicação funcionando,
-- e `logPageview` trata esse código específico como sucesso silencioso.

-- =============================================================================
-- 4. RLS
-- =============================================================================
-- Nenhuma policy muda. As colunas novas não afetam o WITH CHECK existente
-- (0006, ampliado para `public` na 0009), que continua exigindo loja/produto
-- publicado. Vale registrar o limite conhecido: `visitor_id` vem do cliente
-- e portanto é forjável — alguém determinado pode mandar UUIDs aleatórios e
-- inflar a contagem. Não é regressão (hoje basta atualizar a página pra
-- conseguir o mesmo efeito) e o custo de resolver de verdade (assinar o id
-- no servidor) não se justifica pra métrica de vaidade de um MVP.
