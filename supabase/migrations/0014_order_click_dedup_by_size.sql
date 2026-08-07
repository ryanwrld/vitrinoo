-- Migration: deduplicação de order_clicks passa a considerar o TAMANHO
-- (correção do desenho da 0012, mesmo dia).
--
-- PROBLEMA COM A 0012: o índice único era (visitor_id, product_id,
-- click_date), ignorando `size`. Isso resolvia a taxa de conversão (que não
-- podia mais passar de 100%), mas quebrou o card "Tamanhos mais pedidos":
-- quem clicava no 39 e depois no 40 no mesmo dia tinha o segundo clique
-- recusado, e o card passou a medir "primeiro tamanho pedido por pessoa".
--
-- Isso não é uma aproximação aceitável — é ERRADO no caso mais comum de
-- dois cliques seguidos, que é a pessoa ter tocado no tamanho errado e
-- corrigido em seguida. Nesse cenário o sistema guardava exatamente o
-- tamanho DESCARTADO e jogava fora o escolhido. Um revendedor usa esse card
-- pra decidir o que importar; alimentá-lo com o clique corrigido é pior do
-- que não ter o dado.
--
-- DECISÃO (confirmada com o usuário): deduplicar no grão FINO — por
-- (visitante, produto, TAMANHO, dia) — e resolver a conversão na LEITURA,
-- contando pessoas distintas em vez de linhas. As duas coisas ficam certas
-- ao mesmo tempo; a 0012 tratou isso como um trade-off que na verdade não
-- existia.
--
-- Continua valendo o essencial da 0012: a mesma pessoa insistindo no MESMO
-- tamanho (wa.me não abriu, tentou de novo) segue contando 1.

-- Zera o histórico pela mesma razão das 0010/0012: as linhas existentes
-- nasceram sob a regra grossa e não há como recuperar os cliques que foram
-- recusados. Misturar as duas semânticas na mesma soma é pior que começar
-- limpo — e a tabela já está vazia no ambiente principal.
delete from order_clicks;

drop index if exists order_clicks_dedup_idx;

create unique index order_clicks_dedup_idx
  on order_clicks (visitor_id, product_id, size, click_date);

comment on index order_clicks_dedup_idx is
  'Dedup no grão fino: 1 clique por (visitante, produto, tamanho, dia). O card "Tamanhos mais pedidos" conta linhas direto; a taxa de conversão conta VISITANTES DISTINTOS (ver queryTodayStats), nunca linhas — é isso que a mantém <= 100% mesmo com uma pessoa pedindo dois tamanhos.';
