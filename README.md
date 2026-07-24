<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Storage-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

# Vitrinoo

Revendedor de chuteiras importadas geralmente vende o catálogo espalhado em pastas do Google Drive, fotos soltas no WhatsApp ou num álbum do Yupoo em mandarim — nada disso passa confiança pro cliente final, e cada pedido vira uma troca manual de mensagens perguntando tamanho, preço e disponibilidade.

**Vitrinoo** transforma esse catálogo informal num catálogo inteligente em português: produtos com fotos, tamanhos disponíveis, preços em BRL, e um botão que já abre o WhatsApp do revendedor com o pedido pronto — modelo, tamanho e preço inclusos. O cliente escolhe e manda a mensagem. Sem cadastro, sem app, sem o revendedor precisar estar online pra fechar a venda.

## Como funciona

**Revendedor** cria conta, cadastra os produtos (fotos comprimidas automaticamente, tamanhos, preço, marca) e recebe um link único do seu catálogo — com QR Code pra divulgar no Instagram, WhatsApp Status ou onde for. Também acompanha métricas básicas: acessos, produtos mais vistos e cliques em "Pedir agora".

**Cliente final** abre o link, filtra por marca/solado/modalidade, escolhe o tamanho de um produto disponível e clica em pedir — o WhatsApp abre com a mensagem já formatada, pronta pra enviar.

## O que já está pronto (v1.0 — MVP)

- Conta multi-tenant com isolamento por Row-Level Security (cada revendedor só vê os próprios dados)
- Onboarding: identidade da loja (nome, logo, cor) e configuração do WhatsApp
- Link personalizável (slug) + QR Code pra download
- CRUD completo de produtos: até 5 fotos por produto com compressão automática, controle de tamanho/estoque
- Catálogo público sem login, com filtros por marca/solado/modalidade e paginação
- Fluxo de pedido no WhatsApp — testado numa matriz de dispositivos e navegadores, incluindo os webviews do Instagram e do próprio WhatsApp
- Dashboard com métricas de acessos, produtos mais vistos e cliques em "Pedir agora"

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, Cache Components) — painel do revendedor e catálogo público no mesmo codebase
- [Supabase](https://supabase.com/) — Postgres com RLS, autenticação e storage de imagens
- [Tailwind CSS v4](https://tailwindcss.com/) — estilização mobile-first
- [Vercel](https://vercel.com/) — hospedagem e deploy

## Status

Projeto de validação — o MVP (v1.0) está completo e funcional, cobrindo o fluxo essencial de ponta a ponta: cadastro do revendedor até o pedido no WhatsApp do cliente final. Cobrança/pagamento, OAuth e importação de catálogo (planilha/Yupoo) ficaram deliberadamente fora do escopo desta fase.
