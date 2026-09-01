-- Migration: promove o dono do produto a admin do marketplace.
--
-- Sem nenhuma linha em `marketplace_admins`, a policy `admin_manage_marketplace_*`
-- (migration 0025) não concede nada a ninguém: o marketplace existiria sem
-- ter quem o cure. Esta migration cria o primeiro — e por ora único — admin.
--
-- POR QUE BUSCAR POR E-MAIL EM VEZ DE FIXAR O UUID:
-- este projeto roda migrations em DOIS Supabase (produção e teste), e o mesmo
-- e-mail tem `auth.users.id` DIFERENTE em cada um — o id é gerado por projeto.
-- Fixar o UUID de produção faria a migration falhar no projeto de teste, onde
-- aquele id não existe e a FK para `auth.users` seria violada.
--
-- O `insert ... select` resolve os dois casos com o mesmo texto: no projeto onde
-- a conta existe, insere o id correto; onde não existe, o select não devolve
-- linha nenhuma e o insert vira no-op silencioso. Nenhuma das duas situações é
-- erro, e o arquivo continua sendo a fonte de verdade auditável de quem é admin.
--
-- `on conflict do nothing` torna a migration repetível.

insert into marketplace_admins (user_id)
select id
from auth.users
where email = 'ryanlucas.apnet@gmail.com'
on conflict (user_id) do nothing;
