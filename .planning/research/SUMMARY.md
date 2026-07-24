# Resumo da Pesquisa do Projeto

**Projeto:** Vitrinoo — micro-SaaS brasileiro de catálogo/vitrine para revendedores de chuteiras de futebol importadas
**Domínio:** SaaS mobile-first de dois lados (painel admin + vitrine pública sem login) com repasse de pedido via WhatsApp
**Pesquisado em:** 2026-07-10
**Confiança:** MÉDIA (ALTA em fatos de tecnologia, MÉDIA em padrões de funcionalidades/arquitetura, MÉDIA-ALTA em armadilhas baseado em pesquisa competitiva + melhores práticas de UX)

---

## Resumo Executivo

Vitrinoo é uma ferramenta de coordenação de mercado para revendedores não-técnicos no nicho competitivo de revenda de chuteiras de futebol no Brasil. O sucesso depende inteiramente de um momento de conversão: um cliente chegando em um link de vitrine (compartilhado via Instagram/WhatsApp), selecionando um tamanho, e tocando em "pedir agora" para abrir o WhatsApp com uma mensagem pré-preenchida. Qualquer atrito nesse fluxo mata o produto — e a pesquisa confirma três riscos sobrepostos que devem guiar o sequenciamento inicial das fases: (1) o link profundo do WhatsApp é surpreendentemente frágil (formatação de telefone, codificação, compatibilidade com navegador in-app), (2) o isolamento multi-tenant via RLS é poderoso mas silencioso quando quebrado, e (3) a vitrine pública nunca deve ser bloqueada por middleware de auth, o que é uma garantia estrutural no Next.js apenas se aplicado no nível de roteamento, não no código.

A stack recomendada (Next.js 16 + Supabase + Vercel Pro, **não** a v14 + Hobby originalmente sugerida) é moderna, apropriada em custo para a escala de lançamento de "dezenas", e alinha-se com como concorrentes maduros nesta categoria (Gopage, Vendizap) fizeram bootstrap. O escopo de funcionalidades está bem validado contra concorrentes e não está nem super nem sub-escopado para o MVP. A arquitetura segue padrões multi-tenant comprovados mas impõe restrições estruturais rígidas (isolamento de rotas, modelo de dados RLS-first, construção de link no lado do cliente) que devem ser embutidas durante as fases de fundação, não retrofitadas.

**Conclusão para o roadmap:** A cadeia de dependências é profunda (auth → camada de dados RLS → CRUD admin → vitrine → geração de link WhatsApp → métricas). Cada fase deve verificar armadilhas específicas antes que a próxima fase comece. Não adie nada sobre o fluxo do link do WhatsApp para "refinamento depois" — é o núcleo inegociável, e testá-lo exaustivamente (formatos de telefone específicos do Brasil, nomes de produto acentuados, navegadores Android/iOS/in-app) é um bloqueador para a prontidão de lançamento.

---

## Principais Descobertas

### Stack Recomendada

Comece com **Next.js 16.2.x + React 19.2.x + Tailwind CSS 4.x + Supabase + Vercel Pro ($20/mês)**.

O escopo original recomendava Next.js 14, que está duas majors atrás (versão estável atual: 16.2.10 na data desta pesquisa). Começar na 14 significa herdar imediatamente APIs depreciadas e migrá-las dentro de poucos meses. Mais criticamente: o modelo **Cache Components** do Next 16 (cache opt-in via diretiva `"use cache"`) torna a vitrine pública dinâmica por padrão, o que é perfeito para o requisito crítico do projeto (frescor de estoque em segundos, nunca minutos). Com a 14, o modelo de cache implícito trabalha contra esse requisito.

O escopo original usava o Vercel Hobby (gratuito), que viola os próprios termos de uso justo da Vercel para produtos comerciais (Vitrinoo é orientado a receita mesmo pré-monetização). Isso deve ser sinalizado: o Vercel Pro ($20/mês) é o tier de produção correto desde o primeiro dia.

**Tecnologias core com justificativa:**

- **Next.js 16.2.x** (App Router) — React full-stack. Turbopack padrão (builds 2-5× mais rápidos). O modelo Cache Components dá frescor de estoque por padrão.
- **React 19.2.x** — Exigido pelo Next 16; dependência empacotada, não uma decisão separada.
- **Tailwind CSS 4.x** — Config CSS-first, breakpoints mobile-first (combina com o mandato "vitrine mobile-first"). Scaffold padrão do `create-next-app@latest`.
- **Supabase** (@supabase/supabase-js 2.110.x + @supabase/ssr 0.12.x) — Postgres + Auth (email/senha) + Storage em um projeto. Row-Level-Security (RLS) mapeia de forma limpa para isolamento multi-tenant. Chave anon para leituras da vitrine pública evita middleware de auth nessa rota.
- **Vercel (tier Pro)** — Hospedagem Next.js zero-config, middleware de edge para checagem de auth do `/admin`, CDN de imagens.
- **browser-image-compression (2.0.2)** — Obrigatório, não opcional. Comprimir no lado do cliente antes do upload para atender os requisitos de "upload rápido" + limite de 5MB. As Transformações de Imagem server-side do Supabase são apenas do plano Pro (não no tier gratuito), então o lado do cliente é a única abordagem viável para o MVP.
- **Suporte:** zod (validação), react-hook-form (formulários), sonner (feedback de toast), qrcode (geração de QR), clsx/tailwind-merge (estilização condicional), lucide-react (ícones)

Ver STACK.md para versões detalhadas de bibliotecas, instruções de instalação e padrões de integração.

### Funcionalidades Esperadas

As funcionalidades estão bem escopadas e validadas contra três categorias de referência sobrepostas: ferramentas de catálogo BR (Gopage, Vendizap, Vou Pedir), ferramentas globais de comércio social (Catlog, Catálogo Business do WhatsApp), e ferramentas de link-in-bio (Linktree, Beacons). A análise de concorrentes confirma que o nicho convergiu para "catálogo + botão do WhatsApp, sem pagamento, sem carrinho" no tier de entrada — exatamente onde o MVP do Vitrinoo se posiciona.

**Requisitos básicos (usuários esperam isso — a ausência de qualquer um mata a viabilidade do produto):**

- CRUD de produtos com fotos, preço, tamanhos/variantes
- Seleção de tamanho antes da ação de pedido
- "Pedir agora" com um toque abrindo o WhatsApp pré-preenchido
- Indicação de esgotado por variante
- Link compartilhável + branding básico
- Vitrine mobile-first responsiva
- Filtros (marca, tipo de solado, modalidade)
- Slug personalizado para compartilhamento
- QR code para o link
- Métricas básicas de visita/clique
- Cadastro simples por email/senha (sem OAuth)

**Deveria ter (diferenciais — vantagem competitiva uma vez que o MVP valide):**

- Taxonomia específica do nicho (tipo de solado, modalidade, marca como campos de primeira classe)
- UX português-first, nativa em BRL
- Assistente de importação Yupoo (funcionalidade específica do nicho de maior alavancagem)
- Duplicar produto para criação de variante
- Múltiplos catálogos (pronta entrega vs sob encomenda)

**Adiar completamente (v2+ ou nunca):**

- Gateway de pagamento/checkout — ativamente contrário à proposta de valor
- CRM completo de pedidos — duplica o próprio WhatsApp
- Sincronização de estoque em tempo real — o Yupoo não tem API
- Contas multi-vendedor/equipe — o alvo é o revendedor solo
- Descrições de produto por IA — curtas e formulaicas aqui
- Integração com a API WhatsApp Business — desproporcional para o MVP

Ver FEATURES.md para a cadeia de dependência detalhada e análise de concorrentes.

### Abordagem de Arquitetura

Usar multi-tenancy de schema compartilhado com isolamento aplicado por RLS (um schema Postgres, múltiplos revendedores, políticas no nível de linha previnem leituras/escritas entre tenants). Isso é mais simples do que schema-por-tenant na escala de "dezenas" e mais barato no tier gratuito do Supabase.

Dois domínios de autenticação rodam no mesmo codebase mas são estritamente separados: (1) rotas `/admin/**` são autenticadas (login do revendedor) e protegidas por middleware do Next.js, (2) `/loja/[slug]` é pública (sem checagem de auth jamais) e servida via chave anon do Supabase. O matcher do middleware deve ser escopado apenas para `/admin/:path*` — um matcher amplo com uma allowlist de exceções públicas é uma cilada que regride silenciosamente.

Três padrões arquiteturais importam: (1) RLS de schema compartilhado com isolamento por owner, (2) renderização pública resolvida por slug usando cliente de chave anon, (3) frescor disparado por mutação (sem cache na vitrine).

**Componentes principais:**

1. Auth do admin — Supabase email/senha + middleware do Next.js escopado ao `/admin`
2. Modelo de dados — Supabase Postgres + RLS aplicando fronteiras multi-tenant
3. CRUD de produtos — Server Actions, cliente autenticado
4. Pipeline de mídia — Compressão no lado do cliente → Supabase Storage → next/image
5. Configuração da loja — Número de WhatsApp + template, branding
6. Vitrine pública — Server Component, cliente de chave anon, fetch sem cache
7. Gerador de link do WhatsApp — Função puramente client-side, sem round-trip de servidor
8. Métricas/eventos — Inserção leve fire-and-forget

Ver ARCHITECTURE.md para padrões e antipadrões detalhados.

### Armadilhas Críticas

A pesquisa validou todas as 10 armadilhas originais e identificou 9 adicionais críticas. Principais prioridades:

1. **A formatação de número de telefone do `wa.me` é mais rígida do que "valide isso"** — Entrada crua produz links quebrados. Normalizar para formato E.164 (apenas dígitos, código do país, sem espaços) no momento de salvar. Mostrar confirmação ao usuário. Testar unitariamente contra todos os casos malformados.

2. **`encodeURIComponent` sozinho não garante uma mensagem funcional** — Codificação dupla produz saída embaralhada. Construir a string completa em texto puro uma vez, depois codificar exatamente uma vez. Testar com acentos em português + quebras de linha reais em dispositivo.

3. **Rota da vitrine pública acidentalmente bloqueada por middleware de auth** — Um matcher de middleware amplo começa silenciosamente a exigir auth. Correção: o matcher de middleware é apenas `/admin/:path*` (allowlist de rotas protegidas). Adicionar teste de fumaça automatizado em todo deploy.

4. **Configuração incorreta do RLS do Supabase é silenciosa, não barulhenta** — RLS ausente habilita vazamento completo de dados. Esquecer políticas retorna resultados vazios (parece bug de frontend). Habilitar RLS em toda tabela na criação. Testar isolamento com duas contas semeadas.

5. **Pílulas de tamanho esgotado precisam de mais do que CSS `pointer-events: none`** — Estado obsoleto deixa a pílula aparecendo disponível. Desabilitar na camada de dados, revalidar no momento do clique. Combinar múltiplas propriedades CSS (cinto e suspensórios).

Armadilhas críticas adicionais: corrida de unicidade de slug (constraint de BD necessária), tamanho de upload de imagem/EXIF (normalização cliente + servidor), compatibilidade com navegador in-app, expiração silenciosa de token de auth (persistência de rascunho).

Ver PITFALLS.md para estratégias de prevenção detalhadas.

---

## Implicações para o Roadmap

O ordenamento de fases é guiado por: (1) cadeia de dependência do FEATURES.md, (2) prevenção de armadilhas (cada fase deve ser lançada com validações específicas). Caminho crítico: fundação → CRUD admin → renderização da vitrine → geração de link do WhatsApp. Teste exaustivo do WhatsApp é um bloqueador para o lançamento do MVP.

### Fase 1: Fundação & Camada de Dados Multi-Tenant

**Justificativa:** Auth e isolamento RLS são fundacionais. A configuração incorreta de RLS é silenciosa, então a validação precoce é crítica.

**Entrega:**
- Configuração do projeto Supabase (schema, Auth, Storage)
- Políticas RLS para todas as tabelas
- Middleware escopado apenas para `/admin/:path*` (garantia estrutural para a rota pública)
- Constraint de BD para unicidade de slug

**Evita:** Configuração incorreta de RLS, bloqueio da rota pública, condições de corrida de slug

**Critérios de aceitação:**
- [ ] RLS habilitado em toda tabela; teste de isolamento entre dois tenants passa
- [ ] Matcher do middleware é apenas `/admin/:path*`; teste de fumaça (curl `/loja/test-slug` sem auth) passa
- [ ] Slug tem constraint UNIQUE
- [ ] Ambiente local do Supabase CLI funcionando

---

### Fase 2: Painel Admin & Configuração da Loja

**Justificativa:** Uma vez que auth/RLS funcionem, estabelecer a superfície de configuração da loja. Expõe a entrada de maior risco: número de telefone do WhatsApp.

**Entrega:**
- Configurações da loja (número de WhatsApp, template de mensagem, branding)
- Shell do dashboard admin (autenticado, apenas revendedor)
- Normalização de número de telefone (específico do Brasil: E.164, apenas dígitos, código do país)
- Configuração de slug da loja com validação
- Notificações toast ao salvar/excluir

**Evita:** Formatação de número de telefone, feedback ausente

**Critérios de aceitação:**
- [ ] Testes unitários para normalização de telefone (todos os casos malformados)
- [ ] Teste manual em dispositivo: número real de WhatsApp, prévia do link, confirmado correto
- [ ] Slug duplicado rejeitado com mensagem amigável
- [ ] Feedback de toast em toda ação admin

---

### Fase 3: CRUD de Produtos & Pipeline de Mídia

**Justificativa:** Com auth/config em vigor, construir a ferramenta admin primária. Estabelecer o padrão de upload de imagem (compressão no lado do cliente obrigatória, normalização EXIF).

**Entrega:**
- CRUD de produtos (criar, editar, excluir)
- Gerenciamento de tamanho/variante
- Upload de foto com compressão no lado do cliente (browser-image-compression)
- Normalização EXIF no lado do servidor
- Integração do next/image com o Supabase Storage
- Dashboard de produtos

**Evita:** Tamanho de upload irrestrito, rotação EXIF, imagens quebradas

**Critérios de aceitação:**
- [ ] Fazer upload de uma foto real de câmera de celular; verificar que o tamanho final armazenado está comprimido e exibe correta a orientação
- [ ] Progresso de compressão mostrado antes do upload
- [ ] Limite rígido de 5MB aplicado antes da compressão
- [ ] URL de imagem quebrada mostra placeholder de fallback

---

### Fase 4: Vitrine Pública & Filtragem

**Justificativa:** Com produtos no BD, renderizar o catálogo. Estabelece padrões para acesso a dados na rota pública e filtragem (parâmetros de query da URL, links compartilháveis).

**Entrega:**
- Vitrine pública (`/loja/[slug]`)
- Grid de produtos com imagens responsivas
- Filtros persistidos em parâmetros de query da URL (compartilháveis)
- Paginação (~20 produtos por carregamento)
- Skeleton de carregamento

**Evita:** Filtros não na URL, renderização não filtrada, imagens quebradas

**Critérios de aceitação:**
- [ ] URL filtrada carregada nova reproduz a mesma visualização
- [ ] Filtros funcionam entre navegadores/dispositivos
- [ ] Paginação carrega os próximos 20 sem reload completo
- [ ] Imagens carregam progressivamente

---

### Fase 5: Seleção de Tamanho & Fluxo de Pedido do WhatsApp

**Justificativa:** FASE CRÍTICA. O momento mais importante único. Tudo converge aqui. Bloqueador rígido para o lançamento do MVP.

**Entrega:**
- UI de seleção de tamanho (pílulas para tamanhos disponíveis, esgotado distinto + inselecionável)
- Revalidação no momento do clique
- Geração de link do WhatsApp (normalizar telefone + codificar mensagem exatamente uma vez)
- Rastreamento de clique no WhatsApp (fire-and-forget)
- Cópia de mensagem/número de fallback

**Evita:** Todas as armadilhas de formatação do WhatsApp, seletividade de esgotado, falhas de navegador in-app

**Matriz de teste obrigatória (antes do encerramento):**
- Android: Chrome, Samsung Internet, Firefox
- iOS: Safari, Chrome
- iOS/Android: navegador in-app do Instagram, navegador in-app do WhatsApp
- Testar com: números reais de WhatsApp BR, nomes acentuados, template multi-linha

**Critérios de aceitação:**
- [ ] WhatsApp abre com mensagem pré-preenchida em toda combinação de teste
- [ ] Caracteres acentuados exibem corretamente (não embaralhados)
- [ ] Nenhuma codificação dupla ou artefatos percentuais
- [ ] Esgotado não pode ser selecionado (clique rápido, Enter no teclado)
- [ ] Rastreamento de clique registrado (fire-and-forget)
- [ ] Fallback de copiar-para-área-de-transferência funciona se o link falhar
- [ ] Dashboard mostra métricas de clique no WhatsApp corretamente

---

### Fase 6: Dashboard de Métricas & Analytics Admin

**Justificativa:** Agregar eventos rastreados em um dashboard simples para o revendedor. Manter mínimo (contadores básicos, produtos top) — analytics avançado é v2+.

**Entrega:**
- Dashboard de eventos (pageviews, produtos top, contagem de cliques no WhatsApp)
- Lista de produtos mais vistos
- Resumo de produtos recentes
- Série temporal simples

---

### Fase 7: QR Code & Funcionalidades de Link Compartilhável

**Justificativa:** Geração de QR de baixo custo. Revendedores usam QR em contextos físicos (feiras, embalagens).

**Entrega:**
- Geração de QR code a partir da URL do slug
- Imagem de QR para download
- Exibição de QR nas configurações do admin + rodapé da vitrine

---

## Avaliação de Confiança

| Área | Confiança | Notas |
|------|------------|-------|
| **Stack** | **ALTA** | Versões de tecnologia verificadas contra o registro npm, blog do Next.js, documentação oficial. Distinção Vercel Hobby/Pro confirmada. Uma ressalva: os Cache Components do Next 16 são novos (out/2025) — ainda sem experiência real de MVP. |
| **Funcionalidades** | **MÉDIA-ALTA** | Concorrentes analisados publicamente. Funcionalidades cruzadas contra normas de categoria. Sem entrevistas diretas com usuários, então validado contra concorrentes, não clientes. Requisitos básicos dificilmente errados; diferenciais inferidos de pontos de dor. |
| **Arquitetura** | **MÉDIA** | Padrões são padrão/bem documentados. Plano específico sólido para a escala de "dezenas". Incerteza: até que ponto alavancar os Cache Components para performance. Suposições de escalonamento para "100 mil+ visualizações/dia" são especulativas. |
| **Armadilhas** | **MÉDIA** | Todas as armadilhas validadas contra fontes de pesquisa. Mecânicas técnicas (RLS, middleware) são de confiança ALTA. Armadilhas de UX são MÉDIA (melhores práticas + observação, não teste com usuários). MAIS BAIXA: compatibilidade com navegador in-app — deve ser validada por teste manual. |
| **Geral** | **MÉDIA** | Stack é ALTA. Funcionalidades bem pesquisadas. Padrões são padrão mas a cadeia de dependência rígida concentra o risco. O risco de execução está nos detalhes (correção do RLS, teste do WhatsApp, compatibilidade mobile). |

### Lacunas a Endereçar

1. **Compatibilidade com navegador in-app do WhatsApp** — Confiança BAIXA (nenhuma especificação oficial, comportamento varia por versão do app). Deve ser validada durante a Fase 5 via dispositivos reais ou um laboratório de dispositivos em nuvem.

2. **Casos extremos de número de telefone além do Brasil** — A normalização é focada no BR. Confirmar que funciona apenas para o formato "55DDXXXXXXXXX". Futuro: validar para outras regiões se o produto expandir.

3. **Limites de escalonamento do tier gratuito do Supabase** — Assume "dezenas" de revendedores. Se a adoção exceder as expectativas, ter o caminho de upgrade para o Supabase Pro pronto (monitorar Fase 6-7).

4. **Projeções de custo de armazenamento de imagem** — A compressão no lado do cliente reduz o risco, mas validar o custo durante a Fase 3 em contagens realistas de produtos.

5. **Diferencial de importação Yupoo** — Adiado para v1.x, identificado como o de maior alavancagem específico do nicho. Durante o planejamento de v1.x: investigar disponibilidade de API do Yupoo, UX de seleção de galeria, implicações de ToS de scraping.

6. **Transparência de custo do Vercel Pro** — O STACK.md identifica o Vercel Pro ($20/mês) como obrigatório. Verificar essa suposição de custo com o usuário antes de lançar; se "$0" for uma restrição rígida, o Cloudflare Pages é uma alternativa (ao custo de perder a integração zero-config).

---

## Fontes

### Primárias (confiança ALTA)

- **Registro npm** — Tecnologias de stack verificadas: Next.js 16.2.10, React 19.2.7, Tailwind 4.3.2, pacotes Supabase, browser-image-compression, sharp
- **Blog oficial do Next.js 16** — Modelo Cache Components, Turbopack, mudanças que quebram compatibilidade, requisitos de versão
- **Documentação da Vercel** — Restrição comercial do Plano Hobby, requisitos do tier Pro
- **Documentação oficial do Supabase** — RLS, Auth (@supabase/ssr), Storage, restrição de plano Pro nas Transformações de Imagem
- **Central de Ajuda do WhatsApp** — Funcionalidades do Catálogo Business, limite de 500 itens, modelo apenas-chat
- **STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md** — Saídas de pesquisa deste projeto

### Secundárias (confiança MÉDIA)

- **Análise de concorrentes** — Sites públicos do Gopage, Vendizap, Vou Pedir, Catlog
- **Busca na web (múltiplas fontes)** — Links profundos do WhatsApp, normalização de telefone, padrões de RLS, compressão de imagem, compatibilidade com navegador in-app
- **Baymard Institute** — Melhores práticas de UX de e-commerce
- **Guia de multi-tenant do Next.js** — Padrões de arquitetura
- **Melhores práticas de RLS do Supabase** — Templates de política, erros comuns

### Terciárias (confiança BAIXA/ANEDÓTICA)

- **Compatibilidade do wa.me com navegador in-app (WebView do Instagram)** — Sem especificação oficial; relatos de comportamento variam. Precisa validação durante a Fase 5.
- **Tratamento de orientação EXIF** — Implementação varia entre navegadores; planejar normalizar no lado do servidor.

---

*Pesquisa concluída em: 2026-07-10*
*Sintetizado por: agente gsd-synthesizer*
*Pronto para criação de roadmap: SIM*
