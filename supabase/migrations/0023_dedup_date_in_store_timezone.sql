-- Migration: a data de deduplicação passa a ser calculada NO FUSO DA LOJA,
-- dentro do banco (achado na auditoria de "Demanda atual", 2026-08-23).
--
-- PROBLEMA (verificado ao vivo na loja `rlesportes`, timezone
-- `America/Boa_Vista`, UTC-4): `logPageview`/`logOrderClick` calculavam
-- `view_date`/`click_date` com `America/Sao_Paulo` HARDCODED e enviavam o
-- literal já pronto no insert. A migration 0013 tinha deixado isso de fora
-- de propósito ("escopo limitado ao painel"), aceitando como resíduo uma
-- fresta de 1-2h por dia em que a mesma pessoa podia contar duas vezes.
--
-- Só que essa data é METADE da chave de deduplicação, e o painel lê tudo no
-- fuso da loja (`startOfTodayInTimeZone`). Gravar em SP e ler em Boa Vista
-- significa que gravação e leitura usam réguas diferentes: um acesso das
-- 23h30 de Boa Vista já era "amanhã" para a trava de dedup, enquanto o
-- dashboard ainda o contava em "hoje". O usuário pediu explicitamente para
-- reverter aquela decisão e alinhar as duas pontas.
--
-- POR QUE NO BANCO, E NÃO NA SERVER ACTION:
--   1. A data deixa de ser um valor ENVIADO pelo cliente. Hoje o insert
--      manda `view_date` e o Postgres aceita o que vier — um cliente
--      malicioso podia furar a dedup mandando datas variadas. Aqui o
--      trigger sobrescreve incondicionalmente.
--   2. Uma única fonte de verdade. Duas Server Actions independentes
--      (`pageview-actions.ts` e `order-clicks-actions.ts`, deliberadamente
--      sem helper compartilhado) precisariam cada uma buscar o fuso da
--      loja e repetir a mesma conta — duas chances de divergir em silêncio.
--   3. Zero query extra no caminho quente da vitrine: o trigger já está
--      dentro da transação do insert.
--
-- POR QUE O FUSO DA LOJA, E NÃO O DO VISITANTE: o painel do revendedor lê
-- as métricas no fuso da loja. Se cada visitante gravasse no fuso do próprio
-- aparelho, "dia" significaria uma coisa diferente por linha e a agregação
-- do dashboard compararia grandezas incompatíveis.
--
-- LINHAS ANTIGAS NÃO SÃO REESCRITAS: o backfill mudaria a data de eventos
-- históricos por no máximo um dia e poderia colidir com o índice único
-- (duas linhas do mesmo visitante/produto caindo no mesmo dia após o
-- ajuste), destruindo dado real para corrigir uma fresta de 1h. O ganho é
-- daqui pra frente.

create or replace function set_dedup_date_in_store_timezone()
returns trigger
language plpgsql
security definer
-- `search_path` fixo é obrigatório em `security definer`: sem isso um
-- schema malicioso no search_path do chamador poderia sequestrar a
-- resolução de `stores`.
set search_path = public
as $$
declare
  store_tz text;
begin
  -- `security definer` é necessário porque o papel `anon` NÃO tem leitura
  -- irrestrita garantida em `stores` no futuro; a função lê apenas a coluna
  -- `timezone` da loja que o próprio insert já referencia, então não expõe
  -- nada que a policy pública de `stores` já não exponha.
  select timezone into store_tz from stores where id = new.store_id;

  -- Loja inexistente nunca chega aqui (FK), mas um fuso vazio/inválido
  -- faria `at time zone` lançar e derrubar o insert inteiro — e perder um
  -- evento por causa de metadado ruim seria pior do que atribuí-lo ao fuso
  -- default, que é exatamente o comportamento anterior a esta migration.
  if store_tz is null or store_tz = '' then
    store_tz := 'America/Sao_Paulo';
  end if;

  -- Derivado de `new.created_at`, NUNCA de `now()`.
  --
  -- Com `now()` a data seria sempre "hoje", e qualquer linha semeada com um
  -- `created_at` no passado (testes de agregação por período, um eventual
  -- backfill) teria a data de dedup divergindo do próprio timestamp — a
  -- mesma incoerência entre gravação e leitura que esta migration existe
  -- para eliminar, só que por outro caminho. Derivando de `created_at`, a
  -- coluna passa a ser uma FUNÇÃO DETERMINÍSTICA do timestamp do evento
  -- mais o fuso da loja: as duas nunca podem discordar.
  begin
    new.view_date := (new.created_at at time zone store_tz)::date;
  exception when others then
    new.view_date := (new.created_at at time zone 'America/Sao_Paulo')::date;
  end;

  return new;
end;
$$;

create or replace function set_click_dedup_date_in_store_timezone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  store_tz text;
begin
  select timezone into store_tz from stores where id = new.store_id;

  if store_tz is null or store_tz = '' then
    store_tz := 'America/Sao_Paulo';
  end if;

  begin
    new.click_date := (new.created_at at time zone store_tz)::date;
  exception when others then
    new.click_date := (new.created_at at time zone 'America/Sao_Paulo')::date;
  end;

  return new;
end;
$$;

-- BEFORE INSERT: o índice único de dedup é avaliado DEPOIS dos triggers
-- BEFORE, então a trava passa a operar sobre a data já corrigida.
drop trigger if exists pageviews_set_view_date on pageviews;
create trigger pageviews_set_view_date
  before insert on pageviews
  for each row execute function set_dedup_date_in_store_timezone();

drop trigger if exists order_clicks_set_click_date on order_clicks;
create trigger order_clicks_set_click_date
  before insert on order_clicks
  for each row execute function set_click_dedup_date_in_store_timezone();

comment on function set_dedup_date_in_store_timezone is
  'Preenche pageviews.view_date com o dia civil no fuso da loja (stores.timezone), ignorando o valor enviado pelo cliente. Alinha a janela de dedup com a janela de leitura do dashboard (startOfTodayInTimeZone).';

comment on function set_click_dedup_date_in_store_timezone is
  'Mesmo papel do trigger de pageviews, para order_clicks.click_date.';

-- DEFAULT no nível do banco para as duas colunas: elas eram NOT NULL sem
-- default porque a aplicação SEMPRE mandava o valor. Agora ela nunca manda,
-- e o schema precisa refletir isso — sem o default, o tipo gerado por
-- `supabase gen types typescript` continuaria marcando a coluna como
-- obrigatória no Insert, e o próximo `gen types` quebraria as duas Server
-- Actions. O valor do default é irrelevante na prática: o trigger BEFORE
-- INSERT sobrescreve incondicionalmente antes de qualquer coisa ser gravada.
alter table pageviews alter column view_date set default (now() at time zone 'America/Sao_Paulo')::date;
alter table order_clicks alter column click_date set default (now() at time zone 'America/Sao_Paulo')::date;

-- EFEITO NOS TESTES: `pageviewDedupColumns()`/`orderClickDedupColumns()`
-- (tests/setup/supabase-test.ts) continuam podendo mandar a data — o trigger
-- simplesmente a recalcula a partir de `created_at`. Um teste que precise
-- semear uma linha em um dia específico deve, a partir daqui, definir
-- `created_at`, não a data de dedup: é o `created_at` que manda.
