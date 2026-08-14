"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { productSchema } from "@/lib/validation/product";
import { parseBRLPrice } from "@/lib/currency/brl";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * `warning` = o produto FOI salvo, mas uma etapa secundária (hoje só o upload
 * de fotos) falhou. Nunca devolver `error` nesse caso: o form trataria como
 * "não salvou" e o revendedor clicaria de novo, criando um segundo produto.
 */
export type ProductActionResult =
  | { error: string }
  | { success: true; id: string; warning?: string };

function revalidateProdutos(productId?: string) {
  revalidatePath("/admin/produtos");
  if (productId) {
    revalidatePath(`/admin/produtos/${productId}/editar`);
  }
}

/**
 * Assinaturas de magic bytes por content-type aceito para fotos de produto —
 * mesma checagem de src/lib/settings/actions.ts (`validateLogoFile`,
 * 03-PATTERNS.md §Magic-byte + size file validation), duplicada aqui pela
 * mesma razão documentada lá: `validateLogoFile` não é exportada e este
 * plano (03-04) não modifica src/lib/settings/actions.ts.
 */
const PHOTO_MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS_PER_PRODUCT = 5;

function photoExtension(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

/**
 * Mesma ordem de checagem de `validateLogoFile` (type -> size -> assinatura)
 * e mesmas mensagens do Copywriting Contract (03-UI-SPEC.md).
 */
async function validatePhotoFile(file: File): Promise<{ error: string } | null> {
  const signature = PHOTO_MAGIC_BYTES[file.type];
  if (!signature) {
    return { error: "Envie apenas fotos em JPG, PNG ou WEBP." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "Essa foto passou do limite de 5MB." };
  }
  const headerBytes = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  const matchesSignature = signature.every((byte, index) => headerBytes[index] === byte);
  if (!matchesSignature) {
    return { error: "Envie apenas fotos em JPG, PNG ou WEBP." };
  }
  return null;
}

type OwnedStore = { supabase: SupabaseClient<Database>; userId: string; storeId: string };

/**
 * Núcleo compartilhado do pipeline de upload de fotos (03-RESEARCH.md
 * Pattern 2), usado tanto por `saveProduct` (fotos anexadas ao mesmo
 * FormData da criação) quanto por `addProductPhotos` (edição, Plan 03-05).
 * Recontagem server-side de existentes + novas ANTES de qualquer upload
 * (Pitfall 6 — nunca confiar só no limite de 5 aplicado na UI); todas as
 * fotos são validadas (magic bytes + 5MB) antes de qualquer upload, para
 * nunca deixar um upload parcial quando uma foto do lote é inválida.
 * `position` é sempre um índice sequencial contínuo às fotos já existentes
 * (posição 0 = capa, D-11); o path usa sempre um `crypto.randomUUID()`,
 * nunca o nome original do arquivo.
 */
async function uploadAndInsertPhotos(
  owned: OwnedStore,
  productId: string,
  photos: File[]
): Promise<{ error: string } | null> {
  if (photos.length === 0) {
    return null;
  }

  const { count: existingCount, error: countError } = await owned.supabase
    .from("product_photos")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  if (countError) {
    return { error: "Não foi possível verificar as fotos existentes. Tente novamente." };
  }

  const startPosition = existingCount ?? 0;
  if (startPosition + photos.length > MAX_PHOTOS_PER_PRODUCT) {
    return { error: "Você já atingiu o limite de 5 fotos por produto." };
  }

  for (const photo of photos) {
    const validationError = await validatePhotoFile(photo);
    if (validationError) {
      return validationError;
    }
  }

  for (const [index, photo] of photos.entries()) {
    const path = `${owned.userId}/${productId}/${crypto.randomUUID()}.${photoExtension(photo.type)}`;
    const { error: uploadError } = await owned.supabase.storage
      .from("product-images")
      .upload(path, photo, { contentType: photo.type });

    if (uploadError) {
      return { error: "Não foi possível enviar uma das fotos. Tente novamente." };
    }

    const { error: insertError } = await owned.supabase.from("product_photos").insert({
      product_id: productId,
      storage_path: path,
      position: startPosition + index,
    });

    if (insertError) {
      return { error: "Não foi possível salvar uma das fotos. Tente novamente." };
    }
  }

  return null;
}

/**
 * Sequência "getUser() -> localizar loja por owner_id" — copiada verbatim de
 * src/lib/settings/actions.ts linhas 63-84 (03-PATTERNS.md §Owner-scoped
 * store lookup permite duplicar; extrair para módulo compartilhado é
 * opcional). Toda Server Action de produto começa por aqui, antes de
 * qualquer mutação no banco.
 */
async function getOwnedStore(): Promise<
  | { error: string }
  | { supabase: SupabaseClient<Database>; userId: string; storeId: string }
> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const { data: store, error: storeLookupError } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user.id)
    .single();

  if (storeLookupError || !store) {
    return { error: "Não foi possível localizar sua loja. Tente novamente." };
  }

  return { supabase, userId: userData.user.id, storeId: store.id };
}

type ParsedProductFields = {
  name: string;
  brand: string;
  brandOther: string | null;
  line: string | null;
  sole: string | null;
  category: string | null;
  fulfillment: "sob_encomenda" | "pronta_entrega" | "ambos" | null;
  price: number;
  description: string | null;
  sizes: { size: number; available: boolean }[];
  /** D-09/D-10 (Plan 04-05): null = herda hide_sold_out_default da loja. */
  hideWhenSoldOut: boolean | null;
};

/**
 * Validação de campos de produto compartilhada por `saveProduct` (criação) e
 * `updateProduct` (edição, Plan 03-05) — nunca duas implementações
 * divergentes da mesma checagem (Zod + brandOther + parseBRLPrice + parse de
 * sizes), mesmo espírito de `uploadAndInsertPhotos` para o pipeline de fotos.
 * NÃO chama `getOwnedStore()` nem toca o banco — é só parse+validação de
 * `FormData`.
 */
function parseProductFormData(formData: FormData): { error: string } | { data: ParsedProductFields } {
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    brand: formData.get("brand"),
    brandOther: formData.get("brandOther") ?? "",
    line: formData.get("line") ?? "",
    sole: formData.get("sole") ?? "",
    category: formData.get("category") ?? "",
    fulfillment: formData.get("fulfillment") || undefined,
    price: formData.get("price"),
    description: formData.get("description") ?? "",
    hideWhenSoldOut: formData.get("hideWhenSoldOut") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const isBrandOther = parsed.data.brand === "Outra";
  if (isBrandOther && !parsed.data.brandOther) {
    return { error: "Informe a marca quando selecionar \"Outra\"." };
  }

  const price = parseBRLPrice(parsed.data.price);
  if (price === null) {
    return { error: "Informe um preço válido, ex.: 199,90." };
  }

  // Tamanhos escolhidos (D-01) chegam como JSON string num único campo
  // "sizes" (convenção documentada em productSchema.ts e usada por
  // product-form.tsx no onSubmit) — revalidados aqui mesmo formato
  // (size inteiro 36-45, available boolean, T-03-08) antes de qualquer
  // insert/update em `products`/`product_sizes`.
  const sizesRaw = formData.get("sizes");
  let sizesInput: unknown = [];
  if (typeof sizesRaw === "string" && sizesRaw.trim().length > 0) {
    try {
      sizesInput = JSON.parse(sizesRaw);
    } catch {
      return { error: "Dados de tamanhos inválidos." };
    }
  }

  const sizesParsed = productSchema.shape.sizes.safeParse(sizesInput);
  if (!sizesParsed.success) {
    return { error: "Dados de tamanhos inválidos." };
  }

  // "" (ou ausente) -> null (herda hide_sold_out_default da loja, D-10);
  // "true"/"false" -> boolean explícito (exceção configurada, D-09).
  const hideWhenSoldOut = parsed.data.hideWhenSoldOut === "true"
    ? true
    : parsed.data.hideWhenSoldOut === "false"
      ? false
      : null;

  return {
    data: {
      name: parsed.data.name,
      brand: parsed.data.brand,
      brandOther: isBrandOther ? parsed.data.brandOther || null : null,
      line: parsed.data.line || null,
      sole: parsed.data.sole || null,
      category: parsed.data.category || null,
      fulfillment: parsed.data.fulfillment ?? null,
      price,
      description: parsed.data.description || null,
      sizes: sizesParsed.data ?? [],
      hideWhenSoldOut,
    },
  };
}

/**
 * Cadastra um produto novo (PROD-01/PROD-02, D-08/D-09). Campos obrigatórios
 * são só nome/marca/preço — os demais (line/sole/category/fulfillment/
 * description) ficam `null` quando vazios, permitindo o rascunho rápido que
 * D-09 exige. `status` nasce `'draft'` por padrão (coluna `default 'draft'`
 * da migration 0003) a menos que `intent="publish"` (botão "Publicar" do
 * form, D-10 revisado): mesma coluna e mesmos dois valores que
 * `publishProduct`/`unpublishProduct` já escrevem, só definida no INSERT em
 * vez de precisar de um segundo UPDATE logo depois — evita a volta de criar
 * -> salvar -> reabrir editar só pra achar o botão de publicar.
 *
 * NÃO toca em `product_sizes`/`product_photos` aqui — essas são fatias
 * separadas (Plans 03-03/03-04).
 */
export async function saveProduct(formData: FormData): Promise<ProductActionResult> {
  const parsedFields = parseProductFormData(formData);
  if ("error" in parsedFields) {
    return { error: parsedFields.error };
  }
  const fields = parsedFields.data;

  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  const status = formData.get("intent") === "publish" ? "published" : "draft";

  const { data: product, error: insertError } = await owned.supabase
    .from("products")
    .insert({
      store_id: owned.storeId,
      name: fields.name,
      brand: fields.brand,
      brand_other: fields.brandOther,
      line: fields.line,
      sole: fields.sole,
      category: fields.category,
      fulfillment: fields.fulfillment,
      price: fields.price,
      description: fields.description,
      hide_when_sold_out: fields.hideWhenSoldOut,
      status,
    })
    .select("id")
    .single();

  if (insertError || !product) {
    return { error: "Não foi possível salvar o produto. Verifique sua conexão e tente novamente." };
  }

  // Só as linhas escolhidas (nunca a grade inteira) — um produto sem
  // nenhum tamanho marcado fica sem linhas em `product_sizes` (rascunho,
  // D-10 — a Fase 4 deriva "esgotado" via EXISTS falso).
  if (fields.sizes.length > 0) {
    const { error: sizesInsertError } = await owned.supabase.from("product_sizes").insert(
      fields.sizes.map((item) => ({
        product_id: product.id,
        size: item.size,
        available: item.available,
      }))
    );

    if (sizesInsertError) {
      // Postgres não é transacional através do PostgREST: o INSERT do produto
      // acima já commitou. Desfazer aqui é o que impede o retry do revendedor
      // ("Tente novamente") de virar um SEGUNDO produto idêntico — nada de
      // valor se perde, porque nenhuma foto foi enviada ainda.
      await owned.supabase.from("products").delete().eq("id", product.id);
      return { error: "Não foi possível salvar os tamanhos do produto. Tente novamente." };
    }
  }

  // Fotos (D-11/D-12/D-13, PROD-03) são opcionais no cadastro (D-09) — o
  // product-form.tsx anexa cada File já comprimido no cliente sob o mesmo
  // campo "photos" (append em loop, nunca .set). Reusa o mesmo helper que
  // `addProductPhotos` (edição) chama, para nunca duplicar a lógica de
  // validação/recontagem (Task 2 do 03-04-PLAN.md).
  const photoFiles = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (photoFiles.length > 0) {
    const photoError = await uploadAndInsertPhotos(owned, product.id, photoFiles);
    if (photoError) {
      // O produto e os tamanhos já estão salvos — devolver `error` aqui faria
      // o revendedor achar que nada foi salvo e cadastrar tudo de novo (era a
      // origem dos produtos duplicados). Devolve sucesso com aviso: o form
      // leva para a edição desse produto, onde as fotos são reenviadas uma a
      // uma sem refazer o cadastro.
      revalidateProdutos(product.id);
      return { success: true, id: product.id, warning: photoError.error };
    }
  }

  revalidateProdutos(product.id);
  return { success: true, id: product.id };
}

/**
 * Edita um produto existente (PROD-05, Plan 03-05). Mesma validação de
 * `saveProduct` via `parseProductFormData` — nunca uma segunda implementação
 * divergente. `owned.supabase.from("products").update(...).eq("id", productId)`
 * é escopado pela RLS (`owner_full_access_products`, subquery por
 * `stores.owner_id`): um `productId` de outra loja simplesmente afeta 0
 * linhas, sem erro (T-03-11, testado em edit-delete-product.test.ts) — nunca
 * confiar no `productId` isoladamente.
 *
 * Reescreve `product_sizes` com a estratégia upsert-depois-delete: grava
 * primeiro os tamanhos recebidos e só então remove os que saíram da grade —
 * nunca delete-depois-insert, que deixaria o produto sem tamanho nenhum
 * (= "Esgotado" na vitrine) se o insert seguinte falhasse.
 *
 * NÃO mexe em `product_photos` aqui — fotos têm suas próprias actions
 * dedicadas (`addProductPhotos`/`updatePhotoOrder`/`removePhoto`, Plan 03-04).
 *
 * `intent="publish"` (botão "Publicar" do form, D-10 revisado) inclui
 * `status: 'published'` no mesmo UPDATE dos campos — publica um rascunho já
 * existente numa ação só, sem precisar de uma segunda chamada a
 * `publishProduct`. Sem `intent="publish"`, `status` nunca é incluído no
 * objeto de update — um produto já publicado que só teve campos salvos
 * continua publicado, e despublicar continua sendo obra exclusiva de
 * `unpublishProduct` (botão "Rascunho", ação separada).
 */
export async function updateProduct(productId: string, formData: FormData): Promise<ProductActionResult> {
  const parsedFields = parseProductFormData(formData);
  if ("error" in parsedFields) {
    return { error: parsedFields.error };
  }
  const fields = parsedFields.data;

  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  const { error: updateError } = await owned.supabase
    .from("products")
    .update({
      name: fields.name,
      brand: fields.brand,
      brand_other: fields.brandOther,
      line: fields.line,
      sole: fields.sole,
      category: fields.category,
      fulfillment: fields.fulfillment,
      price: fields.price,
      description: fields.description,
      hide_when_sold_out: fields.hideWhenSoldOut,
      ...(formData.get("intent") === "publish" ? { status: "published" as const } : {}),
    })
    .eq("id", productId);

  if (updateError) {
    return { error: "Não foi possível salvar as alterações. Verifique sua conexão e tente novamente." };
  }

  // Upsert-depois-delete, nunca delete-depois-insert: sem transação no
  // PostgREST, apagar primeiro abre uma janela em que o produto fica com ZERO
  // tamanhos — e se o insert seguinte falhar (rede caindo no meio), o produto
  // fica permanentemente sem tamanho nenhum, ou seja, "Esgotado" na vitrine
  // sem o revendedor ter pedido isso. Nesta ordem o pior caso é sobrar um
  // tamanho antigo a mais, que é visível e corrigível.
  if (fields.sizes.length > 0) {
    const { error: sizesUpsertError } = await owned.supabase.from("product_sizes").upsert(
      fields.sizes.map((item) => ({
        product_id: productId,
        size: item.size,
        available: item.available,
      })),
      { onConflict: "product_id,size" }
    );

    if (sizesUpsertError) {
      return { error: "Não foi possível salvar os tamanhos do produto. Tente novamente." };
    }
  }

  // Remove só os tamanhos que saíram da grade (nunca todos de uma vez quando
  // ainda há tamanhos escolhidos).
  const keptSizes = fields.sizes.map((item) => item.size);
  const removeStale = owned.supabase.from("product_sizes").delete().eq("product_id", productId);
  const { error: deleteSizesError } = keptSizes.length > 0
    ? await removeStale.not("size", "in", `(${keptSizes.join(",")})`)
    : await removeStale;

  if (deleteSizesError) {
    return { error: "Não foi possível atualizar os tamanhos do produto. Tente novamente." };
  }

  revalidateProdutos(productId);
  return { success: true, id: productId };
}

/**
 * Exclui um produto (PROD-05, hard delete, Plan 03-05). Storage é um sistema
 * separado do Postgres, então `on delete cascade` (products -> product_sizes/
 * product_photos) NUNCA apaga os blobs no bucket (03-RESEARCH.md Pitfall 1) —
 * por isso a limpeza via `deleteProductPhotosStorage` acontece ANTES do
 * `DELETE FROM products`, enquanto as linhas de `product_photos` (e portanto
 * os `storage_path`) ainda existem para serem lidas. RLS escopa por dono
 * (T-03-11): um `productId` de outra loja não retorna nenhuma foto (loop
 * vazio, nenhuma chamada de storage) e o delete final afeta 0 linhas, sem
 * erro.
 */
export async function deleteProduct(productId: string): Promise<ProductActionResult> {
  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  await deleteProductPhotosStorage(owned.supabase, productId);

  const { error: deleteError } = await owned.supabase.from("products").delete().eq("id", productId);
  if (deleteError) {
    return { error: "Não foi possível excluir o produto. Tente novamente." };
  }

  revalidateProdutos();
  return { success: true, id: productId };
}

/**
 * Publica um produto rascunho (D-10, Plan 03-05) — toggle manual SEM gate de
 * completude (03-RESEARCH.md Open Question 2: não bloquear publicação por
 * falta de foto/tamanho). `status='published'` é o portão que a vitrine
 * pública (Fase 4) consome. RLS escopa por dono (T-03-11).
 */
export async function publishProduct(productId: string): Promise<ProductActionResult> {
  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  const { error } = await owned.supabase.from("products").update({ status: "published" }).eq("id", productId);
  if (error) {
    return { error: "Não foi possível publicar o produto. Tente novamente." };
  }

  revalidateProdutos(productId);
  return { success: true, id: productId };
}

/**
 * Volta um produto publicado para rascunho (D-10, Plan 03-05) — mesmo toggle
 * manual reversível de `publishProduct`, sem diálogo de confirmação (baixo
 * risco, T-03-12).
 */
export async function unpublishProduct(productId: string): Promise<ProductActionResult> {
  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  const { error } = await owned.supabase.from("products").update({ status: "draft" }).eq("id", productId);
  if (error) {
    return { error: "Não foi possível mover o produto para rascunho. Tente novamente." };
  }

  revalidateProdutos(productId);
  return { success: true, id: productId };
}

/**
 * Adiciona fotos a um produto já existente (modo edição, Plan 03-05; também
 * reutilizável por qualquer fluxo que precise anexar fotos fora do momento
 * de criação). Compartilha a mesma validação/recontagem de `saveProduct`
 * via `uploadAndInsertPhotos` — nunca duas implementações divergentes do
 * mesmo pipeline (03-RESEARCH.md Pattern 2).
 */
export async function addProductPhotos(productId: string, formData: FormData): Promise<ProductActionResult> {
  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  const photoFiles = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const photoError = await uploadAndInsertPhotos(owned, productId, photoFiles);
  if (photoError) {
    return photoError;
  }

  // A capa (posição 0) alimenta a thumbnail da listagem — sem revalidar, sair
  // da edição mostraria a capa antiga.
  revalidateProdutos(productId);
  return { success: true, id: productId };
}

/**
 * Persiste a nova ordem de fotos após um drag-and-drop (D-12) — nunca
 * renomeia/move o blob no bucket, só atualiza a coluna `position`
 * (03-RESEARCH.md Pattern 2). Como `(product_id, position)` é UNIQUE
 * (0003_products_schema_rls.sql), a estratégia usada é duas fases: primeiro
 * move todas as fotos do lote para posições temporárias negativas (nunca
 * colidem com posições reais, que são sempre >= 0), depois aplica as
 * posições finais — evita violar a constraint UNIQUE no meio da operação.
 * RLS garante escopo por dono: um id de foto de outra loja simplesmente não
 * é afetado por nenhum dos updates (0 linhas, sem erro), nunca vazando nem
 * quebrando o pipeline (T-03-10, testado cross-tenant no 03-04-PLAN.md).
 */
export async function updatePhotoOrder(
  order: { id: string; position: number }[]
): Promise<ProductActionResult> {
  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  if (order.length === 0) {
    return { success: true, id: "" };
  }

  for (const [index, item] of order.entries()) {
    const { error } = await owned.supabase
      .from("product_photos")
      .update({ position: -(index + 1) })
      .eq("id", item.id);

    if (error) {
      return { error: "Não foi possível reordenar as fotos. Tente novamente." };
    }
  }

  for (const item of order) {
    const { error } = await owned.supabase
      .from("product_photos")
      .update({ position: item.position })
      .eq("id", item.id);

    if (error) {
      return { error: "Não foi possível reordenar as fotos. Tente novamente." };
    }
  }

  revalidatePath("/admin/produtos");
  return { success: true, id: order[0].id };
}

/**
 * Remove uma única foto (D-13): esvazia só aquele slot, nunca mexe nas
 * outras fotos do produto. Limpeza do blob no Storage é best-effort (o
 * `DELETE` da linha é a fonte de verdade, mesma disciplina de
 * `deleteProductPhotosStorage` abaixo) — se o storage_path não puder ser
 * lido (RLS bloqueia cross-tenant, ou linha já não existe), retorna erro
 * sem apagar nada, nunca prossegue "às cegas".
 */
export async function removePhoto(photoId: string): Promise<ProductActionResult> {
  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  const { data: photo, error: fetchError } = await owned.supabase
    .from("product_photos")
    .select("storage_path")
    .eq("id", photoId)
    .single();

  if (fetchError || !photo) {
    return { error: "Não foi possível encontrar essa foto. Tente novamente." };
  }

  await owned.supabase.storage.from("product-images").remove([photo.storage_path]);

  const { error: deleteError } = await owned.supabase.from("product_photos").delete().eq("id", photoId);
  if (deleteError) {
    return { error: "Não foi possível remover a foto. Tente novamente." };
  }

  revalidatePath("/admin/produtos");
  return { success: true, id: photoId };
}

/**
 * Helper reutilizável pelo Plan 03-05 (exclusão de produto) — Storage é um
 * sistema separado do Postgres, então `on delete cascade` limpa as LINHAS de
 * `product_photos` mas nunca os blobs no bucket (03-RESEARCH.md Pitfall 1).
 * Buscar todos os `storage_path` do produto e remover em lote ANTES (ou
 * depois, best-effort) do `DELETE FROM products` evita arquivos órfãos.
 * Recebe o `supabase` já autenticado do chamador (nunca cria um client novo)
 * para reusar a mesma sessão/RLS do Server Action de exclusão.
 */
export async function deleteProductPhotosStorage(
  supabase: SupabaseClient<Database>,
  productId: string
): Promise<void> {
  const { data: photos } = await supabase.from("product_photos").select("storage_path").eq("product_id", productId);

  if (photos && photos.length > 0) {
    await supabase.storage.from("product-images").remove(photos.map((photo) => photo.storage_path));
  }
}

/**
 * Atalho "Marcar produto inteiro como esgotado" (D-04). Resolução de
 * ambiguidade documentada em 03-RESEARCH.md: um único UPDATE em lote sobre
 * `product_sizes`, sem coluna extra de disponibilidade agregada em
 * `products`. A policy RLS de `product_sizes` (subquery
 * product_id -> products -> stores.owner_id) garante que só afeta linhas de
 * produtos da própria loja — chamado num produto de outra loja atualiza 0
 * linhas, sem erro (T-03-09, testado em tests/products/availability.test.ts).
 */
export async function markProductEsgotado(productId: string): Promise<ProductActionResult> {
  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  const { error } = await owned.supabase
    .from("product_sizes")
    .update({ available: false })
    .eq("product_id", productId);

  if (error) {
    return { error: "Não foi possível marcar o produto como esgotado. Tente novamente." };
  }

  revalidateProdutos(productId);
  return { success: true, id: productId };
}
