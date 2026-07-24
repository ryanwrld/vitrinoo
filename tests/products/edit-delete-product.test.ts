import { describe, it, expect, vi } from "vitest";
import { createAnonClient } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";
import {
  saveProduct,
  addProductPhotos,
  updateProduct,
  deleteProduct,
  publishProduct,
  unpublishProduct,
} from "@/lib/products/actions";

/**
 * Adaptado de tests/products/create-product.test.ts e
 * tests/products/photo-upload.test.ts (mesmo mock de next/headers/next/navigation
 * + helper de seed via signUp+saveOnboarding + convenção de "trocar sessão no
 * cookie jar compartilhado" para provar isolamento cross-tenant).
 *
 * Cobre o 03-05-PLAN.md (Task 1): updateProduct (campos + reescrita de
 * product_sizes via delete+insert), deleteProduct (cascade de linhas + limpeza
 * best-effort do Storage — 03-RESEARCH.md Pitfall 1), publishProduct/
 * unpublishProduct (D-10, toggle manual sem gate de completude), e isolamento
 * cross-tenant (T-03-11) para as três actions.
 *
 * Este arquivo começa VERMELHO: `updateProduct`/`deleteProduct`/
 * `publishProduct`/`unpublishProduct` ainda não existem até a Task 2.
 */
const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

function uniqueEmail(label: string): string {
  return `vitrinoo.editdelete.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

async function signUpAndCompleteOnboarding(label: string): Promise<{ email: string; password: string }> {
  const email = uniqueEmail(label);
  const password = "SenhaForte123!";
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/onboarding");

  const onboardingFormData = new FormData();
  onboardingFormData.set("name", "Chuteiras Import Teste");
  onboardingFormData.set("accentColor", "#0D3D2B");
  onboardingFormData.set("tagline", "Frase original");
  onboardingFormData.set("whatsapp", "(11) 99999-0000");
  onboardingFormData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
  await expect(saveOnboarding(onboardingFormData)).rejects.toThrow("NEXT_REDIRECT:/dashboard");

  return { email, password };
}

/**
 * Verifica os dados persistidos via um client anônimo autenticado, nunca
 * reaproveitando o client interno das Server Actions. Retorna também o
 * `userId` — necessário para montar o path de Storage
 * ({owner_id}/{product_id}/{uuid}.{ext}) usado na checagem de limpeza.
 */
async function signInAndFindStore(
  email: string,
  password: string
): Promise<{ client: ReturnType<typeof createAnonClient>; storeId: string; userId: string }> {
  const client = createAnonClient();
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.user) {
    throw new Error(`Falha ao autenticar client de verificação: ${signInError?.message}`);
  }
  const { data: stores, error: storesError } = await client
    .from("stores")
    .select("id")
    .eq("owner_id", signInData.user.id);
  if (storesError || !stores || stores.length === 0) {
    throw new Error(`Falha ao localizar store do usuário de teste: ${storesError?.message}`);
  }
  return { client, storeId: stores[0].id, userId: signInData.user.id };
}

function baseProductFormData(overrides: Partial<Record<"name" | "brand" | "price", string>> = {}): FormData {
  const formData = new FormData();
  formData.set("name", overrides.name ?? "Mercurial Vapor");
  formData.set("brand", overrides.brand ?? "Nike");
  formData.set("price", overrides.price ?? "199,90");
  return formData;
}

async function createDraftProduct(label: string): Promise<{ email: string; password: string; productId: string }> {
  const { email, password } = await signUpAndCompleteOnboarding(label);
  const result = await saveProduct(baseProductFormData({ name: `Produto ${label}` }));
  expect(result).toEqual({ success: true, id: expect.any(String) });
  const productId = (result as { success: true; id: string }).id;
  return { email, password, productId };
}

const PHOTO_SIGNATURES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

function makeImageFile(opts: {
  type: "image/png" | "image/jpeg" | "image/webp";
  headerBytes?: number[];
  sizeBytes?: number;
  name?: string;
}): File {
  const header = opts.headerBytes ?? PHOTO_SIGNATURES[opts.type];
  const totalSize = opts.sizeBytes ?? header.length + 64;
  const buffer = new Uint8Array(totalSize);
  header.forEach((byte, index) => {
    buffer[index] = byte;
  });
  const extension = opts.type.split("/")[1];
  return new File([buffer], opts.name ?? `foto.${extension}`, { type: opts.type });
}

async function createDraftProductWithPhoto(
  label: string
): Promise<{ email: string; password: string; productId: string }> {
  const { email, password, productId } = await createDraftProduct(label);

  const photoFormData = new FormData();
  photoFormData.append("photos", makeImageFile({ type: "image/png" }));
  photoFormData.append("photos", makeImageFile({ type: "image/jpeg" }));
  const photoResult = await addProductPhotos(productId, photoFormData);
  expect(photoResult).toEqual({ success: true, id: productId });

  return { email, password, productId };
}

describe("updateProduct — edição de campos e reescrita de product_sizes", () => {
  it("atualiza nome/marca/preço/opcionais e reescreve os tamanhos conforme o novo array", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("update-happy");

    const createFormData = new FormData();
    createFormData.set("name", "Nome Original");
    createFormData.set("brand", "Nike");
    createFormData.set("price", "199,90");
    createFormData.set("sizes", JSON.stringify([{ size: 38, available: false }, { size: 39, available: true }]));
    const createResult = await saveProduct(createFormData);
    expect(createResult).toEqual({ success: true, id: expect.any(String) });
    const productId = (createResult as { success: true; id: string }).id;

    const updateFormData = new FormData();
    updateFormData.set("name", "Nome Atualizado");
    updateFormData.set("brand", "Adidas");
    updateFormData.set("price", "249,90");
    updateFormData.set("line", "Linha X");
    updateFormData.set("sizes", JSON.stringify([{ size: 40, available: true }, { size: 41, available: false }]));

    const updateResult = await updateProduct(productId, updateFormData);
    expect(updateResult).toEqual({ success: true, id: productId });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: product, error: productError } = await client
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();
    expect(productError).toBeNull();
    expect(product?.name).toBe("Nome Atualizado");
    expect(product?.brand).toBe("Adidas");
    expect(product?.price).toBe(249.9);
    expect(product?.line).toBe("Linha X");

    const { data: sizes, error: sizesError } = await client
      .from("product_sizes")
      .select("size, available")
      .eq("product_id", productId)
      .order("size", { ascending: true });
    expect(sizesError).toBeNull();
    expect(sizes).toEqual([
      { size: 40, available: true },
      { size: 41, available: false },
    ]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("cross-tenant: updateProduct de um produto de outra loja não altera nada", async () => {
    const lojaA = await createDraftProduct("update-cross-a");
    const { client: clientA, storeId: storeIdA } = await signInAndFindStore(lojaA.email, lojaA.password);

    const lojaB = await signUpAndCompleteOnboarding("update-cross-b");

    const updateFormData = new FormData();
    updateFormData.set("name", "Nome Hackeado");
    updateFormData.set("brand", "Puma");
    updateFormData.set("price", "1,00");

    const updateResult = await updateProduct(lojaA.productId, updateFormData);
    expect("error" in updateResult ? updateResult.error : undefined).toBeUndefined();

    const { data: productStillOriginal, error } = await clientA
      .from("products")
      .select("name, brand")
      .eq("id", lojaA.productId)
      .single();
    expect(error).toBeNull();
    expect(productStillOriginal?.name).toBe("Produto update-cross-a");
    expect(productStillOriginal?.brand).toBe("Nike");

    const { client: clientB, storeId: storeIdB } = await signInAndFindStore(lojaB.email, lojaB.password);
    await clientA.from("stores").delete().eq("id", storeIdA);
    await clientB.from("stores").delete().eq("id", storeIdB);
  }, 30000);
});

describe("deleteProduct — remoção da linha (cascade) + limpeza do Storage (Pitfall 1)", () => {
  it("remove products (cascade sizes/photos) e chama storage.remove com os paths das fotos", async () => {
    const { email, password, productId } = await createDraftProductWithPhoto("delete-happy");
    const { client, storeId, userId } = await signInAndFindStore(email, password);

    const { data: filesBefore } = await client.storage.from("product-images").list(`${userId}/${productId}`);
    expect(filesBefore?.length ?? 0).toBeGreaterThan(0);

    const deleteResult = await deleteProduct(productId);
    expect(deleteResult).toEqual({ success: true, id: productId });

    const { data: productAfter, error: productError } = await client.from("products").select("id").eq("id", productId);
    expect(productError).toBeNull();
    expect(productAfter).toEqual([]);

    const { data: sizesAfter } = await client.from("product_sizes").select("size").eq("product_id", productId);
    expect(sizesAfter).toEqual([]);

    const { data: photosAfter } = await client.from("product_photos").select("id").eq("product_id", productId);
    expect(photosAfter).toEqual([]);

    const { data: filesAfter } = await client.storage.from("product-images").list(`${userId}/${productId}`);
    expect(filesAfter ?? []).toEqual([]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("cross-tenant: deleteProduct de um produto de outra loja não remove nada", async () => {
    const lojaA = await createDraftProductWithPhoto("delete-cross-a");
    const { client: clientA, storeId: storeIdA, userId: userIdA } = await signInAndFindStore(
      lojaA.email,
      lojaA.password
    );

    const lojaB = await signUpAndCompleteOnboarding("delete-cross-b");

    const deleteResult = await deleteProduct(lojaA.productId);
    expect("error" in deleteResult ? deleteResult.error : undefined).toBeUndefined();

    const { data: productStillThere, error } = await clientA
      .from("products")
      .select("id")
      .eq("id", lojaA.productId);
    expect(error).toBeNull();
    expect(productStillThere).toHaveLength(1);

    const { data: filesStillThere } = await clientA.storage
      .from("product-images")
      .list(`${userIdA}/${lojaA.productId}`);
    expect(filesStillThere?.length ?? 0).toBeGreaterThan(0);

    const { client: clientB, storeId: storeIdB } = await signInAndFindStore(lojaB.email, lojaB.password);
    await clientA.from("stores").delete().eq("id", storeIdA);
    await clientB.from("stores").delete().eq("id", storeIdB);
  }, 30000);
});

describe("publishProduct / unpublishProduct — toggle manual de status (D-10)", () => {
  it("publishProduct seta status='published'; unpublishProduct volta para 'draft'", async () => {
    const { email, password, productId } = await createDraftProduct("publish-happy");

    const publishResult = await publishProduct(productId);
    expect(publishResult).toEqual({ success: true, id: productId });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: publishedProduct } = await client.from("products").select("status").eq("id", productId).single();
    expect(publishedProduct?.status).toBe("published");

    const unpublishResult = await unpublishProduct(productId);
    expect(unpublishResult).toEqual({ success: true, id: productId });

    const { data: draftProduct } = await client.from("products").select("status").eq("id", productId).single();
    expect(draftProduct?.status).toBe("draft");

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("cross-tenant: publishProduct de um produto de outra loja não altera o status", async () => {
    const lojaA = await createDraftProduct("publish-cross-a");
    const { client: clientA, storeId: storeIdA } = await signInAndFindStore(lojaA.email, lojaA.password);

    const lojaB = await signUpAndCompleteOnboarding("publish-cross-b");

    const publishResult = await publishProduct(lojaA.productId);
    expect("error" in publishResult ? publishResult.error : undefined).toBeUndefined();

    const { data: productStillDraft, error } = await clientA
      .from("products")
      .select("status")
      .eq("id", lojaA.productId)
      .single();
    expect(error).toBeNull();
    expect(productStillDraft?.status).toBe("draft");

    const { client: clientB, storeId: storeIdB } = await signInAndFindStore(lojaB.email, lojaB.password);
    await clientA.from("stores").delete().eq("id", storeIdA);
    await clientB.from("stores").delete().eq("id", storeIdB);
  }, 30000);
});
