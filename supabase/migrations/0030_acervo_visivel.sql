-- Migration: o lojista sem pacote passa a VER o acervo inteiro.
--
-- POR QUE: até aqui, quem não tinha `marketplace_access` enxergava só os ~100
-- itens marcados `preview`. A intenção do dono do produto é o oposto — ele quer
-- que o lojista veja as 990 e sinta o tamanho do que está deixando na mesa. Um
-- acervo escondido não vende o acervo.
--
-- Também conserta uma contradição que a tela já exibia: o card do álbum anuncia
-- "468 chuteiras" (contagem vinda de `marketplace_album_products`, que nunca foi
-- filtrada por RLS) e, ao abrir, apareciam 100.
--
-- ISTO SÓ É SEGURO POR CAUSA DA 0029. Antes dela, "ver" e "poder importar" eram a
-- mesma coisa: a RLS era o que impedia uma loja sem acesso de levar o catálogo
-- inteiro. Agora a autorização de importar mora na amostra sorteada
-- (`marketplace_sample_draws`) e no trigger `enforce_marketplace_import_quota`,
-- então dá para abrir a leitura sem abrir a porta.
--
-- Aplicar esta migration SEM a 0029 no mesmo banco libera o acervo inteiro de
-- graça. Elas não são independentes.

-- =============================================================================
-- Leitura: qualquer revendedor autenticado vê todo o catálogo publicado
-- =============================================================================
-- A condição `preview or exists (... marketplace_access)` sai das duas policies.
-- O que sobra é `status = 'published'`, que continua escondendo rascunho e
-- arquivado de quem não é admin.
drop policy if exists "read_marketplace_products" on marketplace_products;
create policy "read_marketplace_products" on marketplace_products
  for select
  to authenticated
  using (status = 'published');

-- A condição do produto pai continua REPETIDA aqui, e não delegada a um
-- `in (select ...)` que dependesse da RLS do pai se aplicar dentro da subquery —
-- mesmo padrão das policies 0003, 0005 e 0025.
drop policy if exists "read_marketplace_photos" on marketplace_photos;
create policy "read_marketplace_photos" on marketplace_photos
  for select
  to authenticated
  using (
    marketplace_product_id in (
      select id from marketplace_products where status = 'published'
    )
  );

-- `admin_manage_marketplace_products` e `admin_manage_marketplace_photos` ficam
-- como estão: policies permissivas são OR-eadas, e são elas que dão ao admin o
-- acesso a `draft`/`archived` para curadoria.

-- =============================================================================
-- Duas notas que precisam sobreviver a esta migration
-- =============================================================================
--
-- 1. A COLUNA `preview` NÃO VIROU LIXO.
--    Ela deixou de controlar visibilidade, mas ganhou um papel único e mais
--    importante: é o POOL DE ONDE O SORTEIO TIRA AS 10
--    (`sortear_amostra_da_loja`, migration 0029). Removê-la — ou parar de
--    mantê-la pela tela de curadoria — quebra a amostra gratuita em silêncio, e
--    o sintoma vai aparecer longe daqui.
--
-- 2. A CADEIA DE AUTORIZAÇÃO MUDOU DE DONO.
--    O cabeçalho da 0028 diz que `importar_marketplace_em_lote` é
--    `security invoker` justamente para "a RLS continuar valendo: uma loja sem
--    acesso ao pack só enxerga os 100 do preview". Isso deixou de ser verdade
--    com esta migration. Quem barra agora, em três camadas:
--
--      a) o filtro contra `marketplace_sample_draws` dentro da própria função
--         `importar_marketplace_em_lote` (0029);
--      b) o mesmo filtro em `importarDoMarketplace`
--         (src/lib/marketplace/import-actions.ts) — para dar mensagem decente;
--      c) o trigger `enforce_marketplace_import_quota`, o único inescapável,
--         porque a chave `authenticated` é pública e um POST direto na REST não
--         passa por (a) nem por (b).
--
--    Ao mexer em qualquer uma delas, a pergunta a fazer é: "um POST direto em
--    /rest/v1/marketplace_imports com um id fora da amostra ainda é recusado?"
