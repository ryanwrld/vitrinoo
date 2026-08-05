-- Novo padrão para lojas criadas a partir daqui: produto esgotado é OCULTADO
-- da vitrine, não mostrado esmaecido (decisão do usuário).
--
-- Só o DEFAULT da coluna muda. Lojas que já existem mantêm o valor que
-- escolheram (ou o antigo `false` herdado) — virar a chave nelas mudaria a
-- vitrine pública de quem já está no ar sem ninguém ter pedido.
alter table stores alter column hide_sold_out_default set default true;
