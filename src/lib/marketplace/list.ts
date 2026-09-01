import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Leitura do marketplace — o acervo de chuteiras pré-cadastradas que o Vitrinoo
 * mantém e o revendedor compra em pacote.
 *
 * O escopo do que cada um enxerga NÃO é decidido aqui: vive nas policies RLS da
 * migration 0025. Uma loja sem `marketplace_access` recebe só os 100 marcados
 * como `preview`; o admin recebe também rascunhos e arquivados. Esta camada
 * apenas ordena, filtra e pagina o que o banco já devolveu — replicar a regra de
 * acesso no TypeScript criaria uma segunda fonte de verdade para divergir da
 * primeira, que é exatamente o tipo de bug que RLS existe para impedir.
 */

export const MARKETPLACE_PAGE_SIZE = 48;

export type MarketplaceSort = "recentes" | "menor_preco" | "maior_preco";

export type MarketplaceQueryParams = {
  q?: string;
  brand?: string;
  sole?: string;
  status?: string;
  page?: number;
  sort?: MarketplaceSort;
  /** Restringe a um conjunto de ids — usado para filtrar por álbum. */
  ids?: string[];
};

export type MarketplaceProduct = {
  id: string;
  name: string;
  brand: string;
  brandOther: string | null;
  sole: string;
  suggestedPrice: number;
  sizeMin: number;
  sizeMax: number;
  status: string;
  preview: boolean;
  sourceAlbumId: string;
  photoPaths: string[];
};

const ORDENACAO: Record<MarketplaceSort, { coluna: string; asc: boolean }> = {
  // `source_rank` é o album_id sequencial do Yupoo: serve de régua de lançamento
  // sem o fornecedor informar data nenhuma (ver docs/marketplace/00-YUPOO-RECON.md §8).
  recentes: { coluna: "source_rank", asc: false },
  menor_preco: { coluna: "suggested_price", asc: true },
  maior_preco: { coluna: "suggested_price", asc: false },
};

export async function queryMarketplaceProducts(
  supabase: SupabaseClient,
  params: MarketplaceQueryParams,
): Promise<{ items: MarketplaceProduct[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const de = (page - 1) * MARKETPLACE_PAGE_SIZE;
  const ate = de + MARKETPLACE_PAGE_SIZE - 1;
  const ordem = ORDENACAO[params.sort ?? "recentes"] ?? ORDENACAO.recentes;

  let query = supabase
    .from("marketplace_products")
    .select(
      "id, name, brand, brand_other, sole, suggested_price, size_min, size_max, status, preview, source_album_id, marketplace_photos(storage_path, position)",
      { count: "exact" },
    );

  // `ilike` com escape do `%` e `_`: sem isso, um `%` digitado na busca vira
  // curinga e devolve o acervo inteiro como se fosse resultado da pesquisa.
  if (params.q?.trim()) {
    const termo = params.q.trim().replace(/[%_]/g, (c) => `\\${c}`);
    query = query.ilike("name", `%${termo}%`);
  }
  // Lista vazia significa "álbum sem nenhuma chuteira", não "sem filtro". Sem
  // este caso explícito, um álbum vazio devolveria o acervo inteiro.
  if (params.ids) {
    if (params.ids.length === 0) return { items: [], total: 0 };
    query = query.in("id", params.ids);
  }
  if (params.brand) query = query.eq("brand", params.brand);
  if (params.sole) query = query.eq("sole", params.sole);
  if (params.status) query = query.eq("status", params.status);

  const { data, count, error } = await query
    .order(ordem.coluna, { ascending: ordem.asc, nullsFirst: false })
    .range(de, ate);

  if (error || !data) return { items: [], total: 0 };

  const itens = data.map((linha) => {
      const fotos = (linha.marketplace_photos ?? []) as Array<{
        storage_path: string;
        position: number;
      }>;
      return {
        id: linha.id,
        name: linha.name,
        brand: linha.brand,
        brandOther: linha.brand_other,
        sole: linha.sole,
        suggestedPrice: Number(linha.suggested_price),
        sizeMin: linha.size_min,
        sizeMax: linha.size_max,
        status: linha.status,
        preview: linha.preview,
        sourceAlbumId: linha.source_album_id,
        // A ordem das fotos importa: a posição 0 é a lateral externa escolhida
        // pelo vendedor, que é o ângulo que vende (recon §8). O embed do
        // PostgREST não garante ordem, então ordenamos aqui.
        photoPaths: fotos
          .sort((a, b) => a.position - b.position)
          .map((f) => f.storage_path),
      };
  });

  return {
    // Só na ordenação por lançamento: ordenar por recência agrupa as variantes do
    // mesmo modelo (mesmo cabedal em FG, TF e SG entram juntas, com a MESMA foto
    // de capa), e três cards visualmente idênticos em sequência leem como catálogo
    // repetido — quando na verdade são solados diferentes, que é sortimento real.
    // Intercalar por modelo desfaz a ilusão sem esconder nada.
    //
    // O rodízio é DENTRO da página, não global: reordenar as 990 exigiria trazer
    // todas para a memória a cada acesso. Como a página tem 48 itens e as
    // variantes de um mesmo modelo caem quase sempre juntas por serem próximas em
    // `source_rank`, embaralhar dentro da página resolve o caso real.
    items: params.sort && params.sort !== "recentes" ? itens : intercalarPorModelo(itens),
    total: count ?? 0,
  };
}

/** Rodízio entre modelos: um de cada, depois o segundo de cada, e assim por diante. */
function intercalarPorModelo(itens: MarketplaceProduct[]): MarketplaceProduct[] {
  const filas = new Map<string, MarketplaceProduct[]>();
  for (const item of itens) {
    // Chave = nome sem o sufixo de uso, que é o que separa as variantes de solado.
    const modelo = item.name.replace(/\s+\S.*\([A-Z]{2}\)$/, "").trim() || item.name;
    if (!filas.has(modelo)) filas.set(modelo, []);
    filas.get(modelo)!.push(item);
  }
  const saida: MarketplaceProduct[] = [];
  const listas = [...filas.values()];
  let restam = true;
  while (restam) {
    restam = false;
    for (const fila of listas) {
      const proximo = fila.shift();
      if (proximo) {
        saida.push(proximo);
        restam = true;
      }
    }
  }
  return saida;
}

/**
 * Facetas para os filtros. Derivadas do que a loja REALMENTE enxerga (a query
 * passa pela mesma RLS), então uma loja sem acesso não vê no filtro uma marca
 * que não existe no preview dela — filtro que devolve zero resultado sempre lê
 * como defeito.
 */
export async function queryMarketplaceFacets(supabase: SupabaseClient) {
  const { data } = await supabase.from("marketplace_products").select("brand, sole");
  const marcas = new Map<string, number>();
  const solados = new Map<string, number>();
  for (const linha of data ?? []) {
    marcas.set(linha.brand, (marcas.get(linha.brand) ?? 0) + 1);
    solados.set(linha.sole, (solados.get(linha.sole) ?? 0) + 1);
  }
  const ordenar = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([valor, total]) => ({ valor, total }));
  return { marcas: ordenar(marcas), solados: ordenar(solados) };
}

/** Um único produto do marketplace, para a tela de detalhe. */
export async function queryMarketplaceProduct(
  supabase: SupabaseClient,
  id: string,
): Promise<MarketplaceProduct | null> {
  const { data } = await supabase
    .from("marketplace_products")
    .select(
      "id, name, brand, brand_other, sole, suggested_price, size_min, size_max, status, preview, source_album_id, marketplace_photos(storage_path, position)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const fotos = (data.marketplace_photos ?? []) as Array<{ storage_path: string; position: number }>;
  return {
    id: data.id,
    name: data.name,
    brand: data.brand,
    brandOther: data.brand_other,
    sole: data.sole,
    suggestedPrice: Number(data.suggested_price),
    sizeMin: data.size_min,
    sizeMax: data.size_max,
    status: data.status,
    preview: data.preview,
    sourceAlbumId: data.source_album_id,
    photoPaths: fotos.sort((a, b) => a.position - b.position).map((f) => f.storage_path),
  };
}
