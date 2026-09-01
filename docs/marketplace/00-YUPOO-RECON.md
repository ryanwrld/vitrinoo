# Recon técnico do Yupoo — fornecedor real do Vitrinoo

> Fornecedor: **`yhc956848708.x.yupoo.com`** — "足球地带-实拍" (*Zona do Futebol — fotos reais*)
> Investigado em 2026-08-23 varrendo **as 23 páginas de álbuns inteiras** + amostragem de
> álbuns e download real de imagens. Tudo abaixo é medido, não estimado por analogia.

---

## 1. Tamanho real do catálogo

| Métrica | Valor medido |
|---|---|
| Páginas de galeria | 23 |
| **Álbuns (= produtos em potencial)** | **2.627** |
| **Fotos totais** | **17.365** |
| Média de fotos por álbum | 6,6 (mín. 1, máx. 15) |
| Categorias declaradas pelo fornecedor | 159 |

Este catálogo é **13× maior** que os "200 produtos" que a conversa assumia. Isso muda a
natureza do problema: não dá pra revisar 2.627 produtos na mão, e não dá pra jogar 2.627
produtos na cara do lojista e chamar de "loja pronta".

---

## 2. ⚠️ O achado que reescreve o projeto: **não existe metadado textual**

Os álbuns deste fornecedor **não têm nome de produto**. O título do álbum é literalmente
só a faixa de numeração.

| Título do álbum | Frequência |
|---|---|
| `39-45` | 1.301 |
| `36-45` | 764 |
| `39-45 SG` | 128 |
| `39-45 AG` | 69 |
| `39-45 MG` | 61 |
| `35-45` / `30-35` | 50 cada |
| `39-45 IC`, `36-45 电镀`, `36-45 次顶级` | resto |

- **84% dos títulos são apenas a faixa de tamanho.**
- Só existem **49 títulos distintos** entre 2.627 álbuns.
- A descrição do álbum (`gallerysubtitle`) está **vazia**.
- Os nomes de arquivo das fotos são despejo de câmera: `IMG_20260823_233853.jpg`.

**Consequência:** o plano de extrair marca/linha/modelo por regex do título **é inviável
neste fornecedor**. A informação do produto existe *só dentro do pixel da foto*.

Confirmei abrindo uma foto: é uma **Joma Top Flex Ultimate** de futsal — a marca só aparece
estampada na palmilha e na lateral do tênis. Nenhum texto da página diz "Joma".

### O que sobra como caminho
Nomear o catálogo exige **modelo de visão** (ex.: Haiku 4.5 multimodal) rodando sobre 1–2
fotos por álbum para extrair marca, linha, solado e cor. 2.627 chamadas de visão é barato e
viável — mas é uma **dependência de IA no pipeline que não estava prevista em lugar nenhum**
do projeto, e precisa entrar no plano como tal.

O que o título *dá* de graça: a **grade de tamanhos** (84% de cobertura) e, em ~15% dos
casos, o **solado** (`SG`/`AG`/`MG`/`IC`).

---

## 3. Peso e custo de storage (medido, não chutado)

Baixei 12 fotos reais em duas variantes:

| Variante | Peso médio/foto | **Projeção p/ as 17.365 fotos** |
|---|---|---|
| `big.jpg` | 386 KB | **6,5 GB** |
| `medium.jpg` | 217 KB | **3,7 GB** |

**O free tier do Supabase Storage é 1 GB.** O catálogo cru não cabe, em nenhuma variante,
nem perto. Recomprimir pra WebP a ~80 KB/foto derruba pra ~1,4 GB — ainda estoura.

Isso torna obrigatória uma das decisões: **importar só um subconjunto curado**, **limitar
fotos por produto** (3 em vez de 6,6 corta 55%), ou **pagar storage**. É a decisão de custo
número um do projeto, e ela vem antes de qualquer linha de UI.

---

## 4. Hotlink protection — confirmado

| Requisição | Resultado |
|---|---|
| `GET photo.yupoo.com/.../big.jpg` **sem** `Referer` | **HTTP 567** + HTML de bloqueio |
| Mesmo GET **com** `Referer: https://<vendedor>.x.yupoo.com/` | **HTTP 200**, imagem |

Impossível usar a URL do Yupoo direto no `<img>` da vitrine. Toda foto tem que ser baixada
no servidor com Referer forjado e re-hospedada. Não existe atalho — e é por isso que o item 3
acima é decisivo.

---

## 5. As fotos: qualidade real e o que vem junto

- **Formato**: todas **1:1 quadradas** (72 dimensões amostradas: 0 paisagem, 0 retrato).
  Encaixa perfeitamente no card quadrado da vitrine — nenhum trabalho de crop.
- **Resolução**: `big` = 1080×1080.
- **Estilo**: foto de celular, produto **na mão de alguém**, fundo escuro. É "实拍" (foto real),
  não render de catálogo. Sem marca d'água, sem telefone impresso. Isso é bom pra
  credibilidade e ruim pra padronização visual da vitrine.
- **⚠️ EXIF completo**: as fotos vêm com `HUAWEI Mate X5`, data/hora e **coordenadas GPS**
  do fornecedor embutidas. Isso vaza a localização de terceiro se você re-hospedar cru.
  Obrigatório rodar `sharp` e descartar metadados no ingest (é o default do `sharp`, mas
  precisa ser verificado, não presumido).
- **Álbuns têm vídeo**: existe `uvd.yupoo.com/<id>_thumb.jpg`. O Vitrinoo não tem modelo de
  dados pra vídeo — decidir se ignora ou não.

---

## 6. Estrutura técnica de raspagem

```
https://yhc956848708.x.yupoo.com
  ├── /categories                       → 159 categorias
  ├── /albums?tab=gallery&page=1..23    → 120 álbuns/página
  │     └── card traz título, capa e nº de fotos (album__photonumber)
  └── /albums/<id>?uid=1                → o álbum, com todas as fotos no HTML
```

- **HTML é server-rendered.** `curl -A "Mozilla/5.0"` basta. **Não precisa de headless browser.**
- ⚠️ **A ordem dos atributos muda entre vendedores.** Neste, `title=` vem *antes* de `href=`;
  no outro fornecedor que testei, vinha depois. Um parser de regex ingênuo retorna
  silenciosamente **zero** resultados — foi exatamente o que aconteceu na primeira tentativa.
  O parser precisa de asserção de sanidade ("se página 1 retornar 0 álbuns, aborte com erro").
- A listagem já entrega o **número de fotos por álbum** sem abrir o álbum — dá pra planejar
  o custo de storage antes de baixar 1 byte.
- Varredura completa das 23 páginas + amostragem: ~2 min, sem bloqueio, com 350 ms entre
  requisições. Não houve rate limit.

---

## 7. Continua sem: preço, estoque, nome

O Yupoo não expõe **preço**, **estoque** nem **nome de produto**. Os três campos mais
importantes da ficha do Vitrinoo (`name`, `price`, `product_sizes.available`) **não têm
fonte de verdade na origem**. O marketplace resolve fotos e sortimento; não resolve nada disso.

---

## 8. 🔄 CORREÇÃO IMPORTANTE — o metadado existe, na categoria

> Descoberto depois, a partir de uma observação do dono do produto ("organize sempre pela
> linhagem, como já é hoje no Yupoo"). Isso **revisa a seção 2**.

As **159 categorias** do fornecedor **são exatamente a linhagem do produto** — marca, linha,
geração, construção e solado, tudo no nome. Amostra real:

```
刺客17针织FG      → Mercurial 17, cabedal em tricô, trava FG
刺客16低帮针织SG  → Mercurial 16, cano baixo, tricô, trava SG
GX3低帮针织FG     → Phantom GX III, cano baixo, tricô, FG
GX3太空TF         → Phantom GX III "space", TF
猎鹰26盖帽FG      → Predator 26, com aba/cobertura, FG
猎鹰 26.1 SG      → Predator 26.1, SG
F50开舌FG         → F50 língua aberta, FG
F50梅西平底       → F50 Messi, solado plano
传奇11针织FG      → Tiempo Legend 11, tricô, FG
Puma Future8 SG   → Puma Future 8, SG
美津浓阿尔法FG    → Mizuno Alpha, FG
Adidas sala IC    → adidas Sala, futsal
JOMA
```

### O dicionário (apelidos chineses de mercado)

| Chinês | Significado | Marca/Linha |
|---|---|---|
| 刺客 | "assassino" | **Nike Mercurial** |
| 鬼牌 | "carta fantasma" | **Nike Phantom** |
| GX1/GX2/GX3 | — | **Nike Phantom GX I / II / III** |
| 传奇 | "lenda" | **Nike Tiempo Legend** |
| 猎鹰 | "falcão" | **adidas Predator** |
| F50 | — | **adidas F50** |
| 美津浓阿尔法 | — | **Mizuno Alpha** |
| 针织 / 梭织 | tricô / tecido | construção do cabedal |
| 低帮 / 高帮 | cano baixo / alto | construção |
| 盖帽 / 开舌 | aba / língua aberta | construção |
| 平底 | solado plano | futsal |
| 太空 | "espaço" | colorway/edição |
| 次顶级 | "quase topo" | **faixa de qualidade** |
| 电镀 | "cromado" | acabamento |
| 拖鞋 / 橄榄球鞋 | chinelo / rugby | **ruído — filtrar** |

Os sufixos `FG` `AG` `SG` `TF` `IC` `MD` são o **solado**, e mapeiam direto em `products.sole`.

### Verificado: as categorias realmente agrupam os álbuns
`GET /categories/<id>` retorna 200 e lista os álbuns daquela linhagem (testei duas: uma com
3 álbuns, outra com 120+, paginada). Então existe **álbum → categoria → identidade do produto**.

### O que isso muda

- **A nomeação deixa de ser bloqueante.** Não são 2.627 análises de imagem: é **uma tabela de
  tradução de 159 nomes**, feita uma vez, na mão ou com ajuda de LLM, e revisada por você.
  Marca, linha, geração e solado saem daí com precisão alta — inclusive a distinção
  `Phantom GX I` × `GX III` de que depende a sua regra de preço.
- **A visão vira opcional**, e só para o que a categoria não dá: **cor/colorway**, escolha das
  5 melhores fotos e detecção de modelo repetido.
- **O `次顶级` ("quase topo") entrega a faixa de qualidade** — exatamente o filtro que você
  precisa pra vetar réplica ruim do pack.
- **A curadoria fica trivial:** escolher categorias inteiras em vez de garimpar 2.627 capas.
- **A navegação por linhagem que você pediu já vem pronta** do próprio fornecedor.

Custo: um passe extra de raspagem nas 159 categorias pra montar o mapa álbum → categoria.
Barato, e é a melhor relação custo/benefício de todo o projeto.
