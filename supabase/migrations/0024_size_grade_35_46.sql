-- Migration: amplia a grade de numeração de 36-45 para 35-46.
--
-- MOTIVO (medido, não suposto): o catálogo do fornecedor real do marketplace
-- (`yhc956848708`, ver docs/marketplace/00-YUPOO-RECON.md) publica grades que
-- estouram a faixa atual nas DUAS pontas:
--
--   35-45  35-46  36-45  36-46  38-45  39-45  39-46
--
-- São 11 produtos com numeração 35 e várias linhagens que vão até 46. Com o
-- check em `between 36 and 45`, a importação do pacote falharia no INSERT de
-- `product_sizes` — e falharia PARCIALMENTE, deixando o produto criado sem a
-- grade completa, que é o pior modo de falha possível: a numeração é o campo
-- que o cliente final mais pergunta (02-RESPOSTAS.md, resposta B12).
--
-- 35 é numeração adulta feminina/juvenil legítima, e 46 é tamanho grande
-- comum — nenhuma das duas é caso de borda exótico.
--
-- ESCOPO: apenas relaxa os dois `check`. Nenhuma linha existente é afetada
-- (toda grade já gravada está dentro de 36-45, logo dentro de 35-46 também),
-- nenhuma policy RLS é tocada, e a operação é puramente aditiva em termos de
-- valores aceitos — não há caminho em que um dado antes válido passe a ser
-- rejeitado.
--
-- `order_clicks.size` acompanha `product_sizes.size` de propósito: é o
-- tamanho que o cliente final escolheu ao disparar o pedido no WhatsApp. Se
-- só um dos dois fosse ampliado, um clique em 46 seria rejeitado no INSERT e
-- o pedido sumiria das métricas de "tamanhos mais pedidos" sem aviso.
--
-- POR QUE UM BLOCO `do` E NÃO UM `drop constraint <nome>` DIRETO:
-- as duas checagens foram declaradas inline na coluna (`size smallint not null
-- check (...)`, migrations 0003 e 0005), e nesse caso o Postgres GERA o nome.
-- O padrão é `<tabela>_<coluna>_check`, mas isso é convenção de geração, não
-- garantia — se a tabela já tivesse outra checagem na mesma coluna o nome viria
-- com sufixo numérico. Descobrir o nome no catálogo em vez de presumi-lo torna a
-- migration correta independentemente disso, e `format(%I)` cuida do quoting.
--
-- A BUSCA É PELA COLUNA, NÃO PELO TEXTO DA CONDIÇÃO: uma primeira versão desta
-- migration filtrava por `pg_get_constraintdef(...) ilike '%size%between%'` e não
-- encontrava nada, porque o Postgres NORMALIZA `between` ao armazenar — a
-- definição fica gravada como `CHECK ((size >= 36) AND (size <= 45))`, sem a
-- palavra `between` em lugar nenhum. `conkey` guarda os números das colunas
-- envolvidas na checagem, e é a fonte confiável para essa pergunta.

do $$
declare
  alvo record;
begin
  for alvo in
    select rel.relname as tabela, con.conname as constraint_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname in ('product_sizes', 'order_clicks')
      and con.contype = 'c'
      -- Qualquer CHECK que envolva a coluna `size`. `not null` não aparece aqui
      -- (vive em pg_attribute.attnotnull, não em pg_constraint), então não há
      -- risco de derrubar a obrigatoriedade da coluna junto.
      and exists (
        select 1
        from unnest(con.conkey) as col(attnum)
        join pg_attribute att
          on att.attrelid = rel.oid and att.attnum = col.attnum
        where att.attname = 'size'
      )
  loop
    execute format('alter table public.%I drop constraint %I', alvo.tabela, alvo.constraint_name);
  end loop;
end;
$$;

alter table product_sizes add constraint product_sizes_size_check
  check (size between 35 and 46);

alter table order_clicks add constraint order_clicks_size_check
  check (size between 35 and 46);
