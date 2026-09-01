-- Migration: marketplace (Fase B).
--
-- O QUE É: um catálogo de produtos pré-cadastrados, mantido pelo Vitrinoo, que o
-- revendedor importa para a própria loja em vez de cadastrar produto por produto.
-- Contexto completo em docs/marketplace/02-RESPOSTAS.md.
--
-- POR QUE TABELAS SEPARADAS, e não `products` com `store_id` nulo:
-- `products.store_id` é `not null` e TODAS as policies RLS de products/product_sizes/
-- product_photos derivam o tenant dele (`store_id in (select id from stores where
-- owner_id = auth.uid())`). Afrouxar `store_id` para aceitar NULL quebraria o
-- isolamento multi-tenant inteiro de uma vez — um produto sem dono não casa com
-- nenhuma policy e o comportamento resultante dependeria de detalhe de cada USING.
-- Marketplace é outro domínio (sem dono, escrita só do admin, leitura ampla) e
-- ganha suas próprias tabelas, com suas próprias policies.
--
-- ESTA MIGRATION É REPETÍVEL (idempotente). Não é preciosismo: o SQL Editor do
-- Supabase NÃO envolve um script de múltiplos comandos numa única transação — uma
-- execução que falha no meio deixa aplicado tudo que veio antes do erro. Sem
-- `if not exists` / `drop ... if exists`, a segunda tentativa morreria no primeiro
-- objeto já criado, e a correção viraria editar o arquivo na mão para pular o que
-- já existe. Rodar duas vezes aqui é seguro e converge para o mesmo estado.

-- =============================================================================
-- Admin do marketplace
-- =============================================================================
-- O projeto não tinha nenhum conceito de super-usuário até aqui: toda autorização
-- era "dono da loja X". Curar o marketplace exige um papel novo, que não é dono
-- de loja nenhuma.
--
-- Implementado como TABELA, não como claim em auth.users: manter a lista no schema
-- público a torna auditável por migration e por query, sem depender de editar
-- metadados de auth na mão pelo painel do Supabase (operação que não deixa rastro
-- no repositório e que é fácil de aplicar em um ambiente e esquecer no outro —
-- este projeto roda migrations em DOIS projetos Supabase).
create table if not exists marketplace_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table marketplace_admins enable row level security;

-- Sem NENHUMA policy, deliberadamente: a tabela fica inacessível pela API REST
-- (PostgREST nega tudo quando RLS está ligada e não há policy). Só a service_role
-- e funções SECURITY DEFINER a enxergam. Nem um admin pode listar ou alterar a
-- lista de admins pelo cliente — promoção/remoção é operação de migration/console.

-- `stable` (não `volatile`): o planner pode reusar o resultado dentro da mesma
-- query, e esta função é chamada uma vez por linha em policies de SELECT.
-- `search_path` fixado mitiga elevação de privilégio por hijack de search_path,
-- mesma precaução já adotada em `is_slug_available` (migration 0002).
create or replace function public.is_marketplace_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from marketplace_admins where user_id = auth.uid());
$$;

grant execute on function public.is_marketplace_admin() to authenticated;

-- =============================================================================
-- Acesso ao pacote, por loja
-- =============================================================================
-- O pacote é um upsell PAGO, com cobrança manual via WhatsApp (o CLAUDE.md mantém
-- billing fora do MVP). Não há gateway: você gera a cobrança, recebe, e liga esta
-- flag na mão. `granted_at` existe para saber desde quando — útil para suporte e
-- para uma eventual migração para cobrança recorrente, sem exigir migration nova.
alter table stores
  add column if not exists marketplace_access boolean not null default false,
  add column if not exists marketplace_access_granted_at timestamptz;

-- =============================================================================
-- Tabela: marketplace_products
-- =============================================================================
create table if not exists marketplace_products (
  id uuid primary key default gen_random_uuid(),

  -- Espelham as colunas de `products` que a importação copia. Os nomes são iguais
  -- de propósito: a importação é uma cópia campo a campo, e divergir os nomes só
  -- criaria um mapa de tradução para errar.
  name text not null,
  brand text not null,
  brand_other text,
  sole text not null,
  category text not null default 'Chuteira',
  suggested_price numeric(10,2) not null,

  -- Grade do fornecedor. Não é uma tabela de tamanhos como `product_sizes` porque
  -- aqui a grade é sempre um INTERVALO contínuo declarado pelo fornecedor
  -- ("39-45"), nunca uma seleção esparsa. A expansão para linhas individuais
  -- acontece na importação, contra a grade real da loja.
  size_min smallint not null check (size_min between 35 and 46),
  size_max smallint not null check (size_max between 35 and 46),
  check (size_max >= size_min),

  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),

  -- Os 100 produtos que uma loja SEM acesso enxerga. Decisão do dono do produto:
  -- quem não pagou vê uma amostra do catálogo, não os 990 — o suficiente para
  -- entender o valor, sem entregar o pacote inteiro de graça. Ver a policy
  -- `read_marketplace_products` abaixo, que é onde isso vira regra.
  preview boolean not null default false,

  -- Rastro da origem. `source_album_id` é UNIQUE: é a chave de deduplicação de
  -- re-ingest — rodar a raspagem de novo atualiza o produto existente em vez de
  -- criar um duplicado. Sem isso, cada sincronização multiplicaria o catálogo.
  source_seller text not null,
  source_album_id text not null unique,
  source_category text,

  -- `album_id` do Yupoo é sequencial e crescente, então serve de régua de
  -- lançamento sem o fornecedor informar data nenhuma (ver recon §8). Guardado
  -- como bigint para ordenar por recência — que é o critério de "mais novo"
  -- usado tanto na precificação quanto na escolha do preview.
  source_rank bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_products_browse_idx
  on marketplace_products (status, source_rank desc);
create index if not exists marketplace_products_preview_idx
  on marketplace_products (preview) where preview;

alter table marketplace_products enable row level security;

-- Leitura: qualquer revendedor autenticado vê o catálogo PUBLICADO, mas o alcance
-- depende de ter comprado o pacote. Sem acesso, só os 100 do preview.
--
-- A checagem de acesso é `exists (... stores where owner_id = auth.uid() ...)` e
-- não um join: `stores` tem RLS própria restringindo ao dono, e um EXISTS
-- correlacionado é avaliado com os privilégios do chamador — ou seja, não há
-- caminho aqui para uma loja ler a flag de outra.
drop policy if exists "read_marketplace_products" on marketplace_products;
create policy "read_marketplace_products" on marketplace_products
  for select
  to authenticated
  using (
    status = 'published'
    and (
      preview
      or exists (
        select 1 from stores
        where owner_id = auth.uid() and marketplace_access
      )
    )
  );

-- Escrita (e leitura de rascunhos) só para o admin. Policies permissivas são
-- OR-eadas, então esta ADICIONA acesso à de cima em vez de conflitar com ela:
-- o admin enxerga inclusive `draft` e `archived`, que é o estado em que um
-- produto recém-raspado entra para revisão.
drop policy if exists "admin_manage_marketplace_products" on marketplace_products;
create policy "admin_manage_marketplace_products" on marketplace_products
  for all
  to authenticated
  using (is_marketplace_admin())
  with check (is_marketplace_admin());

-- =============================================================================
-- Tabela: marketplace_photos
-- =============================================================================
create table if not exists marketplace_photos (
  id uuid primary key default gen_random_uuid(),
  marketplace_product_id uuid not null references marketplace_products(id) on delete cascade,
  storage_path text not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  unique (marketplace_product_id, position)
);

alter table marketplace_photos enable row level security;

-- A condição do produto pai é REPETIDA aqui, em vez de um `in (select id from
-- marketplace_products)` que dependeria da RLS do pai se aplicar dentro da
-- subquery. Depender disso é frágil: a semântica de RLS aninhada em expressão de
-- policy é sutil e propensa a recursão. Todas as policies deste projeto
-- (0003, 0005) explicitam a condição — esta segue o mesmo padrão.
drop policy if exists "read_marketplace_photos" on marketplace_photos;
create policy "read_marketplace_photos" on marketplace_photos
  for select
  to authenticated
  using (
    marketplace_product_id in (
      select id from marketplace_products
      where status = 'published'
        and (
          preview
          or exists (
            select 1 from stores
            where owner_id = auth.uid() and marketplace_access
          )
        )
    )
  );

drop policy if exists "admin_manage_marketplace_photos" on marketplace_photos;
create policy "admin_manage_marketplace_photos" on marketplace_photos
  for all
  to authenticated
  using (is_marketplace_admin())
  with check (is_marketplace_admin());

-- =============================================================================
-- Procedência na tabela `products`
-- =============================================================================
-- `on delete set null`, não cascade: se um item sair do marketplace, o produto
-- que o lojista já importou e possivelmente editou NÃO pode desaparecer da vitrine
-- dele. Mesmo princípio da migration 0021 (preservar o dado do tenant quando o
-- vínculo externo morre).
--
-- Esta coluna também é o sinal de "veio do pacote", que a vitrine usa para exibir
-- "Importado direto da fábrica (Prazo: 7-25 dias)" em vez do rótulo padrão de
-- sob encomenda — decisão registrada em 02-RESPOSTAS.md.
alter table products
  add column if not exists marketplace_product_id uuid
    references marketplace_products(id) on delete set null;

create index if not exists products_marketplace_product_idx
  on products (marketplace_product_id) where marketplace_product_id is not null;

-- Copy-on-write das fotos. A decisão do dono foi referenciar o bucket global e só
-- copiar quando o lojista editar — com 990 produtos, copiar para cada loja
-- multiplicaria ~530 MB por lojista.
--
-- `source` diz em QUAL bucket o `storage_path` vive: 'own' = product-images,
-- 'marketplace' = marketplace-assets. Um booleano resolveria hoje, mas um enum
-- textual não precisa de migration se um terceiro bucket aparecer.
--
-- O clone acontece no nível do PRODUTO, não da foto: a primeira edição de qualquer
-- foto clona as cinco e desliga a referência de uma vez. Um ponto de transição só,
-- em vez de um estado misto foto a foto que seria muito mais fácil de bugar.
alter table product_photos
  add column if not exists source text not null default 'own'
    check (source in ('own', 'marketplace'));

-- =============================================================================
-- Tabela: marketplace_imports
-- =============================================================================
-- Rastro de quem importou o quê. Serve a três coisas: marcar "já importado" no
-- card do marketplace, permitir desimportar em massa, e sustentar o teto da
-- amostra gratuita.
create table if not exists marketplace_imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  marketplace_product_id uuid not null references marketplace_products(id) on delete cascade,

  -- `set null` (e nullable): se o lojista excluir o produto importado, o RASTRO
  -- sobrevive. É o que permite não cobrar duas vezes a mesma vaga da amostra
  -- gratuita quando ele exclui e importa de novo.
  product_id uuid references products(id) on delete set null,

  created_at timestamptz not null default now()
);

-- Índice único PARCIAL: bloqueia importar o mesmo item duas vezes enquanto ele
-- existe na loja, mas libera a reimportação depois que o lojista o exclui
-- (quando `product_id` vira NULL e a linha sai do índice).
create unique index if not exists marketplace_imports_ativos_unique
  on marketplace_imports (store_id, marketplace_product_id)
  where product_id is not null;

create index if not exists marketplace_imports_store_idx on marketplace_imports (store_id);

alter table marketplace_imports enable row level security;

drop policy if exists "owner_manage_marketplace_imports" on marketplace_imports;
create policy "owner_manage_marketplace_imports" on marketplace_imports
  for all
  to authenticated
  using (store_id in (select id from stores where owner_id = auth.uid()))
  with check (store_id in (select id from stores where owner_id = auth.uid()));

-- =============================================================================
-- Teto da amostra gratuita
-- =============================================================================
-- Uma loja sem `marketplace_access` importa no máximo 10 produtos. O limite vive
-- no BANCO, não só na UI: a anon/authenticated key do Supabase é pública no bundle
-- do cliente, então um lojista poderia chamar a REST direto e criar as linhas de
-- `marketplace_imports` por fora da tela. Mesma lógica de defesa em profundidade
-- já aplicada em `public_insert_order_clicks` (migration 0005).
--
-- Conta produtos DISTINTOS, não linhas: excluir um produto importado e reimportá-lo
-- não consome uma segunda vaga. O teto é sobre quantos itens do catálogo a loja
-- conheceu de graça, não sobre quantas vezes clicou em importar.
create or replace function public.enforce_marketplace_import_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Tamanho da amostra gratuita. Alterar aqui muda a regra inteira; não há
  -- nenhuma outra fonte desse número no banco.
  limite constant int := 10;
  tem_acesso boolean;
  distintos int;
begin
  select marketplace_access into tem_acesso from stores where id = new.store_id;
  if coalesce(tem_acesso, false) then
    return new;
  end if;

  -- Reimportar um item que a loja já conheceu não consome vaga nova.
  if exists (
    select 1 from marketplace_imports
    where store_id = new.store_id
      and marketplace_product_id = new.marketplace_product_id
  ) then
    return new;
  end if;

  select count(distinct marketplace_product_id) into distintos
  from marketplace_imports
  where store_id = new.store_id;

  if distintos >= limite then
    raise exception
      'Limite da amostra gratuita atingido (% produtos). Libere o pacote para importar o catálogo completo.',
      limite
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_imports_quota on marketplace_imports;
create trigger marketplace_imports_quota
  before insert on marketplace_imports
  for each row
  execute function public.enforce_marketplace_import_quota();

-- =============================================================================
-- updated_at
-- =============================================================================
create or replace function touch_marketplace_product_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marketplace_products_touch_updated_at on marketplace_products;
create trigger marketplace_products_touch_updated_at
  before update on marketplace_products
  for each row
  execute function touch_marketplace_product_updated_at();

-- =============================================================================
-- Storage bucket: marketplace-assets
-- =============================================================================
-- Bucket próprio, separado de product-images. As policies de product-images
-- exigem `(storage.foldername(name))[1] = auth.uid()::text` — um caminho por dono
-- —, e o marketplace não tem dono. Reaproveitar o bucket exigiria afrouxar
-- aquelas policies, que são justamente o que isola um tenant do outro.
--
-- Público para leitura porque estas fotos são servidas na vitrine PÚBLICA do
-- lojista, para um cliente final que nunca se autentica.
insert into storage.buckets (id, name, public)
values ('marketplace-assets', 'marketplace-assets', true)
on conflict (id) do nothing;

-- Leitura liberada: o bucket é público e as fotos são servidas na vitrine para um
-- cliente final anônimo. Sem esta policy, o admin também não conseguiria LISTAR os
-- arquivos pela API (o acesso público por URL funciona, mas `list` não).
drop policy if exists "public_select_marketplace_assets" on storage.objects;
create policy "public_select_marketplace_assets" on storage.objects
  for select
  using (bucket_id = 'marketplace-assets');

drop policy if exists "admin_insert_marketplace_assets" on storage.objects;
create policy "admin_insert_marketplace_assets" on storage.objects
  for insert
  with check (bucket_id = 'marketplace-assets' and is_marketplace_admin());

drop policy if exists "admin_update_marketplace_assets" on storage.objects;
create policy "admin_update_marketplace_assets" on storage.objects
  for update
  using (bucket_id = 'marketplace-assets' and is_marketplace_admin());

drop policy if exists "admin_delete_marketplace_assets" on storage.objects;
create policy "admin_delete_marketplace_assets" on storage.objects
  for delete
  using (bucket_id = 'marketplace-assets' and is_marketplace_admin());
