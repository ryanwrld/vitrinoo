-- =============================================================================
-- 0018 — products.updated_at: o sinal de "catálogo vivo"
-- =============================================================================
--
-- PARA QUE SERVE
--
-- O cartão de perfil da vitrine mostra "Atualizado há X dias". Esse número
-- não é enfeite: o maior medo de quem recebe um link de revendedor informal
-- pelo WhatsApp é cair num catálogo morto — preço velho, tudo esgotado,
-- ninguém responde. "Atualizado há 2 dias" mata esse medo antes do cliente
-- rolar a primeira tela.
--
-- E ele tem um segundo efeito, sobre o REVENDEDOR: o abandono fica visível
-- publicamente. É a única métrica da vitrine que muda o comportamento de
-- quem a mantém, em vez de só informar quem a visita.
--
-- POR QUE UMA COLUNA NOVA, E NÃO `created_at`
--
-- `products` só guardava QUANDO O PRODUTO FOI CRIADO. Derivar a métrica de
-- `max(created_at)` diria "último cadastro há X", que é outra coisa: uma
-- loja que passou a semana ajustando preços e marcando tamanhos esgotados
-- apareceria como parada há meses. Exatamente o contrário da verdade.
--
-- OS TRÊS GATILHOS
--
-- Atualizar catálogo não é só editar a linha de `products`. Marcar o 42 como
-- esgotado (`product_sizes`) e trocar a foto (`product_photos`) são tão
-- "catálogo vivo" quanto mudar o preço — e são, na prática, o que o
-- revendedor mais faz no dia a dia. Por isso as tabelas filhas empurram o
-- `updated_at` do produto pai.
--
-- Sem recursão infinita: o gatilho das filhas escreve em `products`, o de
-- `products` só escreve na própria linha (NEW), e nenhum deles volta a tocar
-- nas filhas.
--
-- RLS: as funções rodam com a permissão de quem chamou (sem SECURITY
-- DEFINER, de propósito). O dono editando os próprios tamanhos passa pela
-- policy `owner_full_access_products`; o papel `anon` não escreve em
-- nenhuma dessas tabelas, então não há caminho para um visitante disparar
-- estes gatilhos.
-- =============================================================================

-- 1. Coluna -------------------------------------------------------------------

alter table products
  add column if not exists updated_at timestamptz not null default now();

-- Backfill: sem isto, todo produto já cadastrado nasceria com "atualizado
-- agora" e a métrica mentiria para mais no primeiro dia — exatamente o tipo
-- de número inflado que destrói a confiança que ela existe para construir.
update products set updated_at = created_at where updated_at > created_at;

comment on column products.updated_at is
  'Ultima alteracao do produto OU de seus tamanhos/fotos (via triggers). Alimenta "Atualizado ha X" no cartao de perfil da vitrine. Nunca escrever a mao pela aplicacao — os triggers sao a unica fonte.';

-- 2. Gatilho da própria tabela ------------------------------------------------

create or replace function touch_product_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on products;
create trigger products_touch_updated_at
  before update on products
  for each row
  execute function touch_product_updated_at();

-- 3. Gatilho das tabelas filhas -----------------------------------------------

create or replace function touch_parent_product_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- `coalesce(new, old)` cobre os três eventos com uma função só: em DELETE
  -- `new` é nulo, em INSERT `old` é nulo.
  update products
     set updated_at = now()
   where id = coalesce(new.product_id, old.product_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists product_sizes_touch_product on product_sizes;
create trigger product_sizes_touch_product
  after insert or update or delete on product_sizes
  for each row
  execute function touch_parent_product_updated_at();

drop trigger if exists product_photos_touch_product on product_photos;
create trigger product_photos_touch_product
  after insert or update or delete on product_photos
  for each row
  execute function touch_parent_product_updated_at();

-- 4. Índice -------------------------------------------------------------------

-- A vitrine lê `max(updated_at)` dos produtos PUBLICADOS de uma loja. Índice
-- parcial (só publicados) e descendente: a resposta é a primeira linha, sem
-- varrer o catálogo inteiro a cada carregamento da vitrine — que é uma rota
-- deliberadamente sem cache nenhum.
create index if not exists products_store_published_updated_idx
  on products (store_id, updated_at desc)
  where status = 'published';
