-- Migration: packs e álbuns do marketplace.
--
-- O QUE MUDA: até aqui o marketplace era um INVENTÁRIO — 990 fichas soltas que o
-- revendedor importava uma a uma. Isso não resolvia a objeção que originou o
-- projeto ("não quero cadastrar produto por produto"): ele apenas trocava
-- cadastrar 250 por clicar 250 vezes, em 6 páginas.
--
-- O modelo agora é o do próprio Yupoo, que o revendedor já entende:
--
--   PACK (capa, nome, preço)
--     └── ÁLBUM (Nike, adidas, Joma, Mizuno, Futsal…)
--          └── CHUTEIRAS
--
-- E o pack passa a ser uma COISA que se compra, com um botão que leva o conjunto
-- inteiro para a loja de uma vez.
--
-- PRODUTO EM VÁRIOS ÁLBUNS (tabela de ligação, não coluna): hoje os álbuns são
-- por marca, e uma coluna `album_id` bastaria. Mas "Futsal", "Society" e
-- "Lançamentos" — os próximos recortes óbvios — CRUZAM as marcas: a Mercurial 17
-- de futsal pertence ao álbum Nike e ao álbum Futsal ao mesmo tempo. Resolver
-- isso depois exigiria migrar dados já em uso; a tabela de ligação custa uma
-- junção a mais e deixa o caso resolvido desde já.

-- =============================================================================
-- Tabela: marketplace_packs
-- =============================================================================
create table if not exists marketplace_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,

  -- Caminho no bucket `marketplace-assets`, mesmo lugar das fotos de produto.
  cover_path text,

  -- NULL = pack ainda sem preço fechado. A cobrança é manual via WhatsApp
  -- (o CLAUDE.md mantém billing fora do MVP), então este valor é informativo:
  -- serve para exibir na tela e para você não ter que lembrar o número de cabeça.
  price numeric(10,2),

  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  position smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table marketplace_packs enable row level security;

create policy "read_marketplace_packs" on marketplace_packs
  for select to authenticated using (status = 'published');

create policy "admin_manage_marketplace_packs" on marketplace_packs
  for all to authenticated
  using (is_marketplace_admin()) with check (is_marketplace_admin());

-- =============================================================================
-- Tabela: marketplace_albums
-- =============================================================================
create table if not exists marketplace_albums (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references marketplace_packs(id) on delete cascade,
  name text not null,
  cover_path text,

  -- Reservado. Hoje SEMPRE nulo: a decisão do dono foi "só o pack tem preço".
  -- A coluna existe desde já para que vender "Só Nike" avulso amanhã não custe
  -- uma migration — o custo de deixá-la aqui é zero.
  price numeric(10,2),

  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (pack_id, name)
);

create index if not exists marketplace_albums_pack_idx on marketplace_albums (pack_id, position);

alter table marketplace_albums enable row level security;

-- Espelha a visibilidade do pack pai. A condição é REPETIDA em vez de delegada
-- por subquery, mesmo padrão já adotado em `read_marketplace_photos` (0025):
-- depender de RLS aninhada dentro de expressão de policy é sutil e propenso a
-- recursão.
create policy "read_marketplace_albums" on marketplace_albums
  for select to authenticated
  using (pack_id in (select id from marketplace_packs where status = 'published'));

create policy "admin_manage_marketplace_albums" on marketplace_albums
  for all to authenticated
  using (is_marketplace_admin()) with check (is_marketplace_admin());

-- =============================================================================
-- Tabela: marketplace_album_products (ligação)
-- =============================================================================
create table if not exists marketplace_album_products (
  album_id uuid not null references marketplace_albums(id) on delete cascade,
  marketplace_product_id uuid not null references marketplace_products(id) on delete cascade,
  position smallint not null default 0,
  primary key (album_id, marketplace_product_id)
);

create index if not exists marketplace_album_products_produto_idx
  on marketplace_album_products (marketplace_product_id);

alter table marketplace_album_products enable row level security;

create policy "read_marketplace_album_products" on marketplace_album_products
  for select to authenticated
  using (
    album_id in (
      select a.id from marketplace_albums a
      join marketplace_packs p on p.id = a.pack_id
      where p.status = 'published'
    )
  );

create policy "admin_manage_marketplace_album_products" on marketplace_album_products
  for all to authenticated
  using (is_marketplace_admin()) with check (is_marketplace_admin());

-- =============================================================================
-- updated_at do pack
-- =============================================================================
create or replace function touch_marketplace_pack_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marketplace_packs_touch_updated_at on marketplace_packs;
create trigger marketplace_packs_touch_updated_at
  before update on marketplace_packs
  for each row
  execute function touch_marketplace_pack_updated_at();

-- =============================================================================
-- Sobre o CONTROLE DE ACESSO, deliberadamente não alterado aqui
-- =============================================================================
-- `stores.marketplace_access` (migration 0025) continua sendo a única fonte de
-- verdade sobre quem liberou o pack, e a policy `read_marketplace_products`
-- segue lendo dela. Não foi trocada por uma tabela `pack_access` porque existe
-- UM pack: as duas modelagens são equivalentes hoje, e a tabela só adicionaria
-- uma junção em toda leitura do acervo sem responder nenhuma pergunta nova.
--
-- QUANDO ISSO PRECISA MUDAR: no dia em que existir um segundo pack vendido
-- separadamente (ex.: "Pack Infantil"), porque aí "tem acesso" deixa de ser um
-- booleano e vira "a quais packs". A migração terá que criar
-- `marketplace_pack_access (store_id, pack_id, granted_at)`, popular a partir de
-- `stores.marketplace_access` para todas as lojas com acesso ao pack atual, e
-- reescrever a policy. Fica registrado aqui para não ser descoberto tarde.
