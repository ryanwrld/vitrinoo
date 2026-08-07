-- Migration: uma loja por dono, garantido pelo banco (incidente de 2026-08-07).
--
-- INCIDENTE: um revendedor ficou permanentemente preso no onboarding — toda
-- URL do painel redirecionava para /admin/onboarding — e a conta dele
-- acumulou 8 lojas, 6 delas criadas num intervalo de 90 segundos.
--
-- CAUSA: `stores.owner_id` não tinha restrição de unicidade, embora TODO o
-- código assuma uma loja por dono (`.single()` em `ensureStoreForUser`,
-- `requireCompletedOnboarding`, `getOwnedStore`, dashboard, produtos…).
-- Bastava uma corrida na criação (duas requisições concorrentes checando
-- "já existe loja?" antes de qualquer uma inserir) para nascer a segunda
-- linha. A partir daí o sistema entrava num ciclo que se realimentava:
--
--   1. `.single()` falha com 2+ linhas e devolve data=null (o mesmo
--      resultado de "não existe loja"), com o erro sendo descartado
--   2. o guard conclui "sem loja" e redireciona para /admin/onboarding
--   3. o onboarding chama `ensureStoreForUser`, que também usa `.single()`,
--      também recebe null, e CRIA MAIS UMA LOJA
--   4. volta ao passo 1, agora com uma loja a mais
--
-- Cada recarregamento de página criava uma loja nova, e a loja real (com os
-- produtos) ficava inalcançável.
--
-- CORREÇÃO EM DUAS CAMADAS: esta migration torna o estado inválido
-- IMPOSSÍVEL no banco (a corrida passa a falhar com 23505 em vez de gerar
-- duplicata, e `ensureStoreForUser` já sabe tratar esse código); em
-- paralelo, o código troca `.single()` por leitura tolerante para nunca
-- mais confundir "várias" com "nenhuma".
--
-- Pré-requisito de dados: as duplicatas VAZIAS já foram removidas
-- manualmente (mantida, por dono, a loja com produtos). Se este arquivo
-- rodar num ambiente que ainda tenha duplicatas, o índice falha ao ser
-- criado — o que é o comportamento correto: melhor a migration parar do que
-- escolher sozinha qual loja de um usuário real sobrevive.
create unique index stores_owner_id_unique_idx on stores (owner_id);

comment on index stores_owner_id_unique_idx is
  'Uma loja por dono. Sem isto, uma corrida na criação gerava duplicatas e o .single() do app passava a devolver null para sempre, prendendo o usuário no onboarding e criando uma loja nova a cada visita.';
