# Nomenclatura — do chinês para o português de revendedor

> Regra fechada: **todo produto tem nome em português. Nenhum produto tem descrição.**
> A tradução usa a linguagem que o revendedor brasileiro realmente escreve no Instagram —
> não português literal.

## Fórmula do nome

```
<Linha> <Geração> <Construção> <Uso> (<Sigla>)
```

**Sem travessão em nenhum nome** — decisão do dono do produto. O sufixo de uso é reconhecido
pelo próprio texto (`<Uso> (<SIGLA>)` no fim da string), via `semSufixo()` em
`lib-overrides.mjs`, que é o que permite agrupar variantes do mesmo modelo sem um separador.

| Categoria no Yupoo | Nome gerado |
|---|---|
| `刺客17针织FG` | **Mercurial 17 malha Campo (FG)** |
| `刺客16高针织SG` | **Mercurial Superfly 16 cano alto em malha Campo trava alumínio (SG)** |
| `刺客16低帮针织TF` | **Mercurial Vapor 16 cano baixo em malha Society (TF)** |
| `GX3高帮针织FG` | **Phantom GX III cano alto em malha Campo (FG)** |
| `猎鹰26盖帽SG` | **Predator 26 com aba Campo trava alumínio (SG)** |
| `F50开舌FG` | **F50 língua solta Campo (FG)** |
| `传奇11针织FG` | **Tiempo Legend 11 malha Campo (FG)** |
| `Puma FUTURE 7 ULTIMATE TF` | **Puma Future 7 Ultimate Society (TF)** |

### A decisão coloquial mais importante
`刺客` é Mercurial, e o revendedor brasileiro chama de **Superfly** o cano alto e de **Vapor**
o cano baixo. O tradutor aplica isso automaticamente a partir de `高帮/高针织` e `低帮`.

**"Cano alto/baixo" fica no nome também** — decisão do dono do produto: o termo é usado no
Brasil e a redundância ajuda quem não conhece a nomenclatura da Nike. Resultado:
*Mercurial Superfly 16 cano alto em malha Campo trava alumínio (SG)*.

## Solado — como o brasileiro chama

| Sigla | No nome | Observação |
|---|---|---|
| FG | **Campo** | grama natural, o padrão |
| SG | **Campo trava alumínio** | a mais cara, conforme sua regra de preço |
| AG | **Sintético** | grama sintética |
| TF | **Society** | como todo mundo fala |
| IC | **Futsal** | quadra |
| MD | **Campo trava baixa** | raro (1 categoria) |

Inferência: sem sigla, `平底` (solado plano) → **IC**; `碎钉/碎丁` (trava picada) → **TF**.

## Dicionário de construção

| Chinês | Português de revendedor |
|---|---|
| `针织` | malha |
| `梭织` | tecido |
| `网布` / `网格` | tela |
| `低帮` / `高帮` | cano baixo / cano alto |
| `无鞋带` | sem cadarço |
| `盖帽` | com aba |
| `翻盖` | aba dobrável |
| `开舌` | língua solta |
| `气垫` | com amortecimento |
| `超轻` | superleve |
| `复刻` | retrô |
| `中端` | intermediária |
| `次顶级` | linha 2 |
| `普通` | básica |
| `太空` | Space (colorway) |
| `周年` | edição comemorativa |
| `电镀` | cromada |
| `一代` | 1ª geração |

## Apelidos chineses → linha de mercado

| Chinês | Linha |
|---|---|
| `刺客` | Mercurial (→ Superfly / Vapor) |
| `猎鹰` | Predator |
| `传奇` / `GT` | Tiempo Legend |
| `鬼牌` / `GX1-3` | Phantom / Phantom GX I-III |
| `毒蜂` | Hypervenom |
| `月煞` | Magista |
| `X` | X Speedportal |
| `T90` | Total 90 |
| `美津浓阿尔法` | Mizuno Alpha |
| `美津浓` | Mizuno Morelia |
| `彪马` | Puma |
| `卡帕经典` | Kappa Clássica |
| `新百伦` | New Balance |
| `亚瑟士` | Asics |

## Descartados automaticamente (ruído)

`拖鞋` chinelo · `橄榄球鞋` rugby · `田径钉鞋` sapatilha de atletismo · `袋子` sacola ·
`儿童鞋` infantil (fora de escopo) · `未分类相册` sem categoria

## Cobertura medida

**153 de 159 categorias traduzidas automaticamente. 6 descartadas por ruído. 0 pendentes.**

Arquivos: `scripts/marketplace/traduz-categorias.mjs` (tradutor) e
`categorias-yupoo.json` (as 159 categorias com seus IDs).

## Nomes manuais — quando a categoria não basta

Há casos em que o Yupoo agrupa **linhas diferentes sob uma categoria só**, e aí nenhuma regra
automática funciona: o nome do produto não está em texto nenhum, só na foto.

O caso real: as **18 Jomas** vinham todas da categoria `JOMA`, sem solado e com o nome "Joma".
São, na verdade, quatro linhas distintas, identificadas pelo que está estampado no par:

| Marcador estampado | Linha |
|---|---|
| `REGATE REBOUND` na lateral | **Joma Regate Rebound** (3) |
| `TOP-FLEX` + `REBOUND` na entressola | **Joma Top Flex Rebound** (6) |
| `TOP-FLEX` + `REACTIVE BALL` | **Joma Top Flex Plus Reactive Ball** (6) |
| `TOP-FLEX ULTIMATE` + `FOAM:REACTIVE`, entressola ondulada | **Joma Top Flex Ultimate** (3) |

Todas são de quadra — **solado IC**, confirmado pelo dono do produto.

**Mecanismo:** `nomes-manuais.json` mapeia `albumId → { nome, sole }`, e `lib-overrides.mjs`
aplica isso tanto no `montar` (antes do cálculo de preço, para o solado corrigido valer na
regra) quanto no `renomear`. O sufixo de uso (`Futsal (IC)`) é acrescentado
automaticamente, então o override só precisa da linha.

> Para nomear um produto na mão, basta acrescentar a entrada em `nomes-manuais.json` e rodar
> `node scripts/marketplace/renomear.mjs`. Não exige revarrer o Yupoo.

**Os outros 12 sem solado, resolvidos pelo dono do produto:**

| Produto | Solado |
|---|---|
| `Nike SB Gato` (4) | IC |
| `2024 Copa Gloro2` (4) | TF |
| `Copa` — as duas de solado raso | TF |
| `Copa` coral com trava — com e sem cadarço | **AG** (a exceção) |

Com isso o catálogo chega a **zero produtos sem solado**.

> Quando um override corrige o solado, o **preço é recalculado** junto (`lib-preco.mjs`,
> compartilhado entre `montar` e `renomear`) — as duas Copa AG passaram de R$ 470 para R$ 480.
>
> Nota: o modelo `Copa` fica com 2 AG e 0 FG, o que parece contrariar a regra "sempre mais FG
> que AG". Não contraria: o fornecedor **não tem** Copa FG. A regra segue valendo onde há as
> duas opções.

---

## ✅ Regra de marca — CONFIRMADA

Decisão do dono do produto: **manter os nomes de linha** — Mercurial, Predator, Phantom,
Tiempo Legend, F50, Superfly, Vapor.

A regra de "linguagem neutra" se aplica ao **fabricante**, não ao modelo:

| Pode | Não pode |
|---|---|
| Nome da linha no `name` do produto | `brand = "Nike"` / `"adidas"` como selo oficial |
| "Mercurial Superfly 16 cano alto em malha — Campo (FG)" | Logo do fabricante na vitrine |
| Busca por "Predator", "Phantom" | Afirmar "original", "oficial", "autêntica" |

Isso preserva a busca por nome — que metade dos clientes finais usa, segundo a resposta B9 —
sem o marketplace afirmar autoria de fabricante.
