-- =============================================================================
-- 0019 — Proporção da capa: o cabeçalho se adapta ao banner enviado
-- =============================================================================
--
-- O PROBLEMA
--
-- A capa era renderizada com ALTURA FIXA e largura fluida, então a proporção
-- da caixa mudava em cada tela (3:1 no celular, 7:1 num notebook, 12:1 num
-- ultrawide). Uma imagem tem UMA proporção. Elas nunca batem, e o
-- `object-cover` cortava em todo dispositivo — só mudava o eixo. Um banner
-- 1280x248 real perdia 41% da largura no celular e 27% da altura no desktop.
--
-- Nenhum valor de altura resolve isso: qualquer escolha só desloca o corte de
-- um eixo para o outro.
--
-- A SOLUÇÃO
--
-- Guardar a proporção da imagem que o revendedor enviou e a caixa adotar
-- exatamente ela. Largura limitada (coluna do conteúdo) + proporção travada =
-- corte zero, em qualquer tela e para qualquer dimensão de banner. O
-- revendedor não precisa saber de medida nenhuma: sobe a arte que tem e ela
-- aparece inteira.
--
-- POR QUE UM NUMERIC E NÃO largura/altura
--
-- Só a razão importa para o layout. Guardar os dois lados convidaria a usá-los
-- como se fossem o tamanho real do arquivo — que eles deixam de ser assim que
-- o Storage ou um CDN reprocessarem a imagem.
--
-- OS LIMITES (3:1 a 8:1) SÃO DA APLICAÇÃO, NÃO DO BANCO
--
-- Sem teto, um banner quadrado (1:1) viraria um cabeçalho de 1024px de altura
-- e empurraria o catálogo inteiro para fora da tela — a vitrine deixaria de
-- mostrar produto. O CHECK aqui é só uma rede larga contra valor absurdo
-- (zero, negativo, infinito); o enquadramento na faixa útil acontece no save,
-- onde dá para avisar o revendedor do ajuste.
-- =============================================================================

alter table stores
  add column if not exists cover_aspect_ratio numeric;

alter table stores
  drop constraint if exists stores_cover_aspect_ratio_sane;

alter table stores
  add constraint stores_cover_aspect_ratio_sane
  check (cover_aspect_ratio is null or (cover_aspect_ratio > 0.1 and cover_aspect_ratio < 50));

comment on column stores.cover_aspect_ratio is
  'Largura dividida pela altura da capa enviada (ex.: 1280x248 = 5.16). A vitrine usa este valor como aspect-ratio da caixa, o que zera o corte. Null quando nao ha capa — ai o gradiente usa a proporcao padrao. Enquadrado entre 3 e 8 no momento do save.';
