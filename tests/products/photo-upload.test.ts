import { describe, it, expect, vi } from "vitest";
import { createAnonClient, makeFakeLogoFile } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";
import { saveProduct, addProductPhotos, updatePhotoOrder, removePhoto } from "@/lib/products/actions";

/**
 * Adaptado de tests/products/create-product.test.ts e
 * tests/products/availability.test.ts (mesmo mock de next/headers/next/navigation
 * + helper de seed via signUp+saveOnboarding + convenção de "trocar sessão no
 * cookie jar compartilhado" para provar isolamento cross-tenant).
 *
 * Cobre o pipeline de fotos (03-04-PLAN.md Task 2): validação de magic bytes +
 * 5MB (mesmo padrão de validateLogoFile), recontagem server-side do limite de
 * 5 fotos por produto (Pitfall 6 de 03-RESEARCH.md), persistência de
 * `position` sequencial, `updatePhotoOrder` e `removePhoto`, incluindo
 * isolamento cross-tenant garantido por RLS (T-03-10).
 *
 * Decisão de arquitetura (Task 2): fotos são adicionadas via uma action
 * dedicada `addProductPhotos(productId, formData)` — tanto o fluxo de
 * criação (product-form.tsx anexa "photos" ao mesmo FormData de
 * `saveProduct`, que internamente chama o mesmo helper compartilhado) quanto
 * o fluxo de edição (Plan 03-05, chamando `addProductPhotos` diretamente após
 * o produto já existir) passam pela mesma lógica de validação/recontagem —
 * ver `uploadAndInsertPhotos` em src/lib/products/actions.ts.
 *
 * Este arquivo começa VERMELHO: `addProductPhotos`/`updatePhotoOrder`/
 * `removePhoto` ainda não existem até a Task 2.
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

// `revalidatePath` só funciona dentro do contexto de request do Next; chamada
// direto do Vitest ela lança "Invariant: static generation store missing".
// As Server Actions de produto revalidam `/admin/produtos` para a listagem
// nunca mostrar um estado velho — comportamento de cache, não a regra de
// negócio que estes testes verificam, então é simulado aqui.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

function uniqueEmail(label: string): string {
  return `vitrinoo.photoupload.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

function uniqueSlug(label: string): string {
  return `${label.replace(/[^a-z0-9]/g, "").slice(0, 12)}${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 6)}`;
}

async function signUpAndCompleteOnboarding(label: string): Promise<{ email: string; password: string }> {
  const email = uniqueEmail(label);
  const password = "SenhaForte123!";
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/onboarding");

  const onboardingFormData = new FormData();
  onboardingFormData.set("name", "Chuteiras Import Teste");
  onboardingFormData.set("accentColor", "#0D3D2B");
  onboardingFormData.set("tagline", "Frase original");
  onboardingFormData.set("whatsapp", "(11) 99999-0000");
  onboardingFormData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
  onboardingFormData.set("slug", uniqueSlug(label));
  onboardingFormData.set("logo", makeFakeLogoFile());
  await expect(saveOnboarding(onboardingFormData)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard");

  return { email, password };
}

/**
 * Verifica os dados persistidos via um client anônimo autenticado, nunca
 * reaproveitando o client interno das Server Actions (mesma disciplina de
 * "provar via API real" já usada nos outros testes desta fase). Retorna
 * também o `userId` — necessário aqui para validar o formato do
 * `storage_path` ({owner_id}/{product_id}/{uuid}.{ext}).
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

/**
 * Constrói um File de teste com bytes de assinatura reais (ou bytes
 * customizados, para simular um magic-byte mismatch) e um tamanho
 * customizável (para simular >5MB).
 */
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

describe("addProductPhotos — validação, recontagem e persistência de fotos", () => {
  it("persiste 3 fotos válidas com position 0,1,2 e storage_path {owner_id}/{product_id}/{uuid}.{ext}", async () => {
    const { email, password, productId } = await createDraftProduct("happy");

    const formData = new FormData();
    formData.append("photos", makeImageFile({ type: "image/png" }));
    formData.append("photos", makeImageFile({ type: "image/jpeg" }));
    formData.append("photos", makeImageFile({ type: "image/webp" }));

    const result = await addProductPhotos(productId, formData);
    expect(result).toEqual({ success: true, id: productId });

    const { client, storeId, userId } = await signInAndFindStore(email, password);
    const { data: photos, error } = await client
      .from("product_photos")
      .select("*")
      .eq("product_id", productId)
      .order("position", { ascending: true });

    expect(error).toBeNull();
    expect(photos).toHaveLength(3);
    expect(photos!.map((photo) => photo.position)).toEqual([0, 1, 2]);
    const pathPattern = new RegExp(`^${userId}/${productId}/[0-9a-f-]+\\.(png|jpg|webp)$`);
    for (const photo of photos!) {
      expect(photo.storage_path).toMatch(pathPattern);
    }

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("rejeita a 6ª foto quando já existem 5 (recontagem server-side, Pitfall 6) e não insere nada", async () => {
    const { email, password, productId } = await createDraftProduct("limit");

    const fiveFormData = new FormData();
    for (let i = 0; i < 5; i += 1) {
      fiveFormData.append("photos", makeImageFile({ type: "image/png", name: `foto-${i}.png` }));
    }
    const fiveResult = await addProductPhotos(productId, fiveFormData);
    expect(fiveResult).toEqual({ success: true, id: productId });

    const sixthFormData = new FormData();
    sixthFormData.append("photos", makeImageFile({ type: "image/png", name: "foto-6.png" }));
    const sixthResult = await addProductPhotos(productId, sixthFormData);
    expect(sixthResult).toEqual({ error: "Limite de 5 fotos por produto atingido." });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: photos, error } = await client.from("product_photos").select("id").eq("product_id", productId);
    expect(error).toBeNull();
    expect(photos).toHaveLength(5);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("rejeita arquivo cujos magic bytes não correspondem ao content-type declarado, sem inserir nada", async () => {
    const { email, password, productId } = await createDraftProduct("badbytes");

    const formData = new FormData();
    // Declara-se PNG, mas os bytes reais são de um JPEG — falha na checagem de assinatura.
    formData.append(
      "photos",
      makeImageFile({ type: "image/png", headerBytes: PHOTO_SIGNATURES["image/jpeg"], name: "disfarcado.png" })
    );

    const result = await addProductPhotos(productId, formData);
    expect(result).toEqual({ error: expect.any(String) });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: photos, error } = await client.from("product_photos").select("id").eq("product_id", productId);
    expect(error).toBeNull();
    expect(photos).toEqual([]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("rejeita arquivo > 5MB com a mensagem de limite de 5MB, sem inserir nada", async () => {
    const { email, password, productId } = await createDraftProduct("oversized");

    const formData = new FormData();
    formData.append(
      "photos",
      makeImageFile({ type: "image/png", sizeBytes: 5 * 1024 * 1024 + 1, name: "gigante.png" })
    );

    const result = await addProductPhotos(productId, formData);
    expect(result).toEqual({ error: "Essa foto passou do limite de 5MB." });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: photos, error } = await client.from("product_photos").select("id").eq("product_id", productId);
    expect(error).toBeNull();
    expect(photos).toEqual([]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);
});

describe("updatePhotoOrder — reordenação persistindo só a coluna position", () => {
  it("atualiza a position de cada foto conforme a nova ordem informada", async () => {
    const { email, password, productId } = await createDraftProduct("reorder");

    const formData = new FormData();
    formData.append("photos", makeImageFile({ type: "image/png", name: "a.png" }));
    formData.append("photos", makeImageFile({ type: "image/png", name: "b.png" }));
    formData.append("photos", makeImageFile({ type: "image/png", name: "c.png" }));
    const addResult = await addProductPhotos(productId, formData);
    expect(addResult).toEqual({ success: true, id: productId });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: originalPhotos } = await client
      .from("product_photos")
      .select("id, position")
      .eq("product_id", productId)
      .order("position", { ascending: true });
    expect(originalPhotos).toHaveLength(3);
    const [photoA, photoB, photoC] = originalPhotos!;

    // Nova ordem: C, A, B (C vira a capa, posição 0).
    const reorderResult = await updatePhotoOrder([
      { id: photoC.id, position: 0 },
      { id: photoA.id, position: 1 },
      { id: photoB.id, position: 2 },
    ]);
    expect(reorderResult).toEqual({ success: true, id: expect.any(String) });

    const { data: reordered, error } = await client
      .from("product_photos")
      .select("id, position")
      .eq("product_id", productId)
      .order("position", { ascending: true });
    expect(error).toBeNull();
    expect(reordered!.map((photo) => photo.id)).toEqual([photoC.id, photoA.id, photoB.id]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("cross-tenant: updatePhotoOrder numa foto de outra loja afeta 0 linhas (RLS)", async () => {
    const lojaA = await createDraftProduct("reorder-cross-a");

    const formDataA = new FormData();
    formDataA.append("photos", makeImageFile({ type: "image/png", name: "a.png" }));
    const addResultA = await addProductPhotos(lojaA.productId, formDataA);
    expect(addResultA).toEqual({ success: true, id: lojaA.productId });

    const { client: clientA, storeId: storeIdA } = await signInAndFindStore(lojaA.email, lojaA.password);
    const { data: photosA } = await clientA
      .from("product_photos")
      .select("id, position")
      .eq("product_id", lojaA.productId);
    const photoA = photosA![0];

    // Troca a sessão do cookie jar compartilhado para a Loja B (mesma
    // convenção de tests/products/availability.test.ts) antes de tentar
    // reordenar uma foto que pertence à Loja A.
    const lojaB = await signUpAndCompleteOnboarding("reorder-cross-b");

    const crossResult = await updatePhotoOrder([{ id: photoA.id, position: 99 }]);
    expect("error" in crossResult ? crossResult.error : undefined).toBeUndefined();

    const { data: photoAStillThere, error } = await clientA
      .from("product_photos")
      .select("position")
      .eq("id", photoA.id)
      .single();
    expect(error).toBeNull();
    expect(photoAStillThere?.position).toBe(photoA.position); // inalterado — cross-tenant não afetou

    const { client: clientB, storeId: storeIdB } = await signInAndFindStore(lojaB.email, lojaB.password);
    await clientA.from("stores").delete().eq("id", storeIdA);
    await clientB.from("stores").delete().eq("id", storeIdB);
  }, 30000);
});

describe("removePhoto — remoção individual (linha + best-effort storage)", () => {
  it("remove a linha de product_photos", async () => {
    const { email, password, productId } = await createDraftProduct("remove");

    const formData = new FormData();
    formData.append("photos", makeImageFile({ type: "image/png" }));
    const addResult = await addProductPhotos(productId, formData);
    expect(addResult).toEqual({ success: true, id: productId });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: photosBefore } = await client.from("product_photos").select("id").eq("product_id", productId);
    const photoId = photosBefore![0].id;

    const removeResult = await removePhoto(photoId);
    expect(removeResult).toEqual({ success: true, id: photoId });

    const { data: photosAfter, error } = await client.from("product_photos").select("id").eq("product_id", productId);
    expect(error).toBeNull();
    expect(photosAfter).toEqual([]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("cross-tenant: removePhoto numa foto de outra loja não remove e retorna erro", async () => {
    const lojaA = await createDraftProduct("remove-cross-a");

    const formDataA = new FormData();
    formDataA.append("photos", makeImageFile({ type: "image/png" }));
    const addResultA = await addProductPhotos(lojaA.productId, formDataA);
    expect(addResultA).toEqual({ success: true, id: lojaA.productId });

    const { client: clientA, storeId: storeIdA } = await signInAndFindStore(lojaA.email, lojaA.password);
    const { data: photosA } = await clientA.from("product_photos").select("id").eq("product_id", lojaA.productId);
    const photoIdA = photosA![0].id;

    const lojaB = await signUpAndCompleteOnboarding("remove-cross-b");

    const removeResult = await removePhoto(photoIdA);
    expect(removeResult).toEqual({ error: expect.any(String) });

    const { data: stillThere, error } = await clientA
      .from("product_photos")
      .select("id")
      .eq("id", photoIdA)
      .single();
    expect(error).toBeNull();
    expect(stillThere?.id).toBe(photoIdA);

    const { client: clientB, storeId: storeIdB } = await signInAndFindStore(lojaB.email, lojaB.password);
    await clientA.from("stores").delete().eq("id", storeIdA);
    await clientB.from("stores").delete().eq("id", storeIdB);
  }, 30000);
});
