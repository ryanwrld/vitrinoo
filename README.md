<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Storage-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

# Vitrinoo

Um revendedor de chuteiras importadas geralmente apresenta os seu produtos ao lead em um catálogo com pastas espalhadas do Google Drive, fotos soltas no WhatsApp ou num álbum do Yupoo em chinês (mandarim) — nada disso passa confiança e clareza dos produtos ao cliente final, e cada pedido vira uma troca manual de mensagens perguntando tamanho, preço e disponibilidade, afetando também seu processo de vendas, tornando-o mais lento e amador.

O **Vitrinoo** transforma esse catálogo informal num catálogo organizado e claro, priorizando a experiencia do seu cliente final: produtos com fotos, tamanhos disponíveis, preços em BRL, e um botão que já abre o WhatsApp da loja com o pedido pronto e preenchido — modelo, tamanho e preço inclusos. O cliente escolhe e manda a mensagem. Sem cadastro, sem app, sem o lojista precisar estar online pra apresentar o produto, usando vitrino, você só confirma no Whatsapp o interesse e dados de endereço do cliente, E FECHA A VENDA.

## Como funciona

**Revendedor** cria conta, monta a identidade da loja (nome, logo, cor) e cadastra os produtos — fotos comprimidas automaticamente, tamanhos, preço, marca. Recebe um link único do seu catálogo, com QR Code pra divulgar no Instagram, WhatsApp Status ou onde for. No painel, acompanha métricas muito importantes de tendências do produto (quantidade de acessos por produto, produtos mais vistos, cliques em "Pedir agora", tamanhos mais escolhidos), recebe notificações das atividades recentes dos seus clientes e encontra qualquer produto ou página do painel numa busca global com atalho, na barra de pesquisa, facilitando a experiência e navegação pro usuario lojista — tudo com suporte a modo escuro e uso confortável no celular.

**Cliente final** abre o link, filtra por marca/solado/modalidade, escolhe o tamanho de um produto disponível e clica em pedir — o WhatsApp abre com a mensagem já formatada, pronta pra enviar. Sem cadastro, sem app.

## Funcionalidades

**Painel do revendedor**
- Conta multi-tenant com isolamento por Row-Level Security (cada revendedor só vê os próprios dados)
- Onboarding de loja (nome, logo com prévia local, cor da marca) e configuração do WhatsApp
- CRUD completo de produtos: até 5 fotos por produto com compressão automática, galeria, controle de tamanho/estoque
- Link personalizável (slug) + QR Code pra download
- Dashboard de tendência: acessos, produtos mais vistos, cliques em "Pedir agora", ranking por período (7/15/30 dias), tamanhos mais pedidos e feed de atividade recente
- Central de notificações com contador e "marcar como lido"
- Busca global (command palette) com atalho ⌘K/Ctrl+K — encontra produtos e qualquer página do painel, com histórico de buscas recentes
- Modo escuro em todo o painel e suporte via WhatsApp direto pelo menu de conta

**Vitrine pública**
- Catálogo sem login, com filtros por marca/solado/modalidade e paginação
- Fluxo de pedido no WhatsApp — testado numa matriz de dispositivos e navegadores, incluindo os webviews do Instagram e do próprio WhatsApp
- Estoque sempre atualizado (sem cache) e isolado dos acessos do próprio revendedor testando a loja

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, Cache Components) — painel do revendedor e catálogo público no mesmo codebase
- [Supabase](https://supabase.com/) — Postgres com RLS, autenticação e storage de imagens
- [Tailwind CSS v4](https://tailwindcss.com/) — estilização mobile-first
- [Vercel](https://vercel.com/) — hospedagem e deploy

## Status

Projeto de validação — o fluxo essencial de ponta a ponta (cadastro do revendedor até o pedido no WhatsApp do cliente final) está completo e funcional desde o MVP, e o painel do revendedor segue evoluindo desde então: dashboard de tendência, notificações, busca global, redesign da identidade visual com modo escuro e correções de segurança/auth. Cobrança/pagamento, OAuth e importação de catálogo (planilha/Yupoo) seguem deliberadamente fora do escopo por enquanto.
