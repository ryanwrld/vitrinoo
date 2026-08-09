-- =============================================================================
-- 0020 — Enquadramento da capa controlado pelo revendedor
-- =============================================================================
--
-- POR QUE
--
-- A capa é exibida numa faixa que ocupa a largura inteira da tela, e a arte
-- que o revendedor envia quase nunca tem exatamente essa proporção. Alguém
-- precisa decidir o que fica de fora — e até aqui era o código, com números
-- fixos escolhidos por quem não viu a arte. Resultado: a cabeça do jogador
-- cortada no banner de campanha do primeiro usuário.
--
-- Estas quatro colunas transferem a decisão para quem fez a arte:
--
--   cover_band_ratio  a ALTURA da faixa, expressa como proporção
--   cover_zoom        aproximação da arte dentro da faixa
--   cover_pos_x/y     que parte da arte fica visível (o arrasto)
--
-- POR QUE PROPORÇÃO E PERCENTUAL, NUNCA PIXELS
--
-- A largura da faixa é a largura da tela, e ela muda em cada aparelho. Um
-- enquadramento salvo em pixels só valeria no monitor de quem salvou; no
-- celular do cliente ele apontaria para outro pedaço da imagem. Proporção e
-- percentual são independentes de resolução: o mesmo valor produz o mesmo
-- enquadramento em qualquer tela, e a vitrine renderiza tudo em CSS puro,
-- sem precisar de JavaScript para recalcular nada.
--
-- OS DEFAULTS REPRODUZEM O COMPORTAMENTO ATUAL
--
-- 5 / 1 / 50 / 50 é exatamente a faixa 5:1 centralizada e sem zoom que já
-- estava no ar. Nenhuma loja existente muda de aparência com esta migration —
-- elas só ganham a possibilidade de ajustar.
--
-- LIMITES
--
-- Os CHECKs são redes largas contra valor absurdo (negativo, zero, infinito).
-- A faixa útil de verdade é aplicada no save, onde dá para mostrar o
-- resultado antes de gravar. Sem o teto de zoom, por exemplo, dava para
-- ampliar a arte até virar quatro pixels na tela do cliente.
-- =============================================================================

alter table stores
  add column if not exists cover_band_ratio numeric not null default 5,
  add column if not exists cover_zoom numeric not null default 1,
  add column if not exists cover_pos_x numeric not null default 50,
  add column if not exists cover_pos_y numeric not null default 50;

alter table stores drop constraint if exists stores_cover_frame_sane;
alter table stores
  add constraint stores_cover_frame_sane
  check (
    cover_band_ratio between 1.5 and 12
    and cover_zoom between 1 and 4
    and cover_pos_x between 0 and 100
    and cover_pos_y between 0 and 100
  );

comment on column stores.cover_band_ratio is
  'Altura da faixa da capa, como proporcao largura:altura (5 = faixa 5:1). Menor = faixa mais alta. Controlado pelo revendedor no editor de capa.';
comment on column stores.cover_zoom is
  'Aproximacao da arte dentro da faixa. 1 = a arte preenche a faixa sem zoom extra.';
comment on column stores.cover_pos_x is
  'Ponto horizontal da arte que fica ancorado na faixa, em % (50 = centro). Equivale a object-position no eixo X.';
comment on column stores.cover_pos_y is
  'Ponto vertical da arte que fica ancorado na faixa, em % (50 = centro). Equivale a object-position no eixo Y.';
