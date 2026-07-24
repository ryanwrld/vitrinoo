# Prompt: Design System completo do Vitrinoo

Prompt pronto para colar num gerador de design (Claude), pedindo um design system moderno e completo para o Vitrinoo, mantendo a cor de marca e listando explicitamente o que não deve ser feito. Gerado em 2026-07-16, a partir do contexto consolidado das auditorias de UI/UX desta sessão.

---

## Contexto do produto

Você vai desenhar o design system completo do **Vitrinoo**, um micro-SaaS que transforma o catálogo informal de um revendedor de chuteiras importadas (hoje espalhado em Yupoo, pastas do Drive ou fotos soltas no WhatsApp) em uma vitrine online profissional. O revendedor cadastra produtos — fotos, tamanhos disponíveis, preço em reais — num painel administrativo. O cliente final navega a vitrine pública, quase sempre a partir de um link compartilhado no WhatsApp ou no Instagram, em um celular. Ele escolhe um modelo e um tamanho e dispara uma mensagem de pedido já pronta direto no WhatsApp do revendedor — sem cadastro, sem fricção, sem precisar o revendedor estar online no momento.

## Objetivo deste pedido

Quero um **design system completo e moderno**, entregue como tokens reutilizáveis e especificações de componente por estado — não como mockups soltos ou imagens estáticas. O resultado precisa ser diretamente implementável em uma stack Next.js + Tailwind CSS v4, onde tokens de design viram `@theme` no CSS.

## Restrição não-negociável de marca

A cor de marca é o **azul `#0D21A1`** (ação primária, links, elementos de destaque), com **preto `#000000`** como cor de apoio. Essa paleta foi fixada recentemente e não pode ser substituída. Você pode — e deve — propor uma paleta _derivada_ dela: neutros, tons semânticos de sucesso/erro/aviso, variações mais claras e mais escuras do azul de marca para estados de hover/foco/desabilitado. O `#0D21A1` continua sendo a cor primária e mais reconhecível do produto em qualquer variação que você propuser.

## Escopo — cobertura completa de telas

Preciso do design system aplicado a **todas** as telas do sistema, painel admin e vitrine pública:

**Painel administrativo**

- Login, cadastro, "esqueci minha senha", redefinir senha
- Onboarding (wizard de configuração inicial: nome da loja, logo, cor, frase de apresentação, WhatsApp, template de mensagem)
- Dashboard (cards de estatística, produtos recentes, mais visualizados, cliques no WhatsApp)
- Lista de produtos (busca, filtros, paginação)
- Formulário de novo produto / editar produto (identificação, solado/categoria, preço, visibilidade, tamanhos, upload de fotos, descrição)
- Configurações da loja (identidade visual, editor de link/slug, painel de QR code)
- Navegação (sidebar desktop + menu mobile)
- Componentes transversais: notificações toast, diálogos de confirmação

**Vitrine pública**

- Página inicial da loja (hero + grid de produtos + filtros/busca + paginação)
- Página de detalhe do produto (galeria de fotos, seleção de tamanho, preço, botão "Pedir agora" via WhatsApp, botão "Copiar pedido")
- Estados vazios (loja sem produtos, filtro sem resultado)
- Página de erro 404 (produto ou loja não encontrada)

## O que entregar, por camada

- **Tokens**: paleta completa (com semântica: sucesso, erro, aviso, neutro), escala tipográfica, escala
  espaçamento, raio de borda, elevação/sombra, duração e curva de transição/animação.
- **Componentes, com todos os estados** (default, hover, foco, desabilitado, erro, carregando): botão primário e secundário, campo de formulário, badge/pill de status, card de produto, modal/diálogo, toast, item de navegação ativo/inativo, tabela/lista, estado vazio, skeleton de carregamento.
- **Formato de saída**: tokens em JSON ou CSS custom properties, mais a especificação visual de cada componente por estado, com indicação de como isso mapearia para `@theme` do Tailwind CSS v4.

## Problemas do design atual que você precisa resolver

- Hierarquia visual fraca entre ação primária e secundária (botões com o mesmo peso visual)
- Quase nenhuma animação ou transição — a interface parece estática
- Componentes nativos do navegador sem estilização (`<select>`, `<dialog>`) — visual inconsistente entre plataformas
- Estados vazios genéricos, só texto sem nenhuma ilustração
- Onboarding e login sem identidade visual forte — não parecem parte do mesmo produto

---

## O que NÃO deve ser feito

- **Não troque a cor de marca.** `#0D21A1` (azul) e `#000000` (preto) continuam sendo a base — proponha variações derivadas, nunca uma paleta substituta.
- **Não adicione fricção ao fluxo de pedido via WhatsApp.** É o núcleo de valor do produto: o cliente final escolhe tamanho e manda a mensagem em um toque, sem cadastro. Nenhuma mudança visual pode adicionar passos, exigir login do cliente final, ou atrasar esse fluxo.
- **Não exija cadastro/login na vitrine pública.** A vitrine é e continua sendo uma rota pública sem autenticação.
- **Não redesenhe a arquitetura de informação ou os fluxos existentes.** Este é um pedido de linguagem visual (cor, tipografia, espaçamento, componentes, animação) — não uma repriorização de funcionalidades, não uma proposta de novas telas ou de remoção de telas existentes.
- **Não dependa de assets pagos ou licenciados** (ilustrações, ícones, fontes proprietárias) que exijam contratação externa — o produto é um MVP de baixo orçamento.
- **Não sacrifique performance mobile por efeito visual.** O público final acessa majoritariamente em celular, muitas vezes em conexão 4G instável, a partir de um link do WhatsApp/Instagram. Evite animações pesadas, parallax, imagens não otimizadas ou qualquer coisa que atrase o primeiro carregamento.
- **Não torne a interface genérica.** O resultado não pode parecer "template de SaaS qualquer" — precisa refletir a identidade de um catálogo inteligente e profissional, não um painel administrativo intercambiável com qualquer outro produto.
