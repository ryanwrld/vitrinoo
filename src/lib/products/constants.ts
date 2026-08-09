/**
 * Listas fixas usadas pelo formulário de produto (03-UI-SPEC.md §Fixed
 * lists). Marca/solado/categoria/modalidade NÃO têm check constraint no
 * banco (Plan 03-01) — validação de enumeração vive só aqui + em
 * `productSchema`, evitando migration de correção se a lista mudar.
 */

/**
 * Marca (D-05): lista fixa + "Outra" (texto livre via campo brandOther).
 * Under Armour e Umbro foram removidas deliberadamente (fora do ICP do
 * usuário — revendedor de chuteiras importadas não trabalha com essas
 * marcas), ajuste feito diretamente durante a execução deste plano.
 */
export const BRANDS = [
  "Nike",
  "Adidas",
  "Puma",
  "Mizuno",
  "New Balance",
  "Outra",
] as const;

/** Solado (D-07): códigos padrão da indústria. */
export const SOLES = ["FG", "AG", "TF", "IC", "MG", "SG"] as const;

/**
 * Rótulo do solado para o CLIENTE FINAL da vitrine pública. As siglas
 * FG/AG/TF/IC/MG/SG são padrão da indústria e o revendedor as conhece — o
 * cliente que chega por um link do Instagram, não. O nome comum vem
 * primeiro e a sigla fica entre parênteses, atendendo os dois públicos sem
 * criar duas listas divergentes.
 *
 * SÓ exibição: o valor gravado em `products.sole` e o que trafega na URL
 * (`?sole=TF`) continuam sendo a sigla, então nenhum link compartilhado
 * antes desta mudança quebra. O formulário do painel admin continua usando
 * `SOLES` cru — lá a sigla sozinha é o vocabulário correto.
 */
export const SOLE_LABELS: Record<(typeof SOLES)[number], string> = {
  FG: "Campo (FG)",
  AG: "Grama sintética (AG)",
  TF: "Society (TF)",
  IC: "Futsal (IC)",
  MG: "Multiterreno (MG)",
  SG: "Campo mole (SG)",
};

/** Categoria (RESEARCH Open Question 1, adotada em 03-UI-SPEC.md). */
export const CATEGORIES = ["Chuteira", "Tênis", "Chinelo", "Outro"] as const;

/** Modalidade (sob encomenda / pronta entrega / ambos). */
export const FULFILLMENTS = [
  { value: "sob_encomenda", label: "Sob encomenda" },
  { value: "pronta_entrega", label: "Pronta entrega" },
  { value: "ambos", label: "Ambos" },
] as const;

/**
 * Modalidades oferecidas como FILTRO na vitrine pública — deliberadamente
 * só duas, sem "Ambos". Como atributo do produto, "ambos" é um valor
 * legítimo (o revendedor trabalha das duas formas); como opção de filtro,
 * era logicamente quebrado: clicar em "Ambos" devolvia apenas os produtos
 * literalmente marcados `ambos`, quando o cliente esperava ver os dois
 * tipos. A solução correta é filtrar por intenção — ver
 * `expandFulfillmentFilter` em public-list.ts, que inclui `ambos` em
 * qualquer seleção, já que um produto "ambos" satisfaz as duas.
 */
export const PUBLIC_FULFILLMENTS = [
  { value: "pronta_entrega", label: "Pronta entrega" },
  { value: "sob_encomenda", label: "Sob encomenda" },
] as const;

/**
 * Ordenação da vitrine pública. `recentes` é o padrão (mantém o
 * comportamento que a vitrine já tinha antes de existir controle de ordem).
 *
 * Deliberadamente SEM "disponíveis primeiro": a disponibilidade é derivada
 * de `product_sizes` numa segunda query e o filtro de esgotado roda em
 * memória DEPOIS do `.range()` (ver `isVisible` em public-list.ts), então
 * ordenar por ela no SQL é impossível sem reescrever toda a paginação.
 */
export const SORT_OPTIONS = [
  { value: "recentes", label: "Mais recentes" },
  { value: "menor_preco", label: "Menor preço" },
  { value: "maior_preco", label: "Maior preço" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_SORT: SortOption = "recentes";

/**
 * Pré-seleção padrão de tamanhos ao cadastrar um produto novo (D-02):
 * a faixa mais comum, marcada como esgotado por padrão (D-03). O grid
 * completo (D-01) continua 36-45 — usado pelo Plan 03-03 para permitir
 * marcar manualmente 36/44/45.
 */
export const DEFAULT_SIZE_RANGE = [37, 38, 39, 40, 41, 42, 43] as const;

/** Grid completo de tamanhos disponíveis (36-45), usado pelo Plan 03-03. */
export const SIZE_GRID = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45] as const;
