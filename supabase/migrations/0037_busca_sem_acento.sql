-- Migration: buscar sem acento passa a achar palavra com acento.
--
-- POR QUE: a busca global do painel filtra com `ilike`, que é insensível a
-- MAIÚSCULA mas não a ACENTO. Quem digita "sintetica" não acha "sintética", quem
-- digita "retro" não acha "Retrô". Em português isso não é caso de borda: digitar
-- sem acento é o comportamento normal de quem está com pressa no celular, e o
-- teclado do Android nem sugere o acento no meio de uma busca.
--
-- POR QUE COLUNA GERADA, e não índice de expressão: o PostgREST não sabe chamar
-- função sobre a coluna — não existe `.ilike(unaccent(name), …)` no client do
-- Supabase. Materializar o texto normalizado numa coluna é o que torna a busca
-- expressável como um filtro comum, sem inventar uma RPC só para isso.
--
-- POR QUE O INVÓLUCRO `busca_sem_acento`: `unaccent()` é declarada STABLE, não
-- IMMUTABLE, porque depende do dicionário instalado. Coluna gerada exige função
-- imutável, então o Postgres recusa `unaccent(name)` direto. O contorno padrão é
-- fixar o dicionário no argumento (`'public.unaccent'`) e declarar imutável — o
-- que passa a ser verdade, já que o dicionário deixou de ser variável.
--
-- SEM pg_trgm E SEM ÍNDICE, por ora. Um padrão `%termo%` não usa índice btree, e
-- as tabelas são pequenas: 990 linhas no pacote e algumas centenas por loja. Uma
-- varredura sequencial nisso é irrelevante perto dos 250ms de debounce que a
-- busca já espera. Se um dia doer, o passo é `pg_trgm` + índice GIN sobre
-- `name_busca` — que já vai existir por causa desta migration.

-- =============================================================================
-- Extensão e o invólucro imutável
-- =============================================================================
create extension if not exists unaccent;

-- `lower()` entra AQUI, junto com o acento: a coluna guarda o texto já pronto
-- para comparação, e o lado do app normaliza o termo digitado do mesmo jeito
-- (normalizeSearch, em src/lib/search/registry.ts). Uma normalização só,
-- definida nos dois lados da mesma forma, é o que evita o bug de "casa no banco
-- mas não na tela".
create or replace function public.busca_sem_acento(texto text)
  returns text
  language sql
  immutable
  strict
  parallel safe
as $$
  select public.unaccent('public.unaccent', lower(texto))
$$;

-- =============================================================================
-- As colunas de busca
-- =============================================================================
-- STORED e não VIRTUAL: o Postgres 15 só suporta STORED, e é o que queremos de
-- qualquer forma — o custo é pago uma vez na escrita, não a cada tecla digitada.
alter table products
  add column if not exists name_busca text
  generated always as (public.busca_sem_acento(name)) stored;

alter table marketplace_products
  add column if not exists name_busca text
  generated always as (public.busca_sem_acento(name)) stored;

comment on column products.name_busca is
  'Nome em minúsculas e sem acento, para a busca global do painel. Gerada: nunca escrever à mão.';

comment on column marketplace_products.name_busca is
  'Nome em minúsculas e sem acento, para a busca global do painel. Gerada: nunca escrever à mão.';
