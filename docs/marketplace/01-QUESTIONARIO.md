# Marketplace Vitrinoo — Questionário de definição

> Responda na ordem. Cada etapa fecha decisões que a etapa seguinte assume como dadas.
> Onde eu tiver opinião forte, ela está marcada como **[minha aposta]** — discorde à vontade,
> mas discorde explicitamente.

---

## ⚠️ Antes de qualquer pergunta: 4 objeções que eu levanto contra a ideia

Você pediu postura crítica. Estas três coisas podem matar a feature depois de construída,
então elas vêm antes do questionário — e várias perguntas abaixo existem só por causa delas.

**Objeção 1 — Isso não é um marketplace, e chamar de marketplace vai te sabotar.**
Marketplace = muitos vendedores, muitos compradores, transação entre eles. O que você
descreveu é um **catálogo-semente**: você (Vitrinoo) é o único fornecedor, os lojistas são os
únicos compradores, e o que se compra é *conteúdo*, não mercadoria. O nome importa porque
define o que o lojista espera ao clicar. "Marketplace" gera a expectativa de comprar
chuteiras. Ele vai comprar *fotos e fichas de produto*. Se ele descobrir isso só depois do
clique, é churn na hora.

**Objeção 2 — Catálogo idêntico em N lojas destrói o valor de cada loja.**
Se 40 lojistas importam o mesmo pacote, 40 vitrines viram a mesma vitrine, com as mesmas
fotos e os mesmos nomes. O cliente final que receber dois links no WhatsApp vê o mesmo
produto e decide por preço. Você resolve a objeção de venda ("não quero cadastrar 2.627
produtos") criando uma pior ("por que eu pagaria pra ter a mesma loja do concorrente?").
Isso precisa de uma resposta de produto — exclusividade regional, curadoria diferente por
lojista, variação de fotos, ou algo — e é a **Etapa 5** inteira.

**Objeção 3 — Você vai redistribuir fotos de réplica de marca registrada, hospedadas por você.**
Hoje, quem hospeda a foto da chuteira Nike falsificada é o lojista, na conta dele. No modelo
novo, a origem da foto é o Vitrinoo, no bucket do Vitrinoo, com CNPJ/CPF seu na ponta. Isso
muda quem toma notificação de takedown. Não estou dizendo pra não fazer — estou dizendo que
a decisão precisa ser consciente e ter um plano de resposta (Etapa 3, bloco C).

**Objeção 4 — ~~A objeção que isso resolve ainda não foi verificada.~~ → RESPONDIDA.**
Levantei que o "lead não quer cadastrar produto por produto" era hipótese não testada, já que
o Vitrinoo ainda não está rodando. **Você respondeu que já tem experiência no mercado e conhece
como o revendedor e o cliente final pensam.** Registrado e encerrado — não vou reabrir.

O efeito prático: a Etapa 1 deixou de ser um plano de validação e virou **extração**. Não faz
sentido te pedir pra entrevistar 5 revendedores se você já conviveu com eles. Faz sentido tirar
o que está na sua cabeça e transformar em regra de produto — que é o único jeito de eu construir
sem inventar. Onde o conhecimento tácito não vira regra escrita, ele vira decisão minha por
omissão, e aí é chute com cara de arquitetura.
---

## ETAPA 1 — Extração de domínio (o que você já sabe, virando regra de produto)

> **Reescrita 2×.** A v1 perguntava sobre leads que não existem. A v2 propunha validar.
> Ambas erradas: você já tem repertório de mercado. Então esta etapa não te ensina nada e não
> te manda pesquisar nada — ela **puxa da sua cabeça** as coisas que, se ficarem tácitas, eu
> vou acabar decidindo sozinho e provavelmente errado.
>
> Responda curto. Frase de mercado vale mais que parágrafo de teoria.

### Bloco A — O revendedor
1. Descreva o revendedor típico em 3 linhas: idade, onde vende (Instagram? grupo de WhatsApp?
   presencial?), se é renda principal ou extra, quantos pedidos/mês.
2. Ele compra da China direto, ou de um **atravessador brasileiro** que já importou?
   → Isso decide se o catálogo do Vitrinoo pode espelhar um fornecedor chinês específico ou
   se precisa ser genérico.
3. Quantos modelos ele costuma ter em oferta ao mesmo tempo? Um número: 15? 40? 150?
   → Este número **é** o tamanho do pacote. Tudo na Etapa 5 depende dele.
4. Ele tem estoque físico em casa, ou vende sob encomenda e só compra depois do pedido?
   → Se é sob encomenda, "tamanho disponível" no Vitrinoo significa outra coisa, e o
   problema de estoque do marketplace some.
5. Quanto ele cobra de markup em cima do preço chinês? Faixa é suficiente.
6. O que ele faz **hoje** no lugar de uma vitrine — manda print? link do Yupoo? PDF?
   Qual é o incômodo concreto disso pro cliente final?
7. Qual a coisa que **mais** dá trabalho pra ele hoje, na ordem dele — não na sua?

### Bloco B — O cliente final
8. Como o cliente final chega: indicação, Instagram, grupo de futebol?
9. Ele chega sabendo o modelo que quer ("quero a Mercurial azul"), ou chega pedindo
   recomendação ("tem alguma boa até 300")?
   → Se chega sabendo, **sortimento é tudo** e o marketplace se justifica sozinho.
     Se chega perguntando, curadoria pequena e bem apresentada vence catálogo grande.
10. Ele desconfia de foto "de catálogo"? A foto **na mão, fundo escuro** — que é exatamente
    o que esse fornecedor tem — passa mais ou menos confiança que foto de estúdio?
11. O cliente final compara o link de dois revendedores diferentes, ou compra do que ele
    conhece? → Esta é a resposta pra Objeção 2 (vitrines idênticas). É a sua leitura de
    mercado que decide se aquilo é um problema real ou paranoia minha.
12. Ele pergunta o quê antes de fechar? (prazo, taxação, garantia, "é original?")
    → Vira campo fixo na ficha do produto ou não vira.

### Bloco C — O que trava a venda do Vitrinoo
13. Fora "cadastrar produto por produto", quais são as outras objeções que você espera ouvir?
    Liste em ordem de força.
14. O cadastro manual é a **maior** delas, ou só a mais fácil de resolver com código?
    → Pergunto porque é comum construir a objeção resolvível em vez da decisiva.
15. Um revendedor que **já tem** catálogo montado no Yupoo dele — o marketplace serve pra
    alguma coisa pra ele, ou pra esse perfil o certo é "importar o SEU Yupoo"?
    → **[minha aposta]**: são dois produtos diferentes e o segundo é mais barato de construir.
      Qual dos dois perfis é maioria no seu mercado?
16. O revendedor se importa com de onde veio a foto, ou ele quer só "que fique bonito"?
17. Ele pagaria por isso? Quanto? (Não precisa de precisão — precisa da ordem de grandeza:
    R$ 20/mês ou R$ 200 uma vez?)

### Bloco D — Regras que só você pode ditar
18. Quais marcas/modelos **não podem faltar** numa vitrine que se leva a sério hoje?
    Liste os que vierem à cabeça — isso vira o critério de curadoria do primeiro lote e me
    poupa de curar 2.627 álbuns no olho.
19. Que tipo de produto **queima** a loja se aparecer? (réplica ruim, modelo velho, cor
    estranha, infantil no meio do adulto?)
20. Qual erro nessa feature seria imperdoável na visão do revendedor? Uma frase.
21. Depois de importar o pacote, o que faz ele voltar no mês seguinte?
    → Se a resposta é "nada", o pacote é aquisição, não retenção — e aí ele precisa ser
      rápido, não bonito, e isso simplifica metade da Etapa 6.

## ETAPA 2 — Lógica de negócio (o que é vendido, como, por quanto)

13. O pacote é **vendido** (cobrança avulsa), **incluso** no plano, ou **isca grátis** para
    conversão? — **[minha aposta]**: incluso/grátis no MVP. Você ainda não tem billing
    (o CLAUDE.md diz explicitamente "sem cobrança no MVP"), e construir cobrança só pra essa
    feature adiciona um sistema inteiro fora de escopo.
14. Se for vendido: preço único pelo pacote inteiro, por produto, ou assinatura de "acesso ao
    catálogo"?
15. Um lojista pode importar **tudo** (2.627 produtos) ou existe limite? Um teto baixo
    (ex.: 60) é também uma resposta pro problema de vitrines idênticas.
16. Depois de importado, o produto vira **cópia independente** do lojista (ele edita preço,
    nome, apaga fotos livremente) ou fica **linkado** à origem (atualiza sozinho quando o
    Vitrinoo atualiza)? — **[minha aposta]**: cópia independente. Link vivo cria um pesadelo
    de "o produto mudou sozinho na minha loja" e conflitos de edição, sem benefício real.
17. Se for cópia: quando o Vitrinoo corrige uma foto ruim do catálogo, os lojistas que já
    importaram ficam com a foto ruim pra sempre? Aceitável?
18. O produto importado entra como **rascunho** ou **publicado**? — **[minha aposta]**:
    rascunho. Publicar dezenas de produtos sem preço direto na vitrine pública é um desastre
    visível, e a vitrine é a única coisa que o cliente final vê.
19. Preço: o catálogo sugere um preço BRL, ou vem zerado? Se sugere, quem define — você, na mão?
20. O que acontece com produto **sem preço** definido? Bloqueia publicação, ou publica com
    "consultar"?
21. Tamanhos: o pacote traz a grade do fornecedor (ex.: 39-45) já marcada como **disponível**?
     Isso é mentira estrutural — o Vitrinoo não sabe o estoque do lojista. Marcar tudo
     disponível gera pedido de tamanho que não existe, que é exatamente o bug #1 do PROJECT.md.
     Como resolver?
22. Duplicata: o lojista importa o mesmo produto duas vezes — bloqueia, avisa, ou deixa?
23. O lojista pode **devolver / desimportar** em massa se se arrepender?
24. Existe algum caso em que o lojista pode **contribuir** produtos de volta pro marketplace?
    (Isso transformaria em marketplace de verdade, mas abre moderação — é escopo novo.)
25. Quantos lojistas você **pretende** ter nos primeiros 3 meses? Não é previsão de
    faturamento — é dimensionamento: 5 lojistas e 200 lojistas exigem pipelines diferentes.
    Chute um número e assuma que é chute.

---

## ETAPA 3 — Técnica (como isso roda sem quebrar)

### Bloco A — Fotos, storage, custo
26. **Fato apurado**: o Yupoo bloqueia hotlink (HTTP 567 sem `Referer`). Toda foto tem que ser
    baixada e re-hospedada. Confirmado que aceita?
27. Onde ficam as fotos do marketplace? Bucket novo `marketplace-assets` público, separado
    dos buckets `store-assets`/`product-images` que hoje são escopados por `auth.uid()`?
    — **[minha aposta]**: bucket novo. As policies atuais de RLS assumem `foldername[1] = uid`,
    o que não existe para um catálogo sem dono.
28. Quando o lojista importa, a foto é **copiada** para o bucket dele (N cópias, N× storage) ou
    **referenciada** do bucket global (1 cópia, mas ele não pode apagar/editar)?
    — Isso é a decisão de arquitetura mais cara do projeto. Com 2.627 produtos × 6,6 fotos × 386 KB = 6,5 GB por lojista se copiar, vs 6,5 GB no total
    se referenciar. O free tier do Supabase é 1 GB.
29. Se referenciar: `product_photos.storage_path` hoje é `text` e assume o bucket do produto.
    Precisa de uma coluna `source` (`own | marketplace`)?
30. Qual variante do Yupoo baixar: `medium.png` (leve) ou `big.png` (780 KB, qualidade)?
    Recomprime com `sharp` no ingest? Converte pra WebP/AVIF?
31. Qual o teto de storage aceitável antes de virar custo real?

### Bloco B — Ingest e operação
32. A raspagem roda **uma vez, manual** (script local, você supervisiona) ou **agendada**
    (cron detectando álbuns novos)? — **[minha aposta]**: manual/one-shot no MVP. Cron é
    infra que só se paga quando o fornecedor publica com frequência.
33. Existe uma **tela de admin do Vitrinoo** (só você) pra revisar/aprovar produto raspado
    antes de virar público no marketplace? — **[minha aposta]**: sim, obrigatório. 84% dos álbuns não têm nome nenhum. Publicar cru destrói a percepção de qualidade.
34. Quem traduz/normaliza os títulos em mandarim: você na mão, ou LLM no pipeline?
35. Quantos fornecedores Yupoo você vai raspar? Um só, ou vários (o que gera produtos
    duplicados entre fornecedores e exige dedupe)?
36. Como detectar produto que o fornecedor **removeu** do Yupoo? Importa?
37. Rate limit / bloqueio: se o Yupoo te barrar por IP no meio da raspagem, o processo é
    retomável (checkpoint por álbum) ou recomeça do zero?
38. O parser de título (marca/linha/solado/tamanhos) vai errar. Qual a taxa de erro aceitável
    antes de exigir revisão humana de 100%?
39. Onde roda o ingest: script local na sua máquina, Route Handler da Vercel (limite de
    tempo de execução!), ou máquina separada? — **[minha aposta]**: script local. Baixar
    milhares de imagens estoura o timeout de função serverless.

### Bloco C — Risco e legal
40. Você aceita hospedar as fotos de réplicas no seu Supabase, sob seu nome?
41. Existe plano de takedown? (Deletar por marca, por fornecedor, por produto?)
42. Os produtos vão exibir "Nike", "adidas" como marca no seu marketplace, ou uma
    nomenclatura neutra?
43. Precisa de um aceite explícito do lojista ("eu sou responsável pelo que publico") no
    momento da importação?

### Bloco D — Schema
44. Tabelas novas: `marketplace_products`, `marketplace_photos`, `marketplace_categories`,
    `marketplace_imports` (log de quem importou o quê)? Ou os produtos globais vivem na tabela
    `products` com `store_id = NULL`? — **[minha aposta]**: tabelas separadas. `store_id` é
    `not null` hoje e todas as policies de RLS dependem disso; afrouxar quebra o isolamento
    multi-tenant inteiro.
45. RLS do marketplace: leitura pública pra qualquer lojista autenticado, escrita só pra
    um `is_admin`. Existe hoje algum conceito de admin/super-usuário no projeto? (Não achei.)
46. `marketplace_imports` guarda rastro (`marketplace_product_id → product_id`) pra permitir
    "já importado", dedupe e desimportação em massa?

---

## ETAPA 4 — Mercado (chuteira, China → Brasil)

47. (Você pode não saber ainda — responda com a sua leitura do mercado.)
    Qual é a **faixa** do catálogo: réplica 1:1 premium, "linha 1", ou tudo misturado?
    O comprador final de 1:1 e o de linha comum são pessoas diferentes.
48. O catálogo cobre só **campo (FG)** ou também society (TF), futsal (IC), trava mista (AG)?
    Hoje o schema tem `sole` e `category` — a proporção importa pro layout de filtros.
49. Grade de tamanhos: o schema atual trava em **36-45**. Os títulos do Yupoo trazem **35**-45.
    O que fazer com o 35? (Migration, ou descartar o tamanho?)
50. Numeração chinesa vs BR: o fornecedor lista o tamanho dele. Bate 1:1 com o BR ou precisa
    de tabela de conversão? Isso é o tipo de erro que gera devolução.
51. Sazonalidade: lançamento de coleção (Mercurial nova, F50 nova) muda o catálogo com que
    frequência? Isso define se cron vale a pena.
52. Quais modelos são os "cabeça de chave" que **todo** lojista precisa ter? (Isso permite um
    pacote curado pequeno, tipo "Top 30", em vez de 200 itens.)
53. **O lojista vai comprar de qual fornecedor?** Se o pacote vier do `yhc956848708` mas o
    lojista comprar de outro fornecedor, ele anuncia produto que não consegue entregar.
    Isso é o furo mais grave do plano e não depende de ter base rodando pra ser respondido:
    ou o Vitrinoo indica o fornecedor junto com o catálogo, ou o catálogo é ficção.
    Qual das duas?
54. Prazo de entrega China→Brasil e taxação entram na ficha do produto? O cliente final
    pergunta isso *sempre*.
55. Preço médio de venda no Brasil por faixa, pra sugerir preço no import?

---

## ETAPA 5 — Estrutural do marketplace (a resposta pra Objeção 2)

56. Como você evita 40 vitrines idênticas? Opções: (a) não evita, assume; (b) exclusividade
    por região/CEP; (c) curadoria diferente por lojista; (d) fotos com variação/tratamento
    por loja; (e) o pacote é só semente e espera-se que o lojista edite.
57. Se exclusividade: qual granularidade? (Produto por cidade? Pacote por estado?)
58. Existe conceito de **coleções/pacotes** curados ("Kit Iniciante 30 produtos", "Só Nike",
    "Society completo"), ou é navegação livre item a item? — **[minha aposta]**: pacotes.
    A objeção do lead é *quantidade de trabalho*; navegação livre item a item recria o trabalho.
59. Se pacotes: quantos, e quem monta?
60. Navegação do marketplace: filtro por marca / solado / categoria / faixa de preço — quais
    existem no MVP?
61. Busca por texto é necessária no MVP, ou os filtros bastam?
62. Seleção múltipla: checkbox por card + barra flutuante "Importar 12 selecionados", ou
    botão "Importar" individual em cada card? — **[minha aposta]**: os dois. Individual pro
    curioso, seleção múltipla pro lead com pressa.
63. O que acontece na tela **durante** a importação de 50 produtos? Bloqueia, mostra progresso,
    ou roda em background com notificação?
64. Estado "já importado" aparece no card do marketplace? (Precisa, senão ele reimporta.)
65. O produto importado cai onde? Direto em `/admin/produtos` como rascunho? Tem tela de
    "revise os 50 produtos que você acabou de importar" com edição de preço em massa?
    — **[minha aposta]**: sim, e essa tela é mais importante que o marketplace em si.
    Sem edição de preço em lote, você trocou "cadastrar 200 produtos" por "editar 200 preços".
66. Onde entra no menu do `/admin`? Você disse abaixo de "Produtos" — confirmado.
     Ícone? Badge de "novo"?
67. Empty state do marketplace pro lojista que já importou tudo?
68. Precisa de paginação/scroll infinito? (200+ produtos com 5 fotos cada é pesado.)

---

## ETAPA 6 — Visual (layout do marketplace)

69. O marketplace herda a estética do `/admin` (painel) ou tem cara própria de "loja"?
    — **[minha aposta]**: herda o `.admin-scope`. Cara própria vira um segundo design system
    pra manter, e o histórico do projeto já mostra que redesign paralelo dá briga.
70. Grid: quantas colunas em desktop/tablet/celular? Card quadrado (como a vitrine) ou mais alto?
71. O card mostra o quê: foto, nome, marca, solado, grade de tamanhos, nº de fotos? Preço
    sugerido?
72. Clicar no card abre popup de detalhe (com galeria das 5 fotos) ou importa direto?
    — Nota: o projeto tem uma decisão travada de **não usar parallel/intercepting routes**
    (quebrou navegação no app inteiro). Modal tem que ser via query param.
73. Como o card comunica "este produto já está na sua loja"?
74. A barra de seleção múltipla é fixa no rodapé (mobile) e lateral (desktop)?
75. Estados: loading (skeleton), erro de importação parcial ("47 de 50 importados"), vazio.
76. O lojista acessa o marketplace pelo **celular**? Se sim, importar 50 produtos no celular
    precisa funcionar bem — e isso é uma restrição de layout séria.
77. Alguma referência visual que você gosta? (Shopify App Store? Printful? Um marketplace
    de templates?) Manda print se tiver.
78. Precisa de dark mode? (O `/admin` já tem tema — o marketplace segue o mesmo token set.)

---

## ETAPA 7 — Yupoo (reescrita depois da recon do fornecedor REAL)

> Leia `00-YUPOO-RECON.md` antes. Os números abaixo são medidos em
> `yhc956848708.x.yupoo.com`: **2.627 álbuns, 17.365 fotos, 6,5 GB em `big`**.

### Bloco A — O problema do nome (o mais grave)
79. **84% dos álbuns não têm nome de produto** — o título é só `39-45`. A marca só existe
    dentro da foto. Como você quer nomear 2.627 produtos?
    (a) modelo de visão no pipeline, (b) você na mão, (c) só os curados, (d) publicar sem nome.
    — **[minha aposta]**: (a) para gerar um rascunho + (c) revisão humana só do lote curado.
80. Se visão: aceita depender de uma chamada de IA no ingest? Isso é uma dependência nova,
    não prevista no CLAUDE.md, com custo por execução.
81. Qual precisão é aceitável? Um produto anunciado como "Nike Mercurial" que é Joma vira
    reclamação do cliente final no WhatsApp do lojista.
82. Quem revisa o resultado da visão antes de publicar — você, ou o lojista no momento de
    importar? — **[minha aposta]**: o lojista, na tela pós-importação. Ele conhece os modelos
    melhor que você e tem incentivo pra corrigir.
83. Descrição em português: gerada, template fixo, ou vazia?

### Bloco B — Volume e curadoria
84. **2.627 produtos.** Importa tudo, ou curadoria? — **[minha aposta]**: curadoria dura.
    Um lojista com 2.627 produtos não tem uma vitrine, tem um depósito. A objeção do lead é
    "não quero cadastrar", não "quero 2.627 itens".
85. Se curadoria: qual o tamanho do lote inicial? 50? 150? Quem escolhe?
86. Como escolher sem nome de produto? A única pista pré-visão é a **foto de capa** e a
    **categoria** (159 delas). Você topa curar visualmente, olhando capas?
87. As 159 categorias do fornecedor viram filtro no marketplace, ou você remapeia pro schema
    do Vitrinoo (`brand`/`line`/`sole`/`category`)?
88. Tem `30-35` (infantil) no catálogo. Entra no escopo? O schema do Vitrinoo trava em **36-45**
    — infantil exige migration, e `35-45` também estoura por baixo.

### Bloco C — Storage (a decisão de custo nº 1)
89. Medido: **6,5 GB** em `big`, **3,7 GB** em `medium`, ~1,4 GB recomprimido em WebP.
    **O free tier do Supabase é 1 GB.** Qual caminho?
    (a) só o lote curado, (b) limitar a 3 fotos por produto, (c) pagar o Supabase Pro,
    (d) hospedar as fotos fora do Supabase.
90. Média é 6,6 fotos/álbum. Corta pra 3? Quais 3 — as primeiras, ou escolhidas?
91. `big` (386 KB, 1080×1080) ou `medium` (217 KB)? Recomprime pra WebP no ingest?
92. Se o lojista importar, a foto é copiada pro bucket dele (multiplica por lojista) ou
    referenciada do bucket global? Com 2.627 produtos isso é a diferença entre viável e não.

### Bloco D — Operação
93. Confirmado que dá pra raspar com `curl` (sem headless) e que não houve rate limit em
    2.627 álbuns. Roda uma vez manual, ou agendado?
94. As fotos vêm com **EXIF de GPS do fornecedor**. Confirma que o ingest tem que apagar
    metadado?
95. Álbuns têm **vídeo** (`uvd.yupoo.com`). Ignorar, ou o Vitrinoo vai ganhar suporte a vídeo?
96. Você tem relação com esse fornecedor, ou vai raspar sem avisar? Muda o discurso
    ("catálogo oficial do fornecedor X") e o risco de bloqueio.
97. As fotos são "na mão, fundo escuro". Fica bom na vitrine do lojista, ou incomoda?
    Precisa de tratamento (remover fundo, padronizar)?
98. Re-raspagem: o fornecedor subiu fotos **hoje** (EXIF de 23/08/2026). O catálogo é vivo.
    Frequência de sincronização?
99. Raspagem entrega um **JSON pra você revisar** antes de subir pro banco?
    — **[minha aposta]**: sim, obrigatório nesse volume.
100. Vai raspar **só este** fornecedor, ou mais? Vários fornecedores sem nome de produto
     tornam a deduplicação praticamente impossível.

## Como eu recomendo fatiar depois que isso estiver respondido

1. **Fase A — Ingest offline.** Script local: raspa → JSON → baixa fotos → recomprime → sobe
   pro bucket. Nada de UI. Entrega: marketplace populado e revisado por você.
2. **Fase B — Schema + admin de curadoria.** Tabelas do marketplace, RLS, tela só sua de
   aprovar/editar/despublicar item do catálogo.
3. **Fase C — Vitrine do marketplace pro lojista.** Rota `/admin/marketplace`, grid, filtros,
   seleção múltipla, importação.
4. **Fase D — Tela pós-importação.** Revisão em lote, preço em massa, publicar tudo.
   (Sem isso, a Fase C entrega uma dor no lugar da outra.)
