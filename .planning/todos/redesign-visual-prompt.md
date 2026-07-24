# Prompt — Redesign de Identidade Visual do Vitrinoo

> Cole este prompt para um modelo de IA (Claude, Gemini, ChatGPT) ou um designer.
> Objetivo: elevar a identidade visual do painel admin e da vitrine pública sem alterar fluxos, funcionalidades ou a cor de marca.

---

## Quem é o Vitrinoo

O Vitrinoo é um micro-SaaS brasileiro para revendedores de calçados importados (principalmente chuteiras). O revendedor cadastra produtos no painel administrativo e compartilha um link da sua vitrine pública pelo WhatsApp ou Instagram. O cliente final — sempre no celular — escolhe o produto, seleciona o tamanho e dispara um pedido pronto direto no WhatsApp do revendedor. Sem cadastro. Sem fricção.

O produto existe em dois mundos visuais:
1. **Painel admin** — onde o revendedor gerencia sua loja (dashboard, produtos, configurações)
2. **Vitrine pública** — onde o cliente final compra (página da loja + detalhe do produto)

---

## O problema que precisa ser resolvido

Analisei o app diretamente no browser e descrevo exatamente o que vejo em cada tela:

### Tela de Login (split-screen)
A estrutura é boa — lado esquerdo branco com o formulário, lado direito azul `#0D21A1` com texto. Mas o lado direito está completamente vazio de identidade: só dois parágrafos de texto sobre fundo liso azul. Parece uma apresentação de PowerPoint, não um produto. Não há nenhuma imagem, mockup, ilustração ou elemento visual que mostre ao usuário o que ele vai criar.

O logotipo é um quadrado azul sólido sem nenhum conteúdo — literalmente um placeholder de 28×28px preenchido com a cor de marca. Ao lado do nome "Vitrinoo" em preto, a impressão é de inacabado.

### Dashboard (painel admin)
O fundo da tela tem um efeito de borda azul desbotada nas extremidades. O efeito existe mas parece acidental, não intencional. Ou deveria ser mais pronunciado e bonito, ou não deveria estar lá.

Os 4 cards de estatística (Total, Disponíveis, Esgotados, Acessos) são visualmente idênticos: borda cinza, fundo branco, ícone cinza, número em preto. "Esgotados" e "Disponíveis" têm exatamente o mesmo peso visual — são informações com significados opostos.

A sidebar esquerda tem fundo branco igual ao conteúdo — não há separação visual entre navegação e página. Os três itens de menu são texto cinza com ícone cinza. O item ativo tem um retângulo azul claro de destaque, que é a única diferenciação.

### Configurações da loja
O campo "Cor de destaque" exibe um pequeno retângulo do color picker nativo do sistema operacional — o controle mais feio e menos consistente da interface inteira. Parece um campo de formulário de anos 90 dentro de um produto que deveria ser moderno.

### Formulário de Novo Produto
A tela inteira é branco e cinza. Seções divididas por cards brancos com bordas cinzas, labels cinzas, inputs cinzas. Visualmente é indistinguível de um formulário de cadastro de qualquer sistema interno corporativo. Não há nenhuma cor, nenhuma textura, nenhuma personalidade visual.

### Onboarding
Card branco centralizado em fundo cinza liso. Ausência total de identidade da marca — sem logo, sem cor, sem nenhum elemento visual que faça o usuário sentir que está criando algo. O primeiro contato real com o produto é completamente genérico.

---

## O que NÃO mudar

- A cor de marca `#0D21A1` (azul escuro) e preto `#000000` são fixas e não negociáveis
- Nenhum fluxo funcional muda — só a aparência visual
- A vitrine pública continua totalmente pública, sem login
- Nenhum asset pago ou fonte proprietária
- Nada que prejudique performance em celular com 4G

---

## Direções para o redesign

### 1. Crie uma identidade para o logotipo
O placeholder azul precisa virar um símbolo real. O conceito do produto é "vitrine" — uma janela de exibição. Pense em um ícone que remeta a prateleira, vitrine de loja, janela de produto, ou um "V" estilizado que transmita organização e profissionalismo. Deve funcionar em 28×28px (sidebar) e em tamanhos maiores.

### 2. Dê vida à paleta sem trocar a cor de marca
O azul `#0D21A1` precisa de companhia. Proponha:
- Um tom de azul mais claro e vibrante para hover/destaque
- Uma cor de acento secundária — âmbar/dourado (vendas), verde-esmeralda (disponibilidade) ou índigo mais escuro
- Neutros com personalidade: cinzas com leve tonalidade fria (azul-acinzentado) em vez de cinzas puros, dando coerência com a marca

### 3. Diferencie visualmente o painel admin da vitrine pública
O painel é para o revendedor — deve sentir-se profissional, organizado, eficiente (Linear, Vercel).
A vitrine pública é para o cliente final — deve sentir-se comercial, visual, envolvente (catálogo de moda).
Hoje os dois têm exatamente o mesmo visual genérico.

### 4. Eleve o split-screen do login
O lado direito azul precisa mostrar o produto em ação. Uma possibilidade: um mockup de celular com a vitrine pública renderizada dentro, ou uma composição de cards de produto flutuando sobre o azul. O objetivo é que o novo revendedor veja imediatamente o que vai criar.

### 5. Dê caráter à sidebar
A barra lateral precisa de um background diferente do conteúdo. Duas direções possíveis:
- **Sidebar clara:** `#F1F4FF` (azul muito claro) com bordas levemente azuladas
- **Sidebar escura (recomendado):** `#0A1680` (azul escuro) com ícones e textos brancos — cria contraste forte e identidade mais premium

### 6. Faça os formulários respirarem
- Seções com background levemente azulado (`#F7F9FF`) em vez de branco puro
- Labels em azul marinho sutil em vez de cinza
- Bordas de input com tom levemente azulado em repouso, não só no foco
- Divisores entre seções com azul muito claro em vez de cinza neutro

### 7. Crie um fundo com caráter no onboarding
O fundo cinza liso precisa de personalidade. Opções:
- Padrão geométrico sutil (dot grid) em azul quase transparente sobre fundo quase branco
- Gradiente diagonal do azul de marca para índigo escuro
- Composição abstrata de formas que remeta ao conceito de vitrine

### 8. Defina uma linguagem visual para os cards de estatística
Cada card precisa de uma cor semântica própria — não só no ícone, mas no fundo do ícone, na borda do card e na cor do número:
- **Total de produtos** → azul (cor de marca)
- **Disponíveis** → verde (disponibilidade, estoque)
- **Esgotados** → laranja/vermelho (urgência, atenção)
- **Acessos** → roxo ou âmbar (analytics, tráfego)

---

## Tom visual desejado

Referências de mercado que comunicam o que o Vitrinoo precisa ser:
- **Linear** — limpeza, precisão, dark sidebar, premium
- **Stripe** — sofisticação, tipografia forte, dados bem apresentados
- **Shopify** — tom comercial, acolhedor, feito para vendedores
- **Nuvemshop** — mercado brasileiro, vendas, cores vivas com profissionalismo

O Vitrinoo não é um banco. Não é um ERP. É uma **vitrine** — precisa brilhar.
