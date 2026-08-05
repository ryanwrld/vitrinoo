import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Helper consolidado de URL pública do bucket `product-images` do Supabase
 * Storage — antes duplicado byte-a-byte em `src/app/[slug]/page.tsx`
 * (L83-88) e `src/lib/products/public-actions.ts` (L58-63). Extraído aqui
 * como fonte única de verdade (05-CONTEXT.md: "reaproveitar helper
 * existente... se houver").
 *
 * Retorna `null` quando `storagePath` é `null` (produto sem foto de capa) —
 * casa o ternário `? ... : null` dos dois call sites originais.
 */
export function getProductImagePublicUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string | null
): string | null {
  if (!storagePath) return null;
  return supabase.storage.from("product-images").getPublicUrl(storagePath).data
    .publicUrl;
}
