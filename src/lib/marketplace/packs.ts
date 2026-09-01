import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Leitura do pack e seus álbuns.
 *
 * A estrutura é a do próprio Yupoo, que o revendedor já conhece:
 *
 *   PACK (capa, nome, preço)  →  ÁLBUM (Nike, adidas, Retrô…)  →  CHUTEIRAS
 *
 * Um produto pode estar em VÁRIOS álbuns (migration 0027), porque recortes por
 * uso — "Futsal", "Society" — cruzam as marcas. Por isso a contagem de cada
 * álbum vem da tabela de ligação, e a soma dos álbuns pode ser maior que o total
 * do pack. Isso não é erro de conta: é a mesma chuteira aparecendo em dois
 * lugares, e a interface precisa não sugerir o contrário.
 */

export type MarketplaceAlbum = {
  id: string;
  name: string;
  coverPath: string | null;
  total: number;
};

export type MarketplacePack = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverPath: string | null;
  price: number | null;
  albums: MarketplaceAlbum[];
  /** Chuteiras DISTINTAS no pack — não a soma dos álbuns. */
  totalProdutos: number;
};

export async function queryPackPrincipal(
  supabase: SupabaseClient,
): Promise<MarketplacePack | null> {
  const { data: pack } = await supabase
    .from("marketplace_packs")
    .select("id, name, slug, description, cover_path, price")
    .eq("status", "published")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pack) return null;

  const { data: albuns } = await supabase
    .from("marketplace_albums")
    .select("id, name, cover_path, position, marketplace_album_products(marketplace_product_id)")
    .eq("pack_id", pack.id)
    .order("position", { ascending: true });

  const vistos = new Set<string>();
  const albums: MarketplaceAlbum[] = [];

  for (const a of albuns ?? []) {
    const ligacoes = (a.marketplace_album_products ?? []) as Array<{
      marketplace_product_id: string;
    }>;
    ligacoes.forEach((l) => vistos.add(l.marketplace_product_id));
    albums.push({
      id: a.id,
      name: a.name,
      coverPath: a.cover_path,
      total: ligacoes.length,
    });
  }

  return {
    id: pack.id,
    name: pack.name,
    slug: pack.slug,
    description: pack.description,
    coverPath: pack.cover_path,
    price: pack.price === null ? null : Number(pack.price),
    albums,
    totalProdutos: vistos.size,
  };
}

/** Ids das chuteiras de um álbum — usado pelo botão "adicionar álbum inteiro". */
export async function queryIdsDoAlbum(
  supabase: SupabaseClient,
  albumId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("marketplace_album_products")
    .select("marketplace_product_id")
    .eq("album_id", albumId);
  return (data ?? []).map((l) => l.marketplace_product_id);
}

/** Ids de TODAS as chuteiras do pack, sem repetir as que estão em dois álbuns. */
export async function queryIdsDoPack(
  supabase: SupabaseClient,
  packId: string,
): Promise<string[]> {
  const { data: albuns } = await supabase
    .from("marketplace_albums")
    .select("marketplace_album_products(marketplace_product_id)")
    .eq("pack_id", packId);

  const ids = new Set<string>();
  for (const a of albuns ?? []) {
    const ligacoes = (a.marketplace_album_products ?? []) as Array<{
      marketplace_product_id: string;
    }>;
    ligacoes.forEach((l) => ids.add(l.marketplace_product_id));
  }
  return [...ids];
}

/** Nome de um álbum, para o cabeçalho da listagem filtrada. */
export async function queryNomeDoAlbum(
  supabase: SupabaseClient,
  albumId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("marketplace_albums")
    .select("name")
    .eq("id", albumId)
    .maybeSingle();
  return data?.name ?? null;
}
