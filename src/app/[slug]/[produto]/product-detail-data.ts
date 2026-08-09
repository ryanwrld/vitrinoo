import { createClient } from "@/lib/supabase/server";
import { queryPublicProductDetail } from "@/lib/products/public-detail";
import { getProductImagePublicUrl } from "@/lib/storage/product-image-url";
import { buildProductUrl } from "@/lib/slug/store-url";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";
import type { ProductOrderPanelProps } from "./product-order-panel";

/**
 * Resolução compartilhada dos dados de detalhe do produto — consumida
 * IGUALMENTE pela página cheia (`[produto]/page.tsx`, acesso direto/OG/
 * compartilhamento) e pelo modal interceptado (`@modal/(.)[produto]/
 * page.tsx`, navegação a partir do grid). Uma única fonte garante que o
 * modal nunca divirja da página em guard de visibilidade, template de
 * mensagem ou URL do produto.
 *
 * Retorna `null` em dois casos distintos, sinalizados por `reason`:
 * - "store": o slug não existe → chamador usa notFound()
 * - "product": a loja existe mas o produto não é visível (inexistente,
 *   rascunho ou oculto pela regra de esgotado) → chamador renderiza o 404
 *   inline com link de volta para /${slug}
 *
 * SEM diretiva de cache aqui, deliberadamente (mesma disciplina do resto
 * da vitrine — estoque precisa refletir o painel em segundos).
 */
export type ProductDetailResult =
  | { ok: true; storeId: string; productId: string; panel: ProductOrderPanelProps }
  | { ok: false; reason: "store" | "product" };

export async function loadProductDetail(slug: string, produto: string): Promise<ProductDetailResult> {
  const supabase = await createClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, slug, hide_sold_out_default")
    .eq("slug", slug)
    .single();

  if (storeError || !store) {
    return { ok: false, reason: "store" };
  }

  const detail = await queryPublicProductDetail(supabase, store.id, produto, store.hide_sold_out_default);

  if (!detail) {
    return { ok: false, reason: "product" };
  }

  const { data: storeSettings } = await supabase
    .from("store_settings")
    .select("whatsapp_e164, message_template")
    .eq("store_id", store.id)
    .single();

  const galleryUrls = detail.photos
    .map((photo) => getProductImagePublicUrl(supabase, photo.storage_path))
    .filter((url): url is string => url !== null);

  return {
    ok: true,
    storeId: store.id,
    productId: detail.id,
    panel: {
      product: {
        name: detail.name,
        line: detail.line,
        sole: detail.sole,
        price: detail.price,
      },
      sizes: detail.sizes,
      whatsappE164: storeSettings?.whatsapp_e164 ?? "",
      messageTemplate: storeSettings?.message_template ?? DEFAULT_MESSAGE_TEMPLATE,
      coverUrl: galleryUrls[0] ?? null,
      galleryUrls,
      storeId: store.id,
      productId: detail.id,
      slug,
      productUrl: buildProductUrl(slug, detail.id),
    },
  };
}
