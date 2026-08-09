-- =============================================================================
-- 0017 — Capa da loja e Instagram (cartão de perfil da vitrine)
-- =============================================================================
--
-- CONTEXTO
--
-- O topo da vitrine pública deixa de ser uma faixa de cor chapada e passa a
-- ser um CARTÃO DE PERFIL (capa + avatar sobreposto + nome + @slug + bio +
-- números + link). Decisão de produto do usuário: o Vitrinoo precisa parecer
-- site de loja profissional, não conversa de rede social — e todo perfil que
-- tem logo acompanha um banner.
--
-- A CAPA É OPCIONAL (decisão do usuário)
--
-- O padrão é um gradiente gerado a partir da `accent_color` que a loja já
-- escolheu — toda vitrine nasce apresentável, sem ninguém precisar fazer
-- nada, inclusive as que já existem. Quem quiser sobe a própria foto e ela
-- substitui o gradiente.
--
-- Diferente da logo, que É obrigatória: a logo identifica a loja e não tem
-- substituto automático possível; a capa é superfície, e uma derivada da cor
-- de marca já cumpre o papel. Exigir dois uploads de um público não-técnico
-- seria fricção sem contrapartida.
--
-- SEGURANÇA
--
-- Nenhuma policy muda. `stores` já é legível por `anon`
-- (`public_read_published_stores`, 0004) e as duas colunas entram no mesmo
-- SELECT — são dados públicos por natureza: a capa é exibida na vitrine e o
-- Instagram é um perfil público que o revendedor escolhe divulgar.
--
-- O upload em si reusa o bucket `store-assets`, que já tem as quatro policies
-- de dono (insert/select/update/delete escopadas por `owner_id`, 0001) — o
-- arquivo da capa vive no mesmo prefixo `<user_id>/` da logo, então herda a
-- mesma proteção sem policy nova.
-- =============================================================================

alter table stores
  add column if not exists cover_url text,
  add column if not exists instagram text;

comment on column stores.cover_url is
  'URL publica da capa (banner) do cartao de perfil da vitrine. OPCIONAL: null e o estado normal e esperado — a vitrine gera um gradiente a partir de accent_color. Upload so para quem quiser substituir o gradiente pela propria foto.';

comment on column stores.instagram is
  'Handle do Instagram da loja, SEM o @ e sem URL — so o nome de usuario (ex.: "rlesportes"). Normalizado no save: @ removido, URL colada inteira reduzida ao handle. Opcional.';
