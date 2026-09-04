-- Migration: lançamento vira DADO, e não heurística de runtime.
--
-- ANTES: `ingest.mjs` marcava `recente = terço superior por album_id` e jogava +R$40 no
-- preço sugerido. A régua respondia a pergunta errada — album_id diz quando o FORNECEDOR
-- subiu a foto, não quando a marca lançou o par. Um retrô fotografado ontem subia como
-- lançamento. Decisão do dono (2026-09-01): sem hipótese, só data real de mercado.
--
-- AGORA: `scripts/marketplace/lancamentos.json` guarda a data de lançamento oficial de cada
-- geração, com fonte anotada, e `lib-lancamento.mjs` resolve no INGEST. Estas colunas são o
-- resultado gravado — em runtime o fluxo de precificação lê uma coluna booleana e pronto,
-- sem parse de nome nem cálculo por requisição.
--
-- É lançamento quem for a geração de MAIOR data conhecida da sua linha. Entrar uma geração
-- nova rebaixa a anterior na ingestão seguinte, sozinha.
--
-- SEM check constraint em model_line/model_gen: mesma convenção de
-- 0003_products_schema_rls.sql — enumeração de lista fixa vive na camada de aplicação,
-- nunca em constraint de schema, para que ajustar a lista não exija migration de correção.

alter table marketplace_products
  add column if not exists model_line    text,
  add column if not exists model_gen     text,
  add column if not exists launch_date   date,
  add column if not exists is_lancamento boolean not null default false;

comment on column marketplace_products.model_line is
  'Linha de mercado do par (Mercurial, Predator, F50...), resolvida no ingest contra scripts/marketplace/lancamentos.json. NULL = nome sem correspondência confiável.';
comment on column marketplace_products.model_gen is
  'Geração dentro da linha (17, 26, GX II...). Junto com model_line é a chave da tabela curada.';
comment on column marketplace_products.launch_date is
  'Data de lançamento OFICIAL da geração, com fonte anotada em lancamentos.json. Nunca derivada de source_rank.';
comment on column marketplace_products.is_lancamento is
  'True só quando esta é a geração mais nova conhecida da sua linha. Pendências de identificação (ex.: "Phantom GX III", que a Nike nunca fabricou) ficam false até revisão manual — o lado seguro do erro é não marcar.';

-- Índice parcial: a única pergunta feita em produção é "quais destes são lançamento?",
-- durante a importação em lote. Um índice cheio guardaria 845 linhas false sem serventia.
create index if not exists marketplace_products_lancamento_idx
  on marketplace_products (id) where is_lancamento;
