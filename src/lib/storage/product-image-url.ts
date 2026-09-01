import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Bucket de cada origem de foto. Produto importado do marketplace NÃO tem cópia
 * das imagens: `product_photos.storage_path` aponta para o acervo global, e só
 * na primeira edição o produto ganha arquivos próprios (copy-on-write, migration
 * 0025). Sem esta distinção, toda foto importada renderiza quebrada — no painel
 * e, pior, na vitrine pública.
 */
export const BUCKET_POR_ORIGEM = {
  own: "product-images",
  marketplace: "marketplace-assets",
} as const;

export type OrigemFoto = keyof typeof BUCKET_POR_ORIGEM;

/**
 * Helper consolidado de URL pública do Supabase Storage — antes duplicado byte-a-byte em `src/app/[slug]/page.tsx`
 * (L83-88) e `src/lib/products/public-actions.ts` (L58-63). Extraído aqui
 * como fonte única de verdade (05-CONTEXT.md: "reaproveitar helper
 * existente... se houver").
 *
 * Retorna `null` quando `storagePath` é `null` (produto sem foto de capa) —
 * casa o ternário `? ... : null` dos dois call sites originais.
 */
export function getProductImagePublicUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string | null,
  // Padrão `own` para não exigir mudança em nenhum call site que só lida com
  // fotos próprias — a origem só precisa ser informada onde produto importado
  // pode aparecer.
  origem: OrigemFoto | string | null = "own"
): string | null {
  if (!storagePath) return null;
  const bucket =
    BUCKET_POR_ORIGEM[(origem as OrigemFoto) ?? "own"] ?? BUCKET_POR_ORIGEM.own;
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}
