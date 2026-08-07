-- Migration: fuso horário por loja (achado ao vivo, 2026-08-07).
--
-- PROBLEMA: todo cálculo de "dia" no projeto assumia America/Sao_Paulo
-- fixo — `startOfTodayBR` em metrics.ts, as datas de deduplicação das
-- migrations 0010/0012, e o formatador de data absoluta do feed. O comentário
-- de `startOfTodayBR` reconhecia a dívida ("não uma tabela de timezone por
-- loja (fora de escopo do v1.1)").
--
-- Só que o Brasil tem TRÊS fusos continentais: UTC-3 (Sudeste/Sul/Nordeste),
-- UTC-4 (Roraima, Amazonas, Rondônia, Mato Grosso, Mato Grosso do Sul) e
-- UTC-5 (Acre e sudoeste do Amazonas). O próprio dono do produto é de
-- Roraima. Para ele, "hoje" no painel começava às 23h da noite anterior no
-- relógio dele, e um pedido recebido às 23h30 aparecia como sendo do dia
-- seguinte. Nenhum dado se perdia — era atribuição ao dia errado.
--
-- DECISÃO (confirmada com o usuário): guardar o fuso na loja, preenchido
-- automaticamente a partir do navegador do revendedor no onboarding. Sem
-- pergunta nova no cadastro: o navegador já sabe o fuso do aparelho, e
-- perguntar isso a um usuário não-técnico seria fricção sem retorno.

-- `text` e não um enum: a lista de fusos IANA muda com o tempo (governos
-- criam e extinguem zonas), e um enum exigiria migration a cada mudança. A
-- validação de que o valor é um fuso REAL acontece na fronteira do servidor
-- via Intl (ver src/lib/time/store-timezone.ts) — um valor inválido nunca
-- chega até aqui, e se chegasse, o código cai no default em vez de quebrar.
--
-- DEFAULT preenche as lojas que já existem sem backfill: todas foram
-- criadas sob a premissa antiga (São Paulo), então esse é literalmente o
-- valor que elas já usavam de forma implícita. NOT NULL para nunca existir
-- loja sem fuso — o código não precisa tratar o caso nulo em lugar nenhum.
alter table stores
  add column timezone text not null default 'America/Sao_Paulo';

comment on column stores.timezone is
  'Fuso IANA da loja (ex.: America/Boa_Vista). Define o que é "hoje" no dashboard e a janela de deduplicação de pageviews/order_clicks. Preenchido automaticamente pelo navegador do revendedor no onboarding; validado com Intl na fronteira do servidor.';

-- RLS: as policies existentes de `stores` não referenciam colunas
-- específicas, então nenhuma precisa ser recriada. Vale notar que o fuso
-- fica legível publicamente junto com nome/logo/cor da loja (a policy
-- pública de stores é `using(true)`) — é metadado operacional, não dado
-- pessoal, e a vitrine não expõe esse campo em lugar nenhum.
