# Pesquisa de Funcionalidades

**Domínio:** Ferramentas de catálogo/vitrine + "peça pelo WhatsApp com um clique" (micro-SaaS brasileiro, nicho de revenda de chuteiras/tênis importados)
**Pesquisado em:** 2026-07-10
**Confiança:** MÉDIA-ALTA (conjuntos de funcionalidades de concorrentes BR confirmados a partir de múltiplas fontes públicas; comportamento de revendedor específico do nicho corroborado, mas não a partir de entrevistas primárias com usuários)

## Panorama de Funcionalidades

Este nicho tem três categorias de referência que se sobrepõem, todas convergindo para o mesmo loop central (navegar → escolher variante → tocar → mensagem do WhatsApp pré-preenchida → vendedor fecha o negócio no chat):

1. **Ferramentas BR de "catálogo digital para WhatsApp"** — Gopage, Vendizap, Vou Pedir, Linqui. Concorrentes diretos, mesmo perfil de cliente (revendedor BR não-técnico), mesmo modelo mental de "sem carrinho, sem gateway" no tier de entrada.
2. **Ferramentas globais de "comércio social via chat"** — Catlog (Nigéria/África), o próprio Catálogo Business nativo do WhatsApp. Mesmo mecanismo central, camadas de monetização/pagamento mais maduras uma vez que escalam além do MVP.
3. **Ferramentas de link-in-bio** — Linktree, Beacons, Stan Store. Não são catálogo-first, mas são a referência para tabela de requisitos básicos de slug/QR/analytics, já que o link da vitrine pública do Vitrinoo se comporta como um link de bio para vendedores Instagram-first.

Quase todos os concorrentes acima começaram exatamente onde o MVP do Vitrinoo mira: catálogo + botão do WhatsApp, sem pagamento, sem carrinho. Pagamento, automação de estoque, multi-vendedor e descrições por IA foram todos adicionados depois, após tração — o que valida a própria divisão de MVP/nice-to-have do projeto em vez de contradizê-la.

### Requisitos Básicos (Usuários Esperam Isso)

Funcionalidades que os usuários assumem que existem. Sem elas, o produto parece incompleto ou o revendedor volta para fotos cruas no WhatsApp/Instagram.

| Funcionalidade | Por Que É Esperada | Complexidade | Notas |
|---------|--------------|------------|-------|
| CRUD de produtos com fotos, preço, variante (tamanho) | Todo concorrente (Gopage, Vendizap, Catlog, Catálogo nativo do WA) lidera com isso; é a razão de o produto existir | MÉDIA | Já no escopo. Fotos são o principal fator de profissionalismo percebido vs. despejo de fotos cruas no WhatsApp |
| Seleção de tamanho/variante antes da ação de contato | Confirmado no Vendizap ("variações disponíveis") e na UX geral de revenda de calçados; tamanhos direcionam disponibilidade, não apenas SKU | MÉDIA | O escopo já trata isso como a conversão central — corretamente priorizado como P0 |
| "Pedir agora" com um toque que abre o WhatsApp pré-preenchido | Esta é a proposta de valor inteira da categoria em todo concorrente BR encontrado (Gopage, Vou Pedir, Vendizap todos lideram com "pedido chega no WhatsApp") | MÉDIA | A correção do encodeURIComponent + link profundo wa.me é o detalhe técnico de maior risco em toda a categoria — o copy de marketing de todo concorrente centra-se em isso funcionar impecavelmente |
| Indicação de esgotado por variante | O Vendizap chama explicitamente o controle de estoque ("evita vender algo que não está mais disponível") de central, não opcional | BAIXA-MÉDIA | Confirma que o instinto de "marcar esgotado em massa" do escopo está certo, apenas deveria existir por variante e não só por produto |
| Link compartilhável + branding básico (logo, nome, cor de destaque) | Todo concorrente personaliza nome/logo da loja; essa é a promessa de "vitrine profissional" vs. redes sociais cruas | BAIXA | O escopo cobre isso (config da loja) |
| Vitrine mobile-first responsiva | Todos os concorrentes BR têm o cliente-alvo descobrindo o link via bio do Instagram/status do WhatsApp no celular; desktop é secundário | MÉDIA | Já sinalizado no PROJECT.md como inegociável |
| Filtros (marca, categoria, ou equivalente) uma vez que o catálogo passe de 20-30 itens | Confirmado indiretamente: concorrentes enfatizam "catálogo organizado" e recursos de busca/destaque (tags "Mais Vendidos" do Catlog) uma vez que os catálogos crescem além de uma ou duas telas | BAIXA-MÉDIA | Os filtros de marca/solado/modalidade do escopo mapeiam diretamente para isso |
| Slug personalizado / link curto compartilhável | Paralelo direto à categoria link-in-bio (Linktree/Beacons) — um link memorável e personalizável é o que se cola em uma bio do Instagram | BAIXA | O escopo cobre isso |
| QR code para o link da vitrine | Confirmado como padrão mesmo no tier mais barato/adjacente de link-in-bio (Beacons oferece isso grátis); revendedores usam QR em contextos físicos (feiras, embalagens) mesmo sendo esse um nicho digital-first — baixo custo para incluir, esperado uma vez presente | BAIXA | O escopo cobre isso — corretamente escopado como MVP, não nice-to-have, já que é quase sem custo gerar a partir de um slug existente |
| Métricas básicas de visita/clique | Confirmado como linha de base em ferramentas de link-in-bio e catálogo igualmente (Beacons "analytics básico", ferramentas adjacentes ao Vendizap) — vendedores querem saber "alguém está olhando isso" | BAIXA | As "métricas básicas" do escopo (acessos, mais vistos, cliques WA) combinam precisamente com a norma da categoria — não vá além disso no MVP |
| Cadastro/login simples (sem necessidade de OAuth) | Confirmado via fluxos de onboarding do Gopage/Vendizap — nenhuma evidência de que algum concorrente BR restrinja a entrada atrás de OAuth; email/senha ou magic link é a norma para esse público não-técnico | BAIXA | Escolha do escopo validada |

### Diferenciais (Vantagem Competitiva)

Funcionalidades que diferenciam o produto dentro *deste nicho específico* (revenda de chuteiras importadas) em vez da categoria genérica de ferramentas de catálogo. Não obrigatórias para a viabilidade do MVP, mas onde o Vitrinoo pode vencer uma vez validado.

| Funcionalidade | Proposta de Valor | Complexidade | Notas |
|---------|-------------------|------------|-------|
| Taxonomia específica do nicho (tipo de solado / modalidade / marca como campos de primeira classe, não "categoria" genérica) | Ferramentas de catálogo genéricas (Gopage, Vendizap) usam categorias livres; um schema específico de tênis/chuteira (solado society/campo/futsal, marca, modalidade) é uma cunha real para esse comprador exato, que hoje improvisa essa informação em legendas de fotos | BAIXA (já é decisão de schema, não novo desenvolvimento) | O escopo já embute isso no CRUD — este *é* o diferencial, apenas não rotulado como tal. Vale declarar isso explicitamente nos requisitos para que não seja genericizado mais tarde |
| UX português-first, nativa em BRL, formato de número do WhatsApp BR | Ferramentas genéricas internacionais de comércio via WhatsApp (Catlog, Catálogo nativo do WA) não são localizadas BR em moeda/formatação de número/tom de copy; os players BR existentes (Gopage/Vendizap) são o conjunto de comparação real, e são generalistas (qualquer categoria de produto), não específicos de chuteiras | BAIXA | Este é um diferencial de posicionamento mais do que uma funcionalidade; ainda assim vale listar já que direciona decisões de UI/copy (já refletido no copy do PROJECT.md) |
| Assistente de importação de foto-fonte do Yupoo | Dor real confirmada: Yupoo é literalmente um site chinês de galeria de fotos que fornecedores usam como seu catálogo atacadista (não um canal de venda) — revendedores BR hoje tiram print/baixam fotos manualmente de galerias do Yupoo em interface mandarim e re-fazem upload no Instagram/WhatsApp uma por uma. Uma importação "cole o link do álbum Yupoo → puxe as fotos" removeria diretamente a tarefa mais repetitiva desse fluxo de trabalho específico | MÉDIA-ALTA | Corretamente adiado (o escopo lista como nice-to-have) — nenhuma evidência de que algum concorrente faz isso; é genuinamente sob medida para esse nicho e vale priorizar logo após a validação do MVP, já que endereça a dor literal citada em "O Que É Isto" |
| Duplicar produto (criar variante/colorway rápido) | Não visto como funcionalidade explicitamente nomeada no marketing dos concorrentes, mas implícito em como catálogos de tênis/chuteiras funcionam — o mesmo modelo em múltiplas colorways/solados é a norma, e reinserir todos os campos por colorway é atrito único de catálogos com muitos SKUs quase idênticos (mais verdadeiro aqui do que em catálogos de produtos genéricos) | BAIXA | O escopo corretamente posiciona isso como should-have; diferente de ferramentas de catálogo genéricas, este nicho tem densidade de variantes de SKU incomumente alta (mesmo tênis, N solados x N cores), então compensa mais cedo do que um revendedor genérico precisaria |
| Múltiplos catálogos (pronta entrega vs sob encomenda) | Confirmado como diferencial de tier pago em outro lugar (os tiers Premium/Profissional do Gopage vendem exatamente isso — múltiplos catálogos independentes) — valida isso como valor real e monetizável, não uma ideia inventada | MÉDIA | Corretamente adiado para pós-MVP; isso é literalmente como um concorrente estabelecido (Gopage) monetiza seus planos pagos, o que valida isso como candidato legítimo a tier Pro mais tarde |
| Importação em massa via CSV | Precedente real de concorrente (ferramentas de catálogo em massa/atacado miram distribuidores que já têm planilhas), mas o usuário-alvo do Vitrinoo é um revendedor individual gerenciando dezenas de SKUs manualmente, não centenas via exportação de ERP — o valor é real mas chega depois, uma vez que os vendedores tenham volume suficiente de SKU para sentir a dor do CRUD | MÉDIA | Corretamente adiado; não é requisito básico para este segmento de cliente específico (gerido individualmente, mobile-first) mesmo sendo requisito básico para o segmento atacado de ferramentas adjacentes |

### Antifuncionalidades (Comumente Solicitadas, Frequentemente Problemáticas)

Funcionalidades que os concorrentes eventualmente adicionam (uma vez escalados) ou que vendedores não-técnicos podem pedir, mas que seriam ativamente prejudiciais construir durante a validação do MVP para este produto específico.

| Funcionalidade | Por Que É Solicitada | Por Que É Problemática | Alternativa |
|---------|---------------|-----------------|-------------|
| Gateway de pagamento / checkout / carrinho | Todo concorrente "adulto" (Catlog, tiers mais altos do Vendizap, "Carrinho" nativo do WA para negócios maiores) eventualmente adiciona isso, então vendedores podem perguntar "cadê o botão de pagar" | Para este MVP, a proposta de valor inteira é *fechar o negócio no WhatsApp exatamente como o vendedor já faz* — adicionar checkout antes de validar a demanda adiciona escopo massivo (preocupações PCI-adjacentes, reembolsos, reconciliação) para um segmento (produtos importados/possivelmente de mercado paralelo, cultura de dinheiro/pix-no-chat) que prefere amplamente negociar preço/frete no chat | Manter o WhatsApp como 100% do checkout; revisitar pagamentos apenas depois que "N revendedores conseguem ≥1 pedido" seja comprovado — exatamente como o PROJECT.md já declara |
| Pipeline completo de pedidos/CRM (status de pedido, histórico, base de clientes) | Vendizap/Catlog ambos constroem em direção a isso conforme amadurecem ("gestão de pedidos"); revendedores lidando com muitos chats podem genuinamente querer isso | Isso transforma o Vitrinoo em um mini-ERP; o ciclo de vida real do pedido acontece dentro do próprio WhatsApp (um sistema que o Vitrinoo não possui e não deveria tentar espelhar) — construir um rastreador de pedidos que não é a fonte real da verdade (a conversa do WhatsApp) cria um segundo ledger sempre desatualizado | Métricas permanecem no nível de pageview/clique (conforme escopo); se o rastreamento de pedidos se tornar uma necessidade real mais tarde, deve se conectar a eventos de "clique enviado", não tentar modelar o estado de pedido que o Vitrinoo não pode observar |
| Sincronização de estoque em tempo real com fornecedor (níveis de estoque Yupoo/1688) | Tentador uma vez que a importação do Yupoo existe — "por que não sincronizar o estoque automaticamente também" | Galerias do Yupoo são álbuns de fotos sem API de estoque; fornecedores mudam estoque via negociação no WeChat, não dados estruturados. Tentar "sincronizar" convida disponibilidade silenciosamente errada, o que viola diretamente o alerta crítico #4 do próprio projeto (estoque deve refletir em segundos, nunca ficar obsoleto) | Marcação manual de esgotado/disponível, rápida e óbvia no painel do vendedor, permanece autoritativa — nunca auto-inferir de uma fonte raspada |
| Contas multi-vendedor/equipe, logins de sub-vendedor | Os tiers mais altos do Gopage vendem explicitamente isso ("Cadastro de Vendedores", cada um com seu próprio catálogo/WhatsApp) — um upsell plausível | O cliente-alvo do Vitrinoo hoje é um revendedor solo/pequeno, não um distribuidor atacadista com equipe de vendas; construir auth/permissões multi-vendedor agora resolve um problema que este segmento ainda não tem, a custo real de complexidade (papéis, roteamento de vitrine por vendedor) | Adiar até/a menos que pesquisa de cliente pós-MVP mostre que revendedores operam equipes de distribuição, não lojas solo |
| Descrições de produto geradas por IA | O Gopage já comercializa isso ("IA para criar descrições") — um pedido fácil de "por que não temos isso" uma vez visto em um concorrente | Inflação de escopo pura para o MVP; descrições de produto neste nicho são curtas e formulaicas (modelo/solado/tamanho/preço) — o diferencial é completude de dados e fotos, não prosa | Fornecer um template/padrões simples por categoria em vez de IA generativa; revisitar apenas se o feedback do usuário especificamente sinalizar copywriting como um bloqueador |
| Integração com a API oficial WhatsApp Business/Cloud API (respostas automáticas por bot, chatbot) | A versão "adulta" desta categoria (ferramentas aisensy, wati, sleekflow encontradas na pesquisa) é construída inteiramente em torno da Plataforma WhatsApp Business paga | Requer verificação Meta Business, aprovação de template de mensagem, e custos por conversa — completamente desproporcional para um MVP de tier gratuito, revendedor solo não-técnico cujo pedido inteiro é "abrir um link wa.me com texto pré-preenchido" | Manter os links profundos `wa.me`/`api.whatsapp.com` (zero API, zero aprovação, zero custo) — é isso que todo concorrente BR direto (Gopage, Vendizap, Vou Pedir) também faz neste tier |
| Catálogo nativo do WhatsApp (recurso próprio de catálogo de produto da Meta) como substituto da vitrine do Vitrinoo | É gratuito e embutido no WhatsApp Business já — "por que construir um produto inteiro para isso" | O Catálogo WA nativo não tem taxonomia BR-específica, sem branding/slug/QR personalizado, UX ruim de navegação multi-foto para itens ricos em variantes (até 500 itens planos, sem filtragem por tamanho, sem analytics), e é geralmente reconhecido (nas fontes de pesquisa) como "sem carrinho, só chat" com descoberta limitada — essa é exatamente a lacuna que o Vitrinoo preenche, não uma razão para abandonar a ideia | Posicionar o Vitrinoo como a camada de navegação/filtragem/branding *na frente da* conversa do WhatsApp, não um concorrente do próprio WhatsApp |

## Dependências de Funcionalidades

```
Cadastro/login do revendedor
    └──requires──> nada (fundação)

Configuração de WhatsApp (número + template)
    └──requires──> Cadastro/login

CRUD de produtos (fotos, tamanhos, preço, marca, solado, categoria)
    └──requires──> Cadastro/login

Vitrine pública com filtros
    └──requires──> CRUD de produtos (precisa de produtos para filtrar)
    └──requires──> Configuração da loja (nome, logo, cor — para branding)

Seleção de tamanho + botão "Pedir agora"
    └──requires──> CRUD de produtos (tamanhos como dado estruturado)
    └──requires──> Configuração de WhatsApp (número + template)
    └──requires──> Vitrine pública (precisa de um lugar para renderizar)

Link personalizável (slug) + QR Code
    └──requires──> Vitrine pública (slug roteia até ela)

Métricas básicas (acessos, produtos vistos, cliques WA)
    └──requires──> Vitrine pública (nada a medir sem ela)
    └──requires──> Botão "Pedir agora" (fonte do evento de clique)

Dashboard com métricas + produtos recentes
    └──requires──> Métricas básicas
    └──requires──> CRUD de produtos

--- Camada pós-MVP ---

Duplicar produto ──enhances──> CRUD de produtos
Marcar esgotado em massa ──enhances──> CRUD de produtos (estoque por variante)
Importação CSV ──enhances──> CRUD de produtos (caminho de criação em massa)
Importação Yupoo ──enhances──> CRUD de produtos (caminho de criação em massa, foto-first)
Múltiplos catálogos ──requires──> CRUD de produtos + Vitrine pública (precisa ser multiplicado, implicações de roteamento/slug não triviais)
Plano Pro / tier pago ──requires──> dados estáveis de uso do tier Free para precificar contra (conflita com "sem billing no MVP" se construído prematuramente)
```

### Notas de Dependência

- **Seleção de tamanho + botão "Pedir agora" requer CRUD de produtos, Configuração de WhatsApp e Vitrine pública:** este é o único momento de conversão pelo qual o produto inteiro existe — não pode ser construído ou testado isoladamente; todos os três pré-requisitos precisam estar prontos primeiro, e este deveria ser o último pedaço do MVP montado, testado exaustivamente (conforme o próprio alerta #1 do PROJECT.md) antes de qualquer outra coisa ser lançada.
- **Métricas básicas requerem o clique de "Pedir agora" como fonte de evento:** o rastreamento de clique não é uma funcionalidade separada para sequenciar em paralelo — é uma camada de instrumentação que precisa ser conectada ao próprio botão de pedido, então planeje-a na mesma fase que o fluxo de pedido, não como um complemento tardio.
- **Múltiplos catálogos conflita com um modelo simples de slug-por-vendedor:** se isso for adicionado depois (como o modelo de tiering do Gopage sugere que deveria ser, eventualmente), o design de URL/roteamento na fase de MVP deveria deixar espaço para o `slug` mapear para um-de-N catálogos em vez de assumir vendedor == vitrine 1:1. Vale uma nota leve de future-proofing na arquitetura mesmo que a funcionalidade em si seja adiada.
- **Plano Pro / tier pago conflita com "sem billing no MVP":** não deixe que funcionalidades diferenciais (múltiplos catálogos, importação CSV, analytics avançado) sejam construídas como gated-por-plano desde o primeiro dia — isso reintroduz a complexidade de billing pela porta dos fundos. Construa-as primeiro como funcionalidades simples; gate atrás de um plano apenas depois que a decisão de monetização do PROJECT.md for de fato tomada.

## Definição de MVP

### Lançar Com (v1)

Produto minimamente viável — corresponde à própria lista de requisitos "Ativos" do projeto, validada contra as normas de categoria acima. Nenhuma adição necessária; a pesquisa de categoria confirma que essa lista não está nem super nem sub-escopada.

- [ ] Cadastro/login do revendedor (email/senha) — fundação, nenhum concorrente restringe isso além do necessário
- [ ] CRUD completo de produtos (fotos, tamanhos, preço, marca, solado, categoria, modalidade) — o núcleo inegociável da categoria
- [ ] Configuração da loja (nome, logo, cor, frase) — combina com a promessa de "vitrine profissional" que todo concorrente lidera
- [ ] Configuração de WhatsApp (número validado + template com variáveis) — o mecanismo de conversão inteiro
- [ ] Vitrine pública com filtros (marca, solado, modalidade) — requisito básico uma vez que o catálogo exceda um punhado de itens
- [ ] Seleção de tamanho + botão "Pedir agora" (wa.me + encodeURIComponent) — o único fluxo que nunca pode quebrar
- [ ] Slug personalizável + QR Code — custo marginal quase zero uma vez que o slug exista, esperado pela categoria
- [ ] Métricas básicas (acessos, produtos mais vistos, cliques WA) — linha de base em toda categoria adjacente (link-in-bio e ferramentas de catálogo igualmente)
- [ ] Dashboard com métricas + produtos recentes — junta tudo para o hábito de checagem diária do vendedor

### Adicionar Após Validação (v1.x)

Funcionalidades para adicionar uma vez que "revendedores criam uma vitrine e recebem ≥1 pedido pelo WhatsApp" seja comprovado — corresponde à própria lista SHOULD/NICE do projeto, sequenciada por quanto cada uma remove diretamente o atrito descoberto no nicho.

- [ ] Granularidade de rastreamento de clique além da linha de base do MVP (funis de clique por produto) — adicionar uma vez que o uso do dashboard mostre que os vendedores realmente checam métricas regularmente
- [ ] Duplicar produto — adicionar uma vez que vendedores relatem que reinserir variantes quase idênticas de colorway/solado é tedioso (muito provável dada a densidade de SKU deste nicho)
- [ ] Marcar esgotado em massa (por variante, não só por produto) — adicionar assim que qualquer vendedor relatar estoque ficando obsoleto em muitos tamanhos de uma vez
- [ ] Assistente de importação Yupoo — adicionar cedo neste tier; endereça diretamente a dor exata citada em "O Que É Isto" do PROJECT.md (galerias Yupoo em mandarim) e é o diferencial mais forte específico do nicho encontrado nesta pesquisa
- [ ] Importação CSV — adicionar uma vez que o tamanho do catálogo de um vendedor ou necessidade de migração (ex.: vindo de uma planilha) torne a entrada manual o gargalo visível

### Consideração Futura (v2+)

Funcionalidades para adiar até que product-market fit e decisões de monetização sejam tomadas — confirmado pelo precedente de concorrentes de que elas chegam apenas depois que uma ferramenta escalou além do estágio "acabou de lançar".

- [ ] Múltiplos catálogos por revendedor — adiar até que o modelo de roteamento/slug possa ser redesenhado deliberadamente (ver nota de dependência acima); o precedente do Gopage mostra que isso é valor real de tier Pro, não esforço desperdiçado, apenas sequenciado errado se construído cedo
- [ ] Analytics avançado (funis, retenção, cohort) — adiar; mesmo concorrentes maduros (Beacons "analytics avançado") restringem isso atrás de tiers pagos, e os contadores básicos do MVP são suficientes para provar a hipótese central
- [ ] Plano Pro / tier pago + billing — explicitamente adiado pelo próprio PROJECT.md; o precedente de categoria (Gopage ~R$40-240/ano, Vendizap ~R$80/mês) dá âncoras de precificação futura úteis uma vez que isso seja revisitado
- [ ] Notificação por e-mail de produto esgotado — baixo valor relativo ao custo; vendedores já vivem no WhatsApp, não no e-mail, para esse fluxo de trabalho

## Matriz de Priorização de Funcionalidades

| Funcionalidade | Valor para o Usuário | Custo de Implementação | Prioridade |
|---------|------------|---------------------|----------|
| Seleção de tamanho + botão "Pedir agora" | ALTO | MÉDIA | P1 |
| CRUD de produtos (fotos, tamanhos, preço, marca, solado) | ALTO | MÉDIA | P1 |
| Configuração de WhatsApp (número + template) | ALTO | BAIXA | P1 |
| Vitrine pública com filtros | ALTO | MÉDIA | P1 |
| Slug + QR Code | MÉDIO | BAIXA | P1 |
| Métricas básicas | MÉDIO | BAIXA | P1 |
| Dashboard resumo | MÉDIO | BAIXA | P1 |
| Assistente de importação Yupoo | ALTO (específico do nicho) | ALTA | P2 |
| Duplicar produto | MÉDIO | BAIXA | P2 |
| Marcar esgotado em massa (por variante) | MÉDIO | BAIXA-MÉDIA | P2 |
| Importação CSV | MÉDIO | MÉDIA | P2 |
| Múltiplos catálogos | MÉDIO | MÉDIA-ALTA | P3 |
| Analytics avançado | BAIXO (para este estágio) | MÉDIA-ALTA | P3 |
| Plano Pro / billing | BAIXO (pré-validação) | ALTA | P3 |
| Gateway de pagamento / checkout | BAIXO (ativamente contra o posicionamento) | ALTA | Antifuncionalidade |
| Pipeline completo de CRM/pedidos | BAIXO (duplica o próprio WhatsApp) | ALTA | Antifuncionalidade |

**Legenda de prioridade:**
- P1: Obrigatório para o lançamento
- P2: Desejável, adicionar quando possível
- P3: Bom ter, consideração futura

## Análise de Funcionalidades de Concorrentes

| Funcionalidade | Gopage (BR, catálogo digital) | Vendizap (BR, catálogo + WhatsApp) | Catlog (Nigéria, comércio via WhatsApp) | Catálogo Business nativo do WhatsApp | Nossa Abordagem |
|---------|-------------------------------|--------------------------------------|--------------------------------------|-----------------------------------|--------------|
| Catálogo de produtos c/ fotos | Sim, produtos ilimitados + assistente de descrição por IA | Sim, com "variações" | Sim, com vídeos + tags "Mais Vendidos" | Sim, até 500 itens, sem filtragem por variante | Igualar o núcleo, adicionar taxonomia específica do nicho (solado/modalidade) como campos estruturados, não tags livres |
| Pedido via WhatsApp | Sim, mecanismo central | Sim, mecanismo central ("pedido chega no WhatsApp") | Sim, mais pagamento in-app opcional | Sim (apenas chat, sem pré-preenchimento estruturado de uma UI de navegação) | Igualar, com template pré-preenchido + teste rigoroso de encodeURIComponent (barra mais alta que a maioria, conforme alertas do PROJECT.md) |
| Controle de estoque/variante | Não enfatizado no marketing | Sim, "controle de estoque" explícito | Sim, "carrinho abandonado" e rastreamento de estoque | Sem conceito de estoque além de remoção manual | Igualar a abordagem do Vendizap: disponibilidade por variante, marcar esgotado rápido |
| Slug/link personalizado | Sim (domínio próprio: gopage.bio ou catalogo.com.br) | Sim | Sim ("compartilhe o link da sua loja em qualquer lugar") | Link fixo wa.me/catalog, não personalizável | Igualar — slug é requisito básico |
| QR Code | Não confirmado no material de marketing | Não confirmado no material de marketing | Não confirmado | Não | Incluir mesmo assim (o escopo já faz) — custo quase zero, combina com a norma da categoria adjacente de link-in-bio mesmo que concorrentes diretos negligenciem isso; potencial diferencial menor |
| Analytics | Não enfatizado (recurso de SEO/palavra-chave mencionado em vez disso) | Não enfatizado | Sim, analytics detalhado de vendas/clientes | Não | Igualar o escopo de métricas básicas; não sobre-investir, já que mesmo concorrentes financiados mantêm isso raso neste tier |
| Múltiplos catálogos | Sim, escalonado (1 / 3 / 10 catálogos por plano) | Não confirmado | Não diretamente, mas multicanal | Não | Adiar para tier pós-MVP exatamente como o Gopage faz — valida isso como uma alavanca legítima de tier pago futuro |
| Pagamentos | Não (tier puro de catálogo + WhatsApp) | Menciona "opções de pagamento" em tier mais alto | Sim, diferencial central (moedas locais + internacionais) | Limitado (algumas regiões) | Explicitamente fora de escopo para o MVP, combina com o próprio tier de entrada do Gopage/Vendizap, não é uma decisão fora da curva |
| Âncora de preço | R$19,90-39,90/mês | R$79,80/mês | ₦6.500-12.500/mês (~R$40-75) | Grátis (recurso nativo do WhatsApp) | Âncora útil para um eventual tier Pro: o mercado BR se estabiliza em torno de R$20-80/mês para esta categoria |

## Fontes

- [Gopage — Catálogo Digital e planos](https://gopage.bio/) — concorrente direto BR, precificação/tiering confirmados (tiers R$19,90-39,90/mês, 1/3/10 catálogos por plano)
- [Gopage — Planos](https://gopage.bio/planos/)
- [Vendizap — Plataforma para Vender pelo WhatsApp](https://www.vendizap.com/) — concorrente direto BR, controle de estoque e preço (R$79,80/mês) confirmados
- [Vendizap — Catálogo Online](https://www.vendizap.com/catalogo-online)
- [Vou Pedir — Catálogos interativos para Venda por WhatsApp](https://www.voupedir.net/) — concorrente direto BR, mecânica "pedir agora" confirmada
- [Catlog — Manage your business without the chaos](https://www.catlog.shop/) — análogo internacional (Nigéria/África), mostra o caminho de evolução pós-MVP (pagamentos, analytics, campanhas)
- [TechCabal — Built around WhatsApp, Catlog wants to improve social commerce in Nigeria](https://techcabal.com/2022/04/07/catlog-wants-to-improve-social-commerce-in-nigeria/)
- [Ajuda oficial do Catálogo Business do WhatsApp](https://faq.whatsapp.com/405903568419894/) — linha de base do recurso nativo, confirma o limite de 500 itens e o modelo apenas-chat sem carrinho
- [whatsform.com — How to use WhatsApp catalog for your products](https://whatsform.com/blog/whatsapp-catalog-products/)
- [Comparação Beacons vs Linktree (Jotform Blog)](https://www.jotform.com/blog/beacons-vs-linktree/) — normas de categoria link-in-bio para slug/QR/analytics
- [QRLynx — Link-in-Bio QR Code + Built-in Analytics Guide](https://qrlynx.com/blog/link-in-bio-qr-code-guide)
- [Yupoo Explained — How China's Photo-Album Trading Sites Work](https://www.replica-jerseys.com/blog/yupoo-explained) — confirma que o Yupoo é uma ferramenta de galeria de fotos/catálogo, não uma plataforma transacional, validando o ponto de dor da "importação Yupoo" no nicho
- [repfindsarchive.com — Yupoo Sellers Guide 2026](https://repfindsarchive.com/blog/yupoo-sellers-guide)
- Contexto geral de sourcing/margem de revenda de calçados BR: [Avacy — Onde Comprar Tênis para Revender](https://www.avacy.com.br/blog/post/onde-comprar-tenis-para-revender.html), [Nuvemshop — Como escolher o melhor fornecedor de tênis](https://www.nuvemshop.com.br/blog/fornecedor-de-tenis/)

---
*Pesquisa de funcionalidades para: micro-SaaS brasileiro de catálogo/vitrine para revendedores de chuteiras de futebol importadas (checkout apenas via WhatsApp)*
*Pesquisado em: 2026-07-10*
