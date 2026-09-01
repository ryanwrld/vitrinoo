# Respostas do questionário — Etapa 1 (extração de domínio)

> Entrevista conduzida no chat em 2026-08-23. Respostas do dono do produto, que declarou
> experiência prévia no mercado (ver Objeção 4, registrada como respondida).

---

## Bloco A — O revendedor

**A2. De onde ele compra?** → **Dos dois, e quem decide é o cliente final.**
- **Nacional (São Paulo):** chega rápido, custa mais caro, **estoque limitado**.
- **China:** demora mais, **estoque muito mais amplo**, mais liberdade de escolha, mais barato.

> **Consequência:** isso não é detalhe de logística, é um **eixo de produto**. O schema já tem
> `products.fulfillment` — essa coluna deixa de ser metadado interno e vira informação que o
> cliente final precisa ver, porque é ela que explica a diferença de preço e de prazo.
> O pacote do marketplace é inerentemente do lado **China**.

**A3. Quantos modelos em oferta ao mesmo tempo?** → **150 ou mais.**

> **Consequência:** o marketplace deixa de ser conveniência e vira a feature central.
> Também confirma que 150+ cadastros manuais é inviável na mão. E torna storage e
> deduplicação problemas de primeira ordem, não de polimento.

**A4. Estoque físico ou sob encomenda?** → **O pacote é explicitamente para SOB ENCOMENDA
(dropshipping).** Quem trabalha com pronta-entrega e quiser esses produtos na vitrine
assume a responsabilidade de criar/editar/gerenciar cada um na mão.

> **Consequência — resolve um problema que eu tinha listado como estrutural:** eu havia
> apontado que marcar a grade importada como "disponível" seria mentira. Não é. Para
> dropshipping, "disponível" significa *"o fornecedor tem essa numeração"*, e é verdade.
> A regra fica: **produto vindo do marketplace nasce com a grade do fornecedor marcada;
> produto de pronta-entrega é responsabilidade do lojista.** Isso precisa ficar visível na
> ficha, senão o cliente final entende "disponível" como "tem aqui agora".

**A7. Maior trabalho hoje, na ordem dele:**
1. **Responder a mesma coisa no WhatsApp/Instagram** — preço, numeração, prazo, "tem essa?".
2. **Montar e manter catálogo próprio** — mas *só* para quem tem vontade de ter um.

> **A frase mais importante da entrevista:** essa segunda objeção faz o revendedor
> **desistir de ter catálogo próprio e continuar usando o Yupoo chinês do fornecedor** — para
> ver as novidades **e para mandar pro cliente final conferir os modelos**.
>
> **Consequência:** o concorrente do Vitrinoo não é outro SaaS. É o **próprio Yupoo**, que é
> grátis, já está pronto e já tem as fotos. O marketplace não é um atalho de cadastro —
> é a única resposta possível a "por que eu montaria algo se já mando o link do chinês?".
> Isso reposiciona a feature de *conveniência* para *razão de existir*.

---

## Bloco B — O cliente final

**B9. Chega sabendo o modelo ou pedindo recomendação?** → **Metade e metade.**

> **Consequência ruim:** metade chega por nome ("quero a Mercurial azul"), então **busca por
> nome é obrigatória no MVP**. Mas os 2.627 álbuns do fornecedor **não têm nome** (84% se
> chamam só `39-45`). Ou seja: a metade nominal da demanda é inatendível sem resolver o
> problema de nomeação por visão. Isso promove a nomeação de "desejável" para **bloqueante**.
> A outra metade justifica filtros por uso/solado/preço.

**B10. Foto na mão, fundo escuro, de celular?** → **Passa MAIS confiança — prova que o produto
existe e não é render roubado.**

> **Consequência boa e barata:** **não tratar as fotos.** Sem remoção de fundo, sem
> padronização, sem estúdio. O ingest faz só recompressão + remoção de EXIF. Some do escopo
> a parte mais cara e arriscada do pipeline de imagem.

**B11. O cliente compara links?** → **Compara, mas decide por prazo e confiança, não por preço.**

> **Consequência:** minha Objeção 2 (vitrines idênticas) fica **parcialmente refutada** —
> não vira guerra de preço. Mas não some: se ele compara, ver o mesmo produto em duas lojas
> ainda dilui a percepção de curadoria própria. Prazo e origem (nacional × China) precisam
> estar **em destaque na ficha**, porque é ali que o desempate acontece.
> Exclusividade regional sai do escopo.

**B12. O que ele sempre pergunta antes de fechar?** → **A numeração dele** e o **prazo de entrega**.

> **Consequência:** os dois campos mais críticos da ficha são **grade de tamanhos** e **prazo/
> origem**. Grade já existe no schema; prazo/origem hoje é a coluna `fulfillment`, que não
> aparece com destaque na vitrine. Isso é uma mudança na vitrine pública, fora do marketplace,
> e provavelmente vale mais que metade do marketplace.

---

## Bloco C — O que trava a venda do Vitrinoo

**C13/C15. Por que ele mandaria a vitrine em vez do Yupoo?** → Três motivos, em ordem:
1. **O Yupoo está em mandarim e sem preço.** O valor é a *tradução* do catálogo.
2. **Mandar o Yupoo pode expor o fornecedor dele** — e, pior, **expõe a origem chinesa**.
3. A loja com o nome dele parece profissional.

> **⚠️ Achado que muda o design da vitrine:** muitos clientes finais **têm objeção a produto
> chinês** — associam a Shopee/AliExpress e a qualidade horrível. Esse público é
> majoritariamente **25+**.
>
> **Isso cria uma tensão direta com a resposta B12**, e ela precisa ser resolvida
> explicitamente: o cliente final *sempre pergunta o prazo*, e o prazo é longo justamente
> porque vem da China. Mostrar o prazo é obrigatório; mostrar a *origem* pode queimar a venda.
> A vitrine tem que comunicar o prazo **sem** parecer um site chinês.
>
> Também recalibra B10: a **foto** na mão passa confiança (prova que existe), mas a **estética
> de atacado chinês** é passivo. Foto real: mantém. Cara de Yupoo: elimina.

**C14. "Cadastrar produto por produto" é a maior objeção?** → **NÃO.**
A maior é **"pra que serve se eu já tenho o Yupoo?"**.

> **Consequência — eu estava construindo a objeção errada.** Cadastro é a desculpa educada;
> a objeção real é de *valor*, não de esforço. Um marketplace que só acelera o cadastro
> **não converte ninguém**, porque não responde "pra quê". O que responde é o conjunto:
> português + preço em BRL + CTA de WhatsApp + fornecedor oculto + sem cara de China.
> O marketplace é o *veículo* disso, não o argumento em si.

**C15. Existe revendedor com Yupoo próprio?** → **Não existe.**
O Yupoo é app chinês e exige **verificação por SMS chinês**. Nenhum brasileiro consegue criar
conta, muito menos catálogo. Todos usam o Yupoo **do próprio fornecedor** (estoque de fábrica).

> **Consequência — mata uma feature inteira antes de ela nascer:** "importar o SEU Yupoo",
> que eu vinha sugerindo como alternativa mais barata em três lugares do questionário,
> **tem público zero**. O pacote curado não é a opção mais simples: é a **única**.
> As perguntas 11, 15 e 100 do questionário ficam prejudicadas e serão removidas.

**C17. Modelo de cobrança** → **Pagamento único: mensalidade + pack de chuteiras pré-cadastradas
como vantagem opcional = valor final.** Fechamento de cliente pelo WhatsApp, **billing manual**
(gera cobrança e manda pro cliente pagar), via InfinitePay ou fintech similar — a definir.

> **Consequência:** minha aposta de "incluso/grátis no MVP" estava **errada**. O pack é um
> **upsell pago e opcional**, o que muda o produto: ele precisa ter valor percebido *antes*
> da compra (prévia do que vem no pacote, contagem de produtos, amostra visual), e precisa
> de um **flag por loja** indicando se ela comprou o acesso ao pack.
> Como o billing é manual, não é preciso integrar gateway: basta um campo administrativo que
> você liga na mão depois do pagamento. Isso mantém a restrição "sem cobrança no MVP" do
> CLAUDE.md sem impedir a venda.

---

## Bloco D — Regras ditadas pelo dono do produto

**D-prazo. Rótulo oficial de origem/prazo:** → **"Importado direto da fábrica (Prazo: 7-25 dias)"**

> Resolve a tensão C13 × B12 sem mentir: responde a pergunta que o cliente faz (prazo) e
> reenquadra a origem como *fábrica*, não como *China*. Este texto é **normativo** — é o
> rótulo que a vitrine usa, não uma sugestão. O outro valor de `fulfillment` é pronta-entrega,
> a cargo do lojista.

**D-pack. Estrutura de venda:** → **1 pack principal + coleções por marca dentro dele.**
Marca+ano (ex.: "Nike 2024-2026") é **filtro de navegação**, não produto à venda.
Upsells futuros somam à loja em vez de dividir o essencial: Futsal, Society, Retrô, Infantil.

**D-amostra. Amostra grátis:** → **10 produtos rotativos/aleatórios**, liberados sem pagar.

> ⚠️ **Ressalva registrada (decisão do dono, não vou reabrir):** sorteio puro pode entregar
> justamente os modelos fracos e matar a conversão — a amostra é a peça de venda do pack.
> **Mitigação barata que não muda a decisão:** sortear dentro de um *pool de destaques*
> marcado por você, não do catálogo inteiro. Continua rotativo, continua surpresa, mas nunca
> entrega um item ruim como cartão de visita.

**D-veto. O que não entra no pack:**
- réplica de qualidade baixa;
- infantil misturado no adulto;
- modelo velho / fora de linha (o recorte por ano no nome da coleção já força isso).

**D-infantil:** → **fora do pack principal. Vira pack separado depois**, exigindo a migration
da grade para aceitar 30-35.

**D-tamanho-35:** → **fazer migration para aceitar 35.** Uma linha no `check` de
`product_sizes` (hoje `size between 36 and 45`). São ~50 álbuns do fornecedor com grade 35-45,
e numeração é o campo que o cliente final mais pergunta.

---

## Decisões consolidadas até aqui

| # | Decisão | Origem |
|---|---|---|
| 1 | Pack é **upsell pago**, billing manual via WhatsApp (InfinitePay a definir) | C17 |
| 2 | Acesso ao pack = **flag administrativa por loja**, ligada na mão após pagamento | C17 |
| 3 | Amostra grátis de **10 produtos rotativos** (sortear de um pool de destaques) | D-amostra |
| 17 | **Nome em português obrigatório; sem descrição** em nenhum produto | Etapa 6 |
| 4 | **1 pack principal**, marca+ano como coleção/filtro | D-pack |
| 5 | Rótulo fixo: **"Importado direto da fábrica (Prazo: 7-25 dias)"** | D-prazo |
| 6 | **Não tratar as fotos** — só recompressão + remoção de EXIF | B10 |
| 7 | Produto do pack nasce com a **grade do fornecedor marcada** (é dropshipping) | A4 |
| 8 | **Migration**: aceitar tamanho 35 | D-tamanho-35 |
| 9 | Infantil e "importar seu Yupoo" **fora de escopo** | D-infantil, C15 |
| 10 | **Nomeação por visão é bloqueante**, não desejável | B9 |

---

## Etapa 3/7 — Escala, storage e preço

**Tamanho do pack:** → **250 produtos curados**, com atenção explícita a **não repetir modelo**.

> Dedup é requisito, não polimento. E é difícil: sem nome de produto, "repetido" só se detecta
> comparando **imagem** (mesma chuteira, cor levemente diferente, ângulos parecidos). Entra no
> pipeline de visão junto com a nomeação — não é um `distinct` de SQL.

**Fotos por produto:** → **as 5 melhores / melhores ângulos.**

> Não é "as 5 primeiras". Exige escolha por qualidade e ângulo, o que joga mais uma tarefa
> pro passe de visão: ranquear as 6,6 fotos do álbum e escolher 5, descartando caixa, etiqueta
> e closes redundantes. Volume final: 250 × 5 = **1.250 fotos**, ~110 MB em WebP. Cabe no
> free tier com folga.

**Storage na importação:** → **referenciada do marketplace, com cópia só se o lojista editar**
(copy-on-write).

> ⚠️ **Ressalva registrada (decisão do dono):** é a opção mais cara de implementar e a mais
> fácil de ter bug sutil — foto que some, edição que vaza pra outra loja, órfão no bucket.
> **Como reduzir o risco sem mudar a decisão:** o CoW acontece no nível do **produto inteiro**,
> não da foto individual. Primeira edição de qualquer foto → clona as 5 e desliga a referência.
> Uma regra, um ponto de falha, fácil de testar.

**Preço:** → **preço sugerido na faixa R$ 400-550**, mais **edição em massa por critério**:

| Critério | Regra ditada |
|---|---|
| Linha/geração | `Phantom GX I` = R$ 400; `Phantom GX III` = R$ 450 |
| Solado | **SG é sempre a mais cara** |
| Recência | **lançamento com menos de 2 meses vende mais caro** |

> **Boa notícia técnica:** os dois últimos critérios são deriváveis sem o fornecedor informar
> nada. O **solado** já vem no título em ~15% dos álbuns (`SG`/`AG`/`MG`/`IC`) e a visão pega
> o resto. E a **recência** sai do próprio Yupoo: os `album_id` são **sequenciais e crescentes**
> (os mais recentes que vi estavam na casa de 251.7xx.xxx, com EXIF do mesmo dia). Ordenar por
> `album_id` decrescente dá a régua de lançamento de graça.
>
> A **linha/geração** (`Phantom GX I` vs `GX III`) é a parte difícil: depende inteiramente da
> visão acertar a geração do modelo, e errar aqui erra o preço. É o ponto de maior risco do
> pipeline e precisa de revisão sua no lote curado.

---

## Etapa 5/6 — Estrutura, UX e visual

**Seleção:** → **checkbox no card + barra "Importar N"**, e **sempre organizado por linhagem**
(Mercurial 16 → 17, Phantom GX I → II → III), **do jeito que o Yupoo já organiza hoje**.

> Essa observação abriu o achado da seção 8 da recon: as **159 categorias do fornecedor
> já SÃO a linhagem**. A navegação pedida não precisa ser inventada — precisa ser traduzida.

**Pós-importação:** → **tela de revisão logo após importar**, com edição de preço em massa por
linha/geração, solado e recência, e botão de publicar tudo.

**Visual:** → **herda o painel `.admin-scope`, com destaque próprio** (grid de fotos grandes,
sensação de vitrine). Sem segundo design system.

**Dispositivo:** → **celular e computador igualmente.** A edição em massa precisa funcionar
nos dois; provavelmente simplificada no celular.

**Publicação:** → **entra como rascunho**, publica depois de revisar.

---

## Risco e operação

**Relação com o fornecedor:** → **eles não se importam** com autoria/autenticidade das fotos
nem com as marcas que aparecem; querem apenas vender para lojas.

> **Consequência:** o risco de bloqueio ou de atrito com a origem cai bastante, e a raspagem
> deixa de ser um ponto de fragilidade do plano. Segue valendo o cuidado técnico (User-Agent,
> intervalo entre requisições, retomada por checkpoint) — não por hostilidade, mas porque
> layout muda sem aviso.

**Marcas e hospedagem:** → **aceita hospedar**, mas o marketplace usa **linguagem neutra,
sem afirmar a marca**.

> ⚠️ **Tensão que sobra e precisa de uma decisão de copy:** metade dos clientes finais chega
> pedindo o modelo **pelo nome** (B9), e os nomes de linha — Mercurial, Predator, Phantom,
> Tiempo, F50 — **também são marcas registradas**. "Sem nome de marca" não pode significar
> "sem nome de modelo", senão a busca por nome morre e você perde metade da demanda.
> **Regra proposta:** usar o nome do **modelo/linha** ("Mercurial 17 Tricô TF") e **nunca**
> afirmar o fabricante como selo ("Nike original", logo da Nike, campo `brand` = "Nike").
> Confirmar antes de escrever o gerador de nomes.

**Sincronização:** → **manual por enquanto**; **futuramente semanal automática, com aprovação sua.**

> Desenhar o script já com o diff de `album_id` (o que é novo desde a última execução) para
> que a versão semanal seja só um agendador em cima do mesmo código, e não uma reescrita.

---

## Decisões consolidadas — versão final da Etapa 1

| # | Decisão | Origem |
|---|---|---|
| 1 | Pack é **upsell pago**; billing **manual** via WhatsApp (InfinitePay a definir) | C17 |
| 2 | Acesso ao pack = **flag administrativa por loja**, ligada na mão após pagamento | C17 |
| 3 | **Amostra grátis: 10 produtos rotativos** (sortear de um pool de destaques) | D |
| 17 | **Nome em português obrigatório; sem descrição** em nenhum produto | Etapa 6 |
| 4 | **1 pack principal**; marca+ano e linhagem como **coleção/filtro**, não como produto | D |
| 5 | Rótulo fixo na vitrine: **"Importado direto da fábrica (Prazo: 7-25 dias)"** | D |
| 6 | **Não tratar as fotos** — só recompressão + remoção de EXIF | B10 |
| 7 | Produto do pack nasce com a **grade do fornecedor marcada** (é dropshipping) | A4 |
| 8 | **Migration**: aceitar tamanho **35** | D |
| 9 | **Fora de escopo**: infantil, "importar seu Yupoo" (impossível — SMS chinês) | C15, D |
| 10 | Identidade do produto vem da **categoria do Yupoo**, não de visão | Recon §8 |
| 11 | **250 produtos**, **5 fotos** cada, sem modelos repetidos | Etapa 3 |
| 12 | Storage **referenciado**, com **cópia na primeira edição** (CoW por produto) | Etapa 3 |
| 13 | **Preço sugerido R$ 400-550** + edição em massa por linha, solado (SG mais caro) e recência | Etapa 3 |
| 14 | Importado entra como **rascunho**; publica após tela de revisão | Etapa 5 |
| 15 | **Nome de linha mantido** (Mercurial, Predator, Phantom…); neutro só quanto ao **fabricante** | Risco |
| 16 | Sincronização **manual** agora, semanal com aprovação depois | Operação |

---

## O que ficou em aberto

1. ~~Confirmar a regra de copy de marca.~~ **RESOLVIDO:** nomes de linha mantidos; neutralidade só quanto ao fabricante. Ver `03-NOMENCLATURA.md`.
2. **Vídeo nos álbuns** (`uvd.yupoo.com`): ignorar ou suportar? Ainda não decidido.
3. **Qual fintech** para o billing manual (InfinitePay ou outra) — pesquisa sua, fora do código.
4. **Quem escreve a descrição em português** de cada produto: gerada, template fixo, ou vazia.

---

## Fase A — decisões surgidas durante a execução

**Solados do mesmo modelo:** → **todos entram, como produtos separados.**
Phantom GX II em TF, FG e AG são três produtos legítimos, não repetição — quem joga society
não compra campo. Mantém `products` como está e preserva a regra de preço por solado
(SG mais cara).

> **Consequência só de exibição, para a Fase C:** as variantes compartilham a mesma foto de
> capa. No grid do marketplace elas **não podem aparecer lado a lado**, senão o catálogo
> parece preguiçoso mesmo sendo sortimento real. A ordenação precisa intercalar linhagens.

**Agrupamento na vitrine:** → **produtos separados**, sem transformar solado em variante.
Evita mudança de schema e mantém preço por produto.

**Bugs corrigidos na Fase A:**
- solado `MG` (multi-ground) não existia no dicionário — produtos saíam sem uso.
  Agora vira **"Campo trava baixa (MG)"**.
- token chinês vazava no nome pelo caminho das linhas Puma (`Puma 气垫 com amortecimento`).
  Agora sai **"Puma com amortecimento — Campo (FG)"**.

**Seleção de fotos — regra final (corrigida duas vezes):**
O fornecedor fotografa sempre na mesma sequência, verificada em 4 álbuns:

| Posição | Ângulo | Destino |
|---|---|---|
| 1 | vista de cima, centralizada | entra |
| 2 | solado | entra |
| 3 | traseira | entra |
| 4 | lateral interna | entra |
| 5 | **vista de cima de lado** | **descartada** — rejeitada pelo dono do produto |
| 6 | **lateral externa** (capa do vendedor) | **vira a capa** |

O Yupoo tem uma **capa escolhida pelo vendedor**, que é a lateral externa — o ângulo que vende.
Ela é sempre a **última** foto do álbum, e o ângulo indesejado é o **imediatamente anterior** a
ela. O código usa essa relação, não índices fixos, para aguentar álbuns de tamanho diferente.
Resultado: 250/250 produtos com capa do vendedor e 5 fotos.

> **Dois erros meus registrados, para não repetir:** (1) a primeira versão pegava as 5
> primeiras fotos do DOM, e a capa do vendedor estava na 6ª — ou seja, o melhor ângulo era
> descartado em **todos** os 250 produtos; (2) ao corrigir, deduzi o ângulo indesejado pela
> posição em vez de olhar as fotos, e cortei o errado. Só acertou depois de montar uma grade
> das 6 posições e **ver**. Regra: em decisão sobre imagem, olhar antes de deduzir.

**Nomeação de arquivo por hash da foto**, não por posição — reordenar a curadoria deixou de
invalidar o que já está em disco. Na correção da capa, só 263 fotos novas desceram em vez de
rebaixar 1.250.

**Ponto aberto de layout:** a capa lateral é mais horizontal que a vista de cima. Num card
quadrado com `object-fit: cover`, a chuteira de perfil fica apertada em cima e embaixo.
Decidir na Fase C entre aceitar, dar padding, ou usar `contain` com faixas laterais.

**Verificado — EXIF:** as fotos processadas saem sem EXIF, ICC, IPTC e XMP. As coordenadas
GPS do fornecedor não são repassadas.

**Medido — peso final:** **130 MB** para 1.250 fotos (1080×1080 WebP). Contra 6,5 GB do
catálogo bruto, **redução de 98%** — cabe no 1 GB do free tier com folga.

**Linhas fora de linha excluídas:** `Phantom GT`, `CTR360`, `R9`, `Total 90`, `Magista`,
`Hypervenom`, `Mercurial 10`, `Mercurial 14`, `Predator 21`, `Predator 23`, `X Speedportal 23`.
A recência por `album_id` só ordena **dentro** da linhagem — sem essa lista, a foto mais nova
de uma chuteira morta entrava e contrariava o veto. Eram **27% dos 250**. Os slots foram
repostos por álbuns mais recentes. Decisão: excluídas de vez, não viram pack retrô.

**Bug de tradução corrigido:** `GT` estava mapeado para *Tiempo Legend*; `GT` é **Phantom GT**
(`传奇` é que é Tiempo). Era a chuteira de 2022 que apareceu no pacote.
