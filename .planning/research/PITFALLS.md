# Pesquisa de Armadilhas (Pitfalls)

**Domínio:** Micro-SaaS de catálogo/vitrine + link profundo WhatsApp (multi-tenant, mercado de revenda brasileiro)
**Pesquisado em:** 2026-07-10
**Confiança:** MÉDIA (cruzado entre 2-3 fontes web independentes por tópico; não existe documentação oficial da API do WhatsApp para o comportamento do `wa.me`, então algumas afirmações específicas de navegador permanecem BAIXA/anedótica — sinalizado inline)

## Validação das 10 Armadilhas Conhecidas do Autor

Todas as 10 são modos de falha reais e bem documentados nesta categoria. Avaliação de cada uma contra a pesquisa:

| # | Armadilha do autor | Validada? | Notas |
|---|---|---|---|
| 1 | Botão de pedido ativo sem tamanho selecionado | **Confirmada, crítica** | Pesquisa Baymard/UX sobre CTAs de catálogo: "CTA não esclarecendo status de estoque" é um erro top listado — combina diretamente. |
| 2 | Pílulas de esgotado ainda clicáveis | **Confirmada, crítica** | Explicitamente citada em pesquisa de UX de e-commerce: "se um tamanho não está disponível, ele não deveria ser selecionável — nem deveria desperdiçar um clique." Apenas `pointer-events: none` é insuficiente — ver armadilha expandida abaixo. |
| 3 | Slugs duplicados sem validação | **Confirmada** | Condição de corrida clássica de unicidade — precisa de constraint no nível do BD, não só checagem client-side (expandida abaixo). |
| 4 | Imagem quebrada sem fallback | **Confirmada** | Lacuna de robustez padrão; agravada aqui por URLs do Supabase Storage que podem dar 404 após exclusão/regeneração. |
| 5 | Filtros não persistidos na URL | **Confirmada, bem documentada** | A pesquisa sinaliza explicitamente isso: "JavaScript muda a lista de produtos sem criar URLs persistentes" como um erro top de catálogo, quebra links compartilháveis/filtrados — exatamente o caso de uso de compartilhamento no WhatsApp/Instagram aqui. |
| 6 | Tamanho de upload de imagem irrestrito | **Confirmada** | Agrava-se em uma segunda armadilha menos óbvia: orientação EXIF (ver abaixo) — o limite de tamanho sozinho não resolve problemas visuais/de performance. |
| 7 | Número de WhatsApp não validado/não formatado | **Confirmada, e subestimada** | Bugs de formatação do mundo real são mais específicos do que "valide isso" — ver armadilha expandida sobre as regras exatas de número do `wa.me` abaixo. |
| 8 | Sem paginação na vitrine | **Confirmada** | Combina com a pesquisa de performance de catálogo; também tem um ângulo específico de mobile (grids ricos em imagem e não limitados são muito piores em rede celular). |
| 9 | Ações admin sem feedback de toast | **Confirmada** | Lacuna padrão de UX de admin SaaS, amplificada aqui porque o usuário primário é não-técnico e vai assumir que o clique em "esgotado" não fez nada. |
| 10 | Expiração silenciosa de sessão perdendo trabalho | **Confirmada** | Armadilha comum do Supabase Auth — a expiração de JWT é silenciosa por padrão a menos que o cliente escute `onAuthStateChange`/falhas de refresh. |

A lista do autor é precisa e deve ser tratada como o piso, não o teto. Abaixo estão os mecanismos específicos por trás de cada uma (para que a prevenção seja precisa, não apenas "tenha cuidado") mais várias armadilhas adicionais que não estavam na lista original.

## Armadilhas Críticas

### Armadilha 1: A formatação do número de telefone do `wa.me` é mais rígida e específica do que "valide isso"

**O que dá errado:**
O revendedor insere seu número de WhatsApp no painel admin no formato que naturalmente digita — `(11) 99999-9999`, `11999999999`, `+55 11 99999-9999`, ou com um `0` extra à frente. Se essa string crua for concatenada em `https://wa.me/{number}`, o link ou abre o chat errado, ou abre a tela de contato-não-encontrado do WhatsApp, ou falha em direcionar automaticamente para um contato específico e em vez disso abre o WhatsApp sem destinatário (quebrando silenciosamente o fluxo de conversão inteiro).

**Por que acontece:**
O `wa.me` não tem feedback de validação oficial — um número malformado não dá erro visível, apenas produz um link de chat quebrado ou genérico. Desenvolvedores assumem que "qualquer dígito funciona" porque durante o teste no próprio número deles acontece de funcionar.

**Como evitar:**
- Armazenar o número em uma forma normalizada canônica no banco de dados (estilo E.164, apenas dígitos, sempre com código do país): `5511999999999`.
- Na entrada, remover tudo exceto dígitos, depois aplicar normalização específica do Brasil: se o número não começar com `55`, prefixá-lo; remover um `0` à frente do DDD se presente (comum quando usuários copiam um formato de discagem local); validar o comprimento (DDD 2 dígitos + número de 8 ou 9 dígitos + `55` = 12 ou 13 dígitos no total).
- Nunca armazenar ou usar `+`, espaços, traços ou parênteses no valor usado para construir a URL `wa.me` — sabe-se que isso quebra o link mesmo que pareça "correto" para um humano.
- Mostrar ao revendedor uma prévia/confirmação ao vivo do número formatado ("Vamos usar +55 11 99999-9999 — confirma?") já que este é o único ponto de falha para todo pedido no produto.

**Sinais de alerta:**
- Nenhum utilitário/teste dedicado de formatação de telefone no código — o número é passado direto de um input de formulário para o template de URL.
- Nenhum teste unitário cobrindo: número com parênteses/traços, número com zero à frente, número sem código do país, número com espaços extras copiados e colados do próprio WhatsApp.

**Fase para abordar:**
Fase cobrindo configuração de WhatsApp/loja (configurações do revendedor) — deve ser lançada com uma função de normalização e testes antes que a fase do botão "Pedir agora" da vitrine comece, já que esse botão depende deste valor estar correto.

---

### Armadilha 2: `encodeURIComponent` sozinho não garante uma mensagem funcional — a estrutura do template também importa

**O que dá errado:**
Texto em português com acentos (ç, ã, é) codifica bem via `encodeURIComponent`, mas duas falhas relacionadas são comuns: (1) construir a query string por concatenação ingênua (`text=` + string crua) em vez de usar `encodeURIComponent` na mensagem *inteira* incluindo quebras de linha, o que quebra templates multi-linha; (2) codificação dupla (codificar uma string que já foi codificada anteriormente, ex.: se `useSearchParams` do Next.js ou um round-trip de servidor já decodificou/recodificou a URL), produzindo saída embaralhada estilo `%2520`, que aparece como códigos percentuais literais na caixa de mensagem do WhatsApp.

**Por que acontece:**
A construção de mensagem tipicamente flui assim: string de template com placeholders `{modelo}`/`{tamanho}`/`{preço}` → substituição de variável → `encodeURIComponent` → anexado a `https://wa.me/{number}?text=`. Se a substituição acontece *depois* da codificação, ou se o preço é formatado com um símbolo de moeda/espaço não-quebrável que não é considerado, a saída ou fica quebrada ou aparece estranha (ex.: `R\$` com barra invertida literal se o escaping do template não for tratado, ou `Pre%C3%A7o` corretamente codificado mas visualmente confuso durante o debug).

**Como evitar:**
- Construir a mensagem completa em texto puro primeiro (com quebras de linha reais, acentos, preço "R$") como uma única string JS, depois chamar `encodeURIComponent` exatamente uma vez na string final montada.
- Nunca codificar campos individuais separadamente e concatenar os resultados — codificar depois da interpolação, não antes.
- Testar com uma string de checklist manual contendo todo caractere acentuado usado no vocabulário de produtos/solados em português (ã, ç, é, í, ó, ú, õ, â) mais o prefixo literal de moeda `R$` e uma quebra de linha real, abrindo o link resultante em um dispositivo real antes de lançar.
- Ficar atento a mensagens que também contenham `&`, `#`, ou `?` em um futuro campo de texto livre (ex.: notas customizadas) — eles precisam passar pela mesma codificação de passagem única ou vão truncar a query string.

**Sinais de alerta:**
- Lógica de construção de mensagem espalhada por múltiplas funções/componentes em vez de um único utilitário "construir mensagem do WhatsApp".
- Nenhum fixture de teste com nomes de produtos reais acentuados em português (ex.: "Chuteira Society Preço Único").

**Fase para abordar:**
Fase de fluxo de conversão da vitrine (a fase do botão "Pedir agora" + link profundo WhatsApp) — esta é a fase mais importante conforme o PROJECT.md; deve incluir teste automatizado + teste manual em dispositivo antes do encerramento da fase.

---

### Armadilha 3: Pílulas de esgotado precisam de mais do que `pointer-events: none` para serem verdadeiramente inselecionáveis

**O que dá errado:**
Uma pílula de tamanho esgotado é estilizada como desabilitada e recebe `pointer-events: none`, mas em dispositivos touch isso nem sempre previne seleção baseada em foco (ferramentas de teclado/acessibilidade, ou uma corrida de duplo toque rápido antes que o estilo desabilitado/estado JS se estabeleça), e — mais comumente — o *estado* por trás de "este tamanho está esgotado" pode estar obsoleto: se o estoque muda no backend enquanto um cliente tem a página aberta, a pílula renderizada no cliente ainda pode aparecer como disponível mesmo que `pointer-events` tenha sido corretamente aplicado na renderização inicial.

**Por que acontece:**
Desenvolvedores tratam "desabilitado" como puramente uma preocupação de CSS/visual, esquecendo que também é uma preocupação de frescor de dados. O próprio PROJECT.md sinaliza "estado de estoque deve refletir o painel com delay máximo de segundos, nunca minutos" — esta armadilha é o modo de falha concreto por trás desse requisito.

**Como evitar:**
- Desabilitar na camada de dados (o componente não renderiza a pílula como selecionável no estado da aplicação, não só em CSS) — o estado de "tamanho selecionado" deve rejeitar tamanhos esgotados mesmo que um evento de clique obsoleto dispare.
- Revalidar a disponibilidade do tamanho no momento do clique (não só no momento da renderização) antes de abrir o link do WhatsApp — uma checagem barata no lado do cliente contra os dados de produto buscados mais recentemente, ou um fetch novo se a página do produto estiver aberta há um tempo.
- Combinar `pointer-events: none`, `aria-disabled="true"`, `tabindex="-1"`, e um tratamento visual de riscado/tachado — cinto e suspensórios, já que navegadores mobile variam em quão consistentemente respeitam `pointer-events` em toque vs. eventos simulados por clique.

**Sinais de alerta:**
- Disponibilidade de tamanho computada uma vez no carregamento da página e nunca reverificada antes do CTA disparar.
- Nenhum teste para "clicar rapidamente na pílula esgotada" ou "clicar na pílula esgotada via teclado Enter após Tab".

**Fase para abordar:**
Fase de vitrine + fluxo de pedido — mesma fase que as Armadilhas 1/2 (o fluxo de conversão), já que faz parte da mesma garantia "nunca enviar um pedido incompleto/errado".

---

### Armadilha 4: A unicidade de slug precisa de uma constraint de banco de dados, não só uma checagem antes de salvar

**O que dá errado:**
A "validação em tempo real" na UI admin checa se um slug está ocupado via uma query com debounce, então o usuário submete. Entre a checagem e a inserção real, outro revendedor (ou uma aba/retry duplicado do mesmo usuário) pode pegar o mesmo slug — uma condição de corrida TOCTOU (time-of-check-to-time-of-use) clássica. Sem uma constraint única no nível do banco de dados, isso produz duas lojas compartilhando uma URL pública, o que é corrupção de dados silenciosa (uma loja sobrescreve/sombreia a outra dependendo da ordem da query) em vez de um erro visível.

**Por que acontece:**
Checagens de "esse slug está livre?" no lado do cliente/API parecem suficientes durante teste manual (apenas uma pessoa testando por vez), então a constraint de BD ausente não é pega até uso concorrente real.

**Como evitar:**
- Adicionar uma constraint `UNIQUE` na coluna de slug no Postgres/Supabase desde a primeira migration — este é um conserto de cinco minutos que elimina a classe inteira de falha.
- Manter a checagem client-side em tempo real para UX (feedback instantâneo), mas tratar a constraint de BD como a fonte real da verdade; capturar o erro de violação de unicidade na inserção e mostrar uma mensagem amigável "esse link já está em uso".
- Auto-gerar uma sugestão de slug a partir do nome da loja + sufixo aleatório como fallback quando o slug solicitado colide, em vez de bloquear o usuário.

**Sinais de alerta:**
- Arquivo de migration/schema sem índice `UNIQUE` na coluna de slug.
- Endpoint de checagem de slug consulta e depois uma inserção separada acontece sem transação ou constraint amarrando as duas.

**Fase para abordar:**
Fase de configuração da loja/onboarding (onde o slug é criado pela primeira vez) — deve estar na migration inicial do schema, não retrofitada mais tarde uma vez que lojas reais existam (retrofitar uma constraint única em uma tabela com duplicatas existentes requer limpeza manual de dados).

---

### Armadilha 5: Configuração incorreta do RLS do Supabase — silenciosa, não barulhenta

**O que dá errado:**
Dois modos de falha opostos e igualmente perigosos, ambos comuns em apps multi-tenant do Supabase: (a) esquecer de habilitar o RLS em uma tabela deixa todos os produtos/pedidos/configurações de todo revendedor publicamente legíveis e graváveis através do REST/cliente JS do Supabase, sem nenhum erro para alertar você; (b) habilitar o RLS mas escrever uma política incompleta (ou nenhuma) faz as queries retornarem silenciosamente resultados vazios — o app "parece quebrado" (listas de produtos vazias, salvamentos que parecem ter sucesso mas não escrevem nada) sem nenhum erro lançado, o que frequentemente é diagnosticado erroneamente como bug de frontend e desperdiça tempo de debug, ou pior, é "consertado" afrouxando a política demais.

**Por que acontece:**
As tabelas do Supabase vêm com RLS desabilitado por padrão na criação. A fronteira multi-tenant aqui é "produtos/configurações pertencem ao revendedor X" — se a política de isolamento estiver ausente ou errada, o tenant A pode potencialmente ler/escrever os dados de catálogo do tenant B através de chamadas diretas de API, mesmo que a UI nunca exponha isso. Isso é invisível no teste solo do desenvolvedor porque a própria conta de teste do dev tem acesso implícito a tudo no banco de dados de dev.

**Como evitar:**
- Habilitar RLS em toda tabela no momento em que é criada — torne isso parte do template/checklist de migration, não uma reflexão tardia.
- Escrever políticas chaveadas em `auth.uid()` correspondendo a uma coluna `revendedor_id`/`owner_id`, e adicionar um índice nessa coluna (índices ausentes em colunas referenciadas por RLS são citados como o principal matador de performance de RLS mesmo em escala modesta).
- Para a vitrine pública (`/loja/[slug]`), o caminho de *leitura* para produtos/configurações-da-loja precisa de uma política explícita de leitura pública (já que não há usuário autenticado nessa rota) — esta é uma política distinta da política de leitura/escrita autenticada do admin na mesma tabela. Não bloqueie acidentalmente a rota pública ao proteger a rota admin, e não deixe acidentalmente campos apenas-admin (ex.: preço de custo, se algum dia adicionado) expostos através dessa mesma política de leitura pública.
- Testar isolamento com duas contas reais semeadas (não um único superusuário dev) antes de lançar — criar Loja A e Loja B, verificar que a sessão autenticada da Loja A não pode buscar/mutar as linhas da Loja B via chamadas diretas de API, não só via a UI.
- Não usar `raw_user_meta_data`/claims customizados de JWT como fonte de autorização — eles são editáveis pelo usuário; sempre checar contra uma tabela server-side.

**Sinais de alerta:**
- Qualquer tabela do Supabase sem RLS habilitado no schema.
- Lista de produtos aparecendo vazia para um revendedor autenticado sem erro no console (sintoma clássico de "RLS habilitado, nenhuma política").
- Apenas uma conta de teste semeada usada durante todo o desenvolvimento.

**Fase para abordar:**
Fase de camada de dados/fundação de auth (cedo, antes de qualquer fase de CRUD ser lançada) — isso é fundacional e deve ser verificado antes da fase de rota pública da vitrine, já que a política RLS da rota pública é arquiteturalmente diferente da do admin.

---

### Armadilha 6: Rota da vitrine pública acidentalmente bloqueada por middleware de auth

**O que dá errado:**
O PROJECT.md sinaliza explicitamente esse risco: "nenhum middleware de autenticação pode interceptar essa rota." O modo de falha concreto: um matcher de middleware do Next.js escrito de forma ampla (ex.: combinando todas as rotas exceto uma allowlist mantida manualmente) começa silenciosamente a exigir auth em `/loja/[slug]` depois que uma mudança não relacionada em outro lugar adiciona uma nova rota protegida, porque a lista de exclusão não foi atualizada. Uma segunda variante: auth do Supabase no middleware lança/redireciona em *qualquer* falha de checagem de auth (incluindo "sem sessão, mas tudo bem porque essa rota não precisa de uma"), redirecionando visitantes anônimos da vitrine para uma página de login.

**Por que acontece:**
Configurações de matcher de middleware são fáceis de errar sutilmente, e a falha é invisível até alguém testar o link público em uma sessão anônima/deslogada — o que revendedores não-técnicos testando sua própria loja (já logados no painel admin) nunca fazem naturalmente.

**Como evitar:**
- Desenhar o matcher do middleware como uma allowlist de rotas protegidas (ex.: `/dashboard/*`, `/admin/*`) em vez de uma denylist de exceções públicas — o padrão mais seguro é "público a menos que explicitamente protegido".
- Tratar erros de checagem de auth no middleware como "não autenticado" (deixar passar para rotas públicas, bloquear apenas as genuinamente protegidas) em vez de como falhas rígidas que redirecionam tudo.
- Adicionar um teste de fumaça automatizado (mesmo um curl/fetch simples no CI) que acesse `/loja/test-slug` com zero cookies e afirme um 200, não um redirect — rodar isso em todo deploy dado quão fácil é regredir isso.
- Estar ciente de que a autorização apenas via middleware do Next.js teve vulnerabilidades de bypass reais (CVE-2025-29927, bypass baseado em header) — a lição generaliza: nunca confie no middleware como a *única* camada de autorização mesmo para rotas genuinamente protegidas também; reverifique no lado do servidor.

**Sinais de alerta:**
- Config `matcher` do middleware usa um padrão amplo com exceções mantidas manualmente.
- Nenhum teste que carrega a rota da vitrine pública sem cookies de auth presentes.

**Fase para abordar:**
Fase de fundação/roteamento (qualquer fase que configure o middleware de auth) — sinalizar explicitamente nos critérios de aceitação dessa fase: "rota da vitrine pública verificada como acessível com zero estado de sessão."

---

### Armadilha 7: Upload de imagem — o limite de tamanho sozinho não resolve o problema real de upload

**O que dá errado:**
A armadilha #6 do autor (tamanho de upload irrestrito) é necessária mas não suficiente. Dois problemas relacionados, menos óbvios: (a) câmeras de celulares modernos produzem fotos de 3-10MB mesmo com um "limite de 5MB" no limite — muitos celulares o excedem em uma única foto, então o limite sozinho causa falhas de upload exatamente para os usuários não-técnicos que este produto mira, sem compressão o limite só desloca a dor para "upload rejeitado, tente de novo com uma foto menor" que um revendedor não-técnico não vai saber como fazer; (b) orientação EXIF — fotos de celulares seguros em diferentes orientações embutem uma flag de rotação que a maioria dos navegadores (todos exceto Safari/iOS) ignoram ao renderizar via `<img>`, então uma foto de produto rotacionada exibe deitada ou de cabeça para baixo na prévia do admin e/ou na vitrine pública dependendo de qual navegador renderiza, de forma inconsistente entre dispositivos.

**Por que acontece:**
Desenvolvedores testam uploads do próprio desktop com imagens pré-dimensionadas, perdendo o caso de origem-de-câmera-mobile que é o caso de uso primário real aqui (revendedor fotografando chuteiras com um celular).

**Como evitar:**
- Comprimir no lado do cliente antes do upload (redimensionamento baseado em canvas para uma dimensão máxima como 1600px + qualidade JPEG ~80) para que o limite de 5MB seja raramente atingido e os uploads sejam rápidos em dados móveis — comunicar o limite *antes* de o usuário escolher um arquivo, não depois de um upload falho.
- Adicionalmente comprimir/normalizar no lado do servidor (ou via transformação de imagem/imgproxy embutida do Supabase) como uma segunda rede de segurança independente do comportamento do cliente — não depender apenas da compressão no lado do cliente, já que ela pode ser pulada (ex.: API chamada diretamente) ou falhar silenciosamente em alguns navegadores.
- Remover/normalizar a orientação EXIF no lado do servidor para que a imagem armazenada esteja sempre correta independente do dispositivo de origem — nunca depender da renderização `<img>` para respeitar o EXIF, já que isso é honrado de forma inconsistente entre navegadores (iOS Safari faz, a maioria dos outros historicamente não faz).
- Validar o tipo de arquivo no lado do servidor (checagem de magic-byte/content-type), não só pela extensão do arquivo — uma extensão `.jpg` não garante conteúdo JPEG.

**Sinais de alerta:**
- Fluxo de upload testado apenas com imagens pré-dimensionadas de um seletor de arquivo de desktop, nunca uma captura ao vivo de câmera de celular.
- Nenhuma etapa de processamento de imagem entre upload e armazenamento — bytes crus armazenados como estão.
- Fotos de produto aparecendo corretamente na prévia do admin (desktop) mas deitadas na vitrine pública (mobile), ou vice-versa.

**Fase para abordar:**
Fase de CRUD de produto/upload de imagem — deve incluir compressão + normalização EXIF no design do pipeline de upload, não emendar depois de um relatório de bug.

---

### Armadilha 8: Navegadores in-app (Instagram, Facebook) e wrappers baseados em WKWebView podem quebrar o repasse do `wa.me`

**O que dá errado:**
O caminho de compartilhamento realista para um link de vitrine é: o revendedor posta o link na bio/story do Instagram, ou compartilha em um status do WhatsApp; o cliente final toca nele e chega na vitrine *dentro do navegador in-app do Instagram* (não o Safari/Chrome real). De dentro desses webviews embutidos, links `wa.me` podem falhar em repassar para o app nativo do WhatsApp — às vezes abrindo uma página genérica da App Store, às vezes não fazendo nada, às vezes funcionando bem dependendo da versão do SO/app. Este é um dos links de maior risco e menos controláveis em toda a cadeia de conversão, precisamente porque o Instagram é uma fonte de tráfego muito provável para os clientes deste produto.

**Por que acontece:**
Navegadores in-app são WebViews restritas que nem sempre implementam o mesmo comportamento de repasse de link universal/esquema de URL que o navegador do sistema; este é um comportamento do SO/fornecedor do app fora do controle do produto, e muda entre versões de iOS/Android/app sem aviso (confiança: BAIXA/anedótica — nenhuma especificação oficial cobre isso, relatos de comportamento são inconsistentes entre fontes e versões).

**Como evitar:**
- Adicionar uma affordance persistente "abrir no navegador" ou detectar user agents conhecidos de navegador in-app e mostrar um prompt de um toque "abrir no Safari/Chrome" antes de o cliente chegar na etapa de seleção de tamanho, já que a falha é muito mais provável quando disparada de dentro de um webview.
- Usar o formato de link universal simples `https://wa.me/...` (não o esquema customizado depreciado `whatsapp://send?...`, que tem compatibilidade ainda pior) como o link primário — ele degrada de forma mais graciosa (recai para web.whatsapp.com ou um prompt de app store no desktop) do que links profundos baseados em esquema.
- Tratar isso como uma limitação conhecida e testável para documentar ao revendedor em vez de um problema de engenharia solucionável: testar o fluxo real de um toque em link na bio do Instagram tanto em um dispositivo Android real quanto iOS real antes do lançamento, e definir a expectativa de que este é o único link no fluxo com inconsistência multiplataforma fora do controle do produto.

**Sinais de alerta:**
- O único teste feito é abrir o link da vitrine diretamente no Safari/Chrome, nunca via uma folha de compartilhamento do status do Instagram/WhatsApp.
- Nenhuma UI de fallback para "o WhatsApp não abriu" (ex.: uma cópia manual do número + mensagem como backup).

**Fase para abordar:**
Fase de fluxo de conversão da vitrine — adicionar matriz explícita de teste de dispositivo/contexto (Chrome, Safari, Samsung Internet, navegador in-app do Instagram, navegador in-app de status do WhatsApp) × (Android, iOS) como critério de aceitação, não só teste de navegador.

---

### Armadilha 9: Expiração silenciosa de token do Supabase Auth perde trabalho não salvo do admin

**O que dá errado:**
Os JWTs do Supabase Auth expiram (token de acesso padrão de ~1 hora). Se o app admin não escutar proativamente por eventos `onAuthStateChange`/`TOKEN_REFRESHED`/`SIGNED_OUT` e tratar falhas de refresh graciosamente, um revendedor no meio de uma edição (ex.: preenchendo a descrição e preços de um novo produto) pode ter sua sessão expirada silenciosamente; a requisição de salvamento então falha (401) sem mensagem clara, e dependendo de como os erros são tratados, os dados do formulário podem se perder no redirect forçado subsequente para o login.

**Por que acontece:**
O refresh de sessão geralmente é "invisível" e funciona bem em sessões de teste curtas; a falha só aparece quando um usuário real deixa uma aba aberta e volta mais tarde (muito plausível para um revendedor preenchendo um catálogo grande de produtos ao longo de uma sessão estendida), o que desenvolvedores raramente replicam em teste.

**Como evitar:**
- Persistir o estado do formulário em armazenamento local/rascunho em toda mudança significativa (ou antes de qualquer chamada de rede) para que um re-login forçado nunca destrua trabalho em progresso — as expectativas de "esgotado com delay máximo de segundos" e outras já implicam que o app deve ser resiliente a interrupções.
- Tratar 401s do Supabase explicitamente: tentar um refresh silencioso de token primeiro; se isso falhar, mostrar uma mensagem clara "sua sessão expirou, faça login novamente" *antes* de descartar qualquer estado de formulário em memória, e restaurar o rascunho após o re-login em vez de descartá-lo.
- Estender/renovar a sessão proativamente na atividade do usuário em vez de depender puramente de tratamento passivo de expiração.

**Sinais de alerta:**
- Nenhum listener `onAuthStateChange` conectado no app admin.
- Formulários sem persistência de autosave/rascunho, e um redirect genérico para login em qualquer 401.

**Fase para abordar:**
Fase de dashboard admin/CRUD (qualquer fase com formulários) — estabelecer um padrão compartilhado de "formulário protegido" (persistência de rascunho + tratamento gracioso de sessão) cedo para que toda fase subsequente de CRUD herde isso em vez de resolver de novo por funcionalidade.

---

## Padrões de Débito Técnico

| Atalho | Benefício Imediato | Custo de Longo Prazo | Quando Aceitável |
|----------|-------------------|-----------------|------------------|
| Unicidade de slug checada apenas no lado do cliente, sem constraint no BD | Lança mais rápido | Corrupção silenciosa de dados de loja duplicada uma vez que dois revendedores se cadastrem concorrentemente | Nunca — adicionar a constraint na primeira migration, não custa nada |
| Compressão de imagem apenas no lado do cliente (sem passagem server-side) | Mais rápido de construir | Contornada por chamadas diretas de API ou navegadores onde a compressão via canvas falha silenciosamente; inchaço de armazenamento | Apenas aceitável temporariamente no MVP mais inicial com uma fase de acompanhamento já agendada |
| Usar o esquema customizado `whatsapp://send?...` em vez de `https://wa.me/` | Parece mais "nativo" | Compatibilidade pior entre navegadores/apps, sem fallback gracioso de desktop | Nunca para o CTA primário |
| Afrouxar uma política RLS para "usuários autenticados podem ler todas as linhas" para desbloquear um bug | Desbloqueio imediato | Vazamento completo de dados entre tenants | Nunca, mesmo temporariamente — conserte a política real em vez disso |
| Pular a normalização EXIF no lançamento ("parece bem no meu teste") | Economiza uma dependência/etapa de processamento | Fotos de produto aleatoriamente deitadas relatadas por usuários reais em dispositivos aleatórios, difícil de reproduzir/debugar depois | Aceitável apenas se pareado com re-codificação via canvas no lado do cliente (que incidentalmente remove o EXIF como efeito colateral) — verifique que isso está de fato acontecendo, não assuma |

## Armadilhas de Integração

| Integração | Erro Comum | Abordagem Correta |
|-------------|----------------|-------------------|
| Links profundos `wa.me` | Construir a URL com número de telefone cru e mensagem não normalizada, ou codificar duas vezes uma string já codificada | Normalizar o telefone para formato apenas-dígitos estilo E.164 no lado do servidor; construir a string de mensagem completa uma vez, depois `encodeURIComponent` exatamente uma vez |
| Supabase Storage | Armazenar imagens com URLs públicas mas sem escopo de caminho por `revendedor_id`, quebrando políticas RLS de storage que se baseiam em segmentos de caminho | Estruturar caminhos de storage como `{revendedor_id}/{product_id}/{filename}` e escrever políticas de storage que checam o primeiro segmento de caminho contra `auth.uid()` |
| Supabase Auth (cliente) | Nenhum listener para falha/expiração de refresh de token, causando 401s silenciosos | Conectar `onAuthStateChange`, tratar `SIGNED_OUT`/falha de refresh com um fluxo gracioso de re-login que preserva o estado do formulário em progresso |
| Middleware do Next.js + Supabase | Tratar qualquer erro de checagem de auth como "redirect para login", incluindo em rotas públicas | Ramificar explicitamente: rota protegida + sem sessão → redirect; rota pública + qualquer estado de auth → sempre deixar passar |

## Armadilhas de Performance

| Armadilha | Sintomas | Prevenção | Quando Quebra |
|------|----------|------------|----------------|
| A vitrine renderiza todos os produtos em uma única query/página | Carregamento inicial lento em dados móveis, payload grande de imagem | Paginar/scroll infinito ~20 produtos por carregamento (conforme PROJECT.md), lazy-load de imagens abaixo da dobra | Perceptível já a partir de 40-50 produtos; doloroso para lojas com 100+ SKUs (comum em um catálogo completo de chuteiras importadas) |
| Nenhum pipeline de compressão/redimensionamento de imagem | Fotos de múltiplos MB servidas diretamente para clientes mobile em dados celulares | Compressão cliente + servidor, tamanhos de imagem responsivos via transformação do Supabase/imgproxy | Quebra a UX imediatamente para qualquer loja com mais que um punhado de produtos, pior em 4G/planos de dados limitados típicos dos clientes do usuário-alvo |
| Índices ausentes em colunas referenciadas por RLS (ex.: `revendedor_id`) | Latência de query sobe conforme a contagem de linhas cresce em todos os tenants combinados | Adicionar índices em toda coluna referenciada dentro de uma política RLS desde a primeira migration | Torna-se perceptível uma vez que a contagem total de linhas em todos os tenants alcance os poucos milhares, não milhares por tenant |

## Erros de Segurança

| Erro | Risco | Prevenção |
|---------|------|------------|
| Tabela sem RLS habilitado ou sem política | Leitura/escrita completa entre tenants via chamadas diretas da API do Supabase, contornando a UI inteiramente | Habilitar RLS em toda tabela na criação; testar com duas contas reais de tenant semeadas, não um único superusuário dev |
| Usar `raw_user_meta_data`/claims customizados de JWT para decisões de autorização | O usuário pode editar seus próprios metadados no lado do cliente em algumas configurações, escalando privilégio | Autorizar contra uma tabela server-side (ex.: propriedade de linha em `revendedores`), nunca confiar em campos de JWT editáveis pelo cliente |
| Rota da vitrine pública expondo campos de produto apenas-admin (ex.: futuros campos de preço de custo/margem) através da mesma política RLS de leitura pública usada para campos voltados ao cliente | Dados de negócio sensíveis (custo, margem) vazados para qualquer visitante via inspeção de API, mesmo se ocultos na UI | Usar disciplina de exposição no nível de coluna ou views/RPCs públicas vs. admin separadas em vez de uma política única de "público pode ler produtos" uma vez que campos sensíveis sejam adicionados |
| Confiar na extensão do arquivo para imagens enviadas | Arquivo malicioso enviado com extensão `.jpg` mas conteúdo diferente | Validar content-type/magic bytes no lado do servidor antes de aceitar/armazenar um upload |

## Armadilhas de UX

| Armadilha | Impacto no Usuário | Melhor Abordagem |
|---------|-------------|------------------|
| Tamanho esgotado visualmente distinto mas ainda tecnicamente selecionável via corrida/estado obsoleto | Cliente envia um pedido para um tamanho que não existe, revendedor tem que recusar de forma constrangedora, danificando a confiança na ferramenta | Desabilitar na camada de dados/estado, revalidar no momento do clique, não só CSS |
| Nenhum feedback após "Pedir agora" ser clicado e o WhatsApp estar abrindo (ex.: nenhum estado de carregamento/transição) | Cliente clica duas vezes, potencialmente abrindo dois chats ou sentindo que nada aconteceu, especialmente em redes mais lentas/navegadores in-app | Micro-feedback imediato (mudança de estado do botão) mais mensagem de fallback se o link profundo não resolver dentro de um instante |
| Ações CRUD do admin (salvar/excluir/marcar esgotado) sem toast/confirmação | Revendedor não-técnico assume que a ação falhou e repete, causando escritas duplicadas ou confusão | Toast/confirmação em toda ação de mutação, mais atualizações otimistas de UI para velocidade percebida |
| Filtros resetam na navegação/compartilhamento | Cliente cura uma visualização filtrada (ex.: "Nike, solado society") e compartilha esse link, o destinatário chega no catálogo completo não filtrado | Persistir filtros em parâmetros de query da URL para que links compartilhados/filtrados sejam compartilháveis e favoritáveis |

## Checklist "Parece Pronto Mas Não Está"

- [ ] **Fluxo de pedido do WhatsApp:** Testado apenas no próprio número de telefone/navegador do desenvolvedor — verificar em Android + iOS real, Chrome + Safari + Samsung Internet, e via um toque no navegador in-app do Instagram, não só navegação direta em navegador.
- [ ] **Formatação de número de telefone:** Aceita "qualquer dígito" — verificar contra parênteses, traços, zero à frente, código do país ausente, e números copiados e colados com espaços não-quebráveis.
- [ ] **Isolamento multi-tenant:** Verificado apenas com uma conta dev — verificar com duas contas reais semeadas de revendedor confirmando que a Loja A não pode ler/escrever os dados da Loja B via chamadas diretas de API.
- [ ] **Upload de imagem:** Testado apenas com imagens de desktop pré-dimensionadas — verificar com uma foto real de câmera de celular (arquivo grande, rotação EXIF, orientação retrato) enviada de um navegador mobile real.
- [ ] **Rota da vitrine pública:** Testada apenas enquanto logado no admin — verificar em uma sessão anônima/deslogada que `/loja/[slug]` carrega com zero cookies de auth presentes.
- [ ] **Estado de filtro/URL:** Filtros "funcionam" durante a sessão — verificar que uma URL filtrada, recém-carregada sem estado prévio de cliente (ex.: colada em uma nova aba), reproduz a mesma visualização filtrada.
- [ ] **Tratamento de expiração de sessão:** "Login funciona" — verificar o que acontece com um formulário de produto em progresso após deixar a aba ociosa além da expiração do token e retornar para salvar.

## Estratégias de Recuperação

| Armadilha | Custo de Recuperação | Passos de Recuperação |
|---------|----------------|-----------------|
| Slug duplicado já ativo em produção | MÉDIO | Adicionar constraint única (vai falhar se houver duplicatas), resolver manualmente a duplicata existente (renomear uma), depois fazer deploy da constraint + UI amigável de colisão |
| Vazamento de dados entre tenants via RLS descoberto pós-lançamento | ALTO | Bloquear/desabilitar imediatamente a política ofensora, auditar logs de qualquer acesso real entre tenants durante a janela de exposição, notificar revendedores afetados conforme obrigações de proteção de dados, depois fazer redeploy de políticas corrigidas + testadas |
| Fotos de produto deitadas/rotacionadas já armazenadas | BAIXO-MÉDIO | Script de backfill: reprocessar imagens armazenadas existentes através do pipeline de normalização EXIF + compressão, reenviar versões corrigidas |
| Links de WhatsApp quebrados relatados por usuários iniciais (formato de telefone ruim) | BAIXO | Rodar um script único de normalização em números de telefone armazenados existentes, adicionar validação daqui para frente, notificar revendedores afetados para reconfirmar seu número |

## Mapeamento de Armadilha para Fase

| Armadilha | Fase de Prevenção | Verificação |
|---------|-------------------|----------------|
| Formatação de número de telefone wa.me | Fase de configuração de loja/WhatsApp | Testes unitários cobrindo todos os casos de entrada malformada; teste manual de link em um dispositivo real antes do encerramento da fase |
| Codificação de mensagem (acentos, codificação dupla) | Fase de fluxo de pedido da vitrine | Teste manual em dispositivo com o conjunto completo de acentos em português + quebras de linha reais no template |
| Pílula esgotada ainda selecionável | Fase de fluxo de pedido da vitrine | Teste automatizado: clique rápido + Enter no teclado em uma pílula desabilitada nunca dispara o CTA |
| Slugs duplicados | Fase de configuração/onboarding da loja (schema inicial) | Constraint única no nível do BD presente na migration; teste de inserção concorrente |
| Fallback de imagem quebrada | Fase de CRUD de produto/renderização da vitrine | Teste visual com uma URL de imagem intencionalmente quebrada |
| Filtros não na URL | Fase de filtragem da vitrine | Carregar uma URL filtrada nova (nova aba, sem estado prévio) e confirmar que o filtro é aplicado |
| Upload de imagem irrestrito/não comprimido | Fase de CRUD de produto/upload de imagem | Teste de upload com uma foto real grande de câmera de celular; verificar tamanho final armazenado e orientação correta |
| Lacunas de RLS do Supabase | Fase de camada de dados/fundação de auth (antes de qualquer fase de CRUD) | Teste de isolamento de dois tenants: Loja A não pode acessar os dados da Loja B via API direta |
| Rota pública bloqueada por middleware | Fase de fundação/roteamento | Teste de fumaça automatizado acessando a rota da vitrine pública com zero cookies de auth |
| Expiração silenciosa de sessão | Fase de dashboard admin/CRUD (padrão de formulário compartilhado) | Teste manual: ociosidade além da expiração do token, depois tentar um salvamento, confirmar que o rascunho é preservado |
| Falhas de repasse wa.me em navegador in-app | Fase de fluxo de pedido da vitrine | Matriz de teste manual: navegador in-app do Instagram + navegador in-app de status do WhatsApp, ambas plataformas |
| Ações admin sem feedback | Fase de dashboard admin/CRUD | Checklist de revisão de UX: toda ação de mutação tem um toast/confirmação |

## Fontes

- [How to Generate a WhatsApp Deep Link with a Pre-Populated Message — Meta for Developers Community](https://developers.facebook.com/community/threads/957849225969148/)
- [WhatsApp Link: How to Create, Share & Use One — Spur](https://www.spurnow.com/en/blogs/whatsapp-link)
- [International number formats that do and don't work in WhatsApp Click to Chat — Technically Product](https://www.technicallyproduct.co.uk/messaging/international-number-formats-that-do-and-dont-work-in-whatsapp-click-to-chat/)
- [About international phone number format — WhatsApp Help Center](https://faq.whatsapp.com/1294841057948784)
- [How To Normalize International Phone Numbers For WhatsApp — Wassenger](https://wassenger.com/blog/en/how-to-normalize-international-phone-numbers-for-whatsapp)
- [How to correctly enter international numbers for WhatsApp — GREEN-API](https://green-api.com/en/blog/how-to-correctly-enter-international-numbers-for-whatsapp/)
- [Supabase RLS Guide 2026 — designrevision.com](https://designrevision.com/blog/supabase-row-level-security)
- [Enforcing Row Level Security in Supabase: Multi-Tenant Architecture — DEV Community](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2)
- [Supabase RLS Best Practices: Production Patterns for Secure Multi-Tenant Apps — makerkit.dev](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Row-Level Security in Supabase: Multi-Tenant SaaS from Day One — DEV Community](https://dev.to/issuecapture/row-level-security-in-supabase-multi-tenant-saas-from-day-one-4lon)
- [Client-side image compression with Supabase Storage — mikeesto.com](https://mikeesto.com/posts/supabaseimagecompression/)
- [Storage Image Transformations — Supabase Docs](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [Supabase Storage in Practice: File Uploads, Access Control, CDN — BetterLink Blog](https://eastondev.com/blog/en/posts/dev/20260409-supabase-storage-en/)
- [Support Android Intents for deep-linking URLs in Samsung Internet — GitHub Issue #74](https://github.com/SamsungInternet/support/issues/74)
- [Deeplinks not working in Samsung Internet — Samsung Developer Forums](https://forum.developer.samsung.com/t/deeplinks-not-working-in-samsung-internet/24292)
- [Deep Links Crash Course Part 3: Troubleshooting — Android Developers Medium](https://medium.com/androiddevelopers/deep-links-crash-course-part-3-troubleshooting-your-deep-links-61329fecb93)
- [Product List UX Best Practices 2025 — Baymard Institute](https://baymard.com/blog/current-state-product-list-and-filtering)
- [Ecommerce Filter UX Design Patterns That Convert — BTNG.studio](https://www.btng.studio/articles/top-ecommerce-ux-filter-design-patterns-practical-tips-for-2025/)
- [How to not "sell out" in UX design — UX School Medium](https://medium.com/ux-school/how-to-not-sell-out-in-ux-design-b256bdd525)
- [eCommerce Product Catalog: Common Mistakes + How To Fix Them — ConvertCart](https://www.convertcart.com/blog/ecommerce-product-catalog-management-mistakes)
- [Understanding Next.js's middleware vulnerability — LogRocket Blog](https://blog.logrocket.com/understanding-next-js-middleware-vulnerability/)
- [CVE-2025-29927: Next.js Middleware Authorization Bypass — ProjectDiscovery Blog](https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass)
- [Fix Supabase Auth Errors in Middleware — iloveblogs.blog](https://www.iloveblogs.blog/post/handle-supabase-auth-errors-middleware)
- [image orientation on the web — justmarkup](https://justmarkup.com/articles/2019-10-21-image-orientation/)
- [Handle image rotation on mobile — Wassa Medium](https://medium.com/wassa/handle-image-rotation-on-mobile-266b7bd5a1e6)
- [Eliminating Mobile Upload Bugs: EXIF Rotations & Transparency in Pillow — aldianfazrihady.com](https://www.aldianfazrihady.com/en/blog/bec707c5-a0df-4b20-94cf-dc71f980338a/mobile-upload-bugs-exif-rotations-transparency-pillow/)

---
*Pesquisa de armadilhas para: Vitrinoo — micro-SaaS de catálogo/vitrine + link profundo WhatsApp*
*Pesquisado em: 2026-07-10*
