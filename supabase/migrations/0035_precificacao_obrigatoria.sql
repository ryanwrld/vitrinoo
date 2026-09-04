-- Migration: a precificação da AMOSTRA passa a ser um estado do banco, não da aba.
--
-- O QUE ESTAVA ERRADO: o fluxo do pacote já era irrecusável de verdade — a condição
-- `marketplace_access and pack_imported_at is null` vive em `stores`, então ele reabria em
-- qualquer sessão, aparelho ou recarregamento. O da amostra não: ele só existia enquanto
-- o pop-up estivesse montado. Fechar a aba, sair da conta ou abrir no celular fazia o
-- lojista voltar sem nenhuma precificação pendente — e sem caminho de volta, porque o
-- sorteio só oferece "Adicionar ao meu estoque" uma vez.
--
-- Resultado prático: ele aceitava as 10 chuteiras e podia ficar sem elas, ou pior, ficar
-- com produtos sem preço definido. Decisão do dono, reafirmada: precificar é OBRIGATÓRIO,
-- não opcional.
--
-- Carimba quando o lojista ACEITA a amostra (o botão do sorteio), e é limpo quando a
-- importação conclui. Enquanto estiver preenchido, o painel reabre o fluxo em qualquer
-- lugar — mesma garantia que `pack_imported_at` já dava para o pacote.
--
-- Aceitar o teste grátis continua opcional: fechar o SORTEIO não carimba nada. O que passa
-- a ser irrecusável é o que vem depois de ele dizer sim.

alter table stores add column if not exists sample_pricing_started_at timestamptz;

comment on column stores.sample_pricing_started_at is
  'Quando o lojista aceitou a amostra sorteada e entrou na precificação. Preenchido = fluxo pendente, reabre em qualquer sessão/aparelho até concluir. Limpo pela importação. Espelha o papel de pack_imported_at no caminho do pacote.';
