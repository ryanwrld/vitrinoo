import { describe, it, expect, vi } from "vitest";
import { createAnonClient, makeFakeLogoFile } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";
import { saveProduct, markProductEsgotado } from "@/lib/products/actions";

/**
 * Adaptado de tests/products/create-product.test.ts (mesmo mock de
 * next/headers/next/navigation + helper de seed via signUp+saveOnboarding).
 * Cobre a persistência de tamanhos escolhidos em `product_sizes`
 * (03-03-PLAN.md Task 2) e o atalho de bulk-esgotar `markProductEsgotado`
 * (D-04), incluindo o isolamento cross-tenant garantido por RLS.
 *
 * Convenção de FormData: os tamanhos escolhidos vão em um único campo
 * "sizes" como JSON string (`JSON.stringify([{ size, available }, ...])`) —
 * mesma convenção que `product-form.tsx` usa no `onSubmit` (Task 2).
 *
 * Este arquivo começa VERMELHO: `saveProduct` ainda não persiste
 * `product_sizes` e `markProductEsgotado` ainda não existe até a Task 2.
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
  return `vitrinoo.availability.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
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
  onboardingFormData.set("logo", makeFakeLogoFile());
  await expect(saveOnboarding(onboardingFormData)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard");

  return { email, password };
}

/**
 * Verifica os dados persistidos via um client anônimo autenticado, nunca
 * reaproveitando o client interno das Server Actions (mesma disciplina de
 * "provar via API real" de tests/products/create-product.test.ts).
 */
async function signInAndFindStoreId(
  email: string,
  password: string
): Promise<{ client: ReturnType<typeof createAnonClient>; storeId: string }> {
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
  return { client, storeId: stores[0].id };
}

function baseProductFormData(overrides: Partial<Record<"name" | "brand" | "price", string>> = {}): FormData {
  const formData = new FormData();
  formData.set("name", overrides.name ?? "Mercurial Vapor");
  formData.set("brand", overrides.brand ?? "Nike");
  formData.set("price", overrides.price ?? "199,90");
  return formData;
}

describe("saveProduct — persistência de tamanhos em product_sizes", () => {
  it("persiste exatamente os tamanhos escolhidos com o available correto", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("sizes-persist");

    const formData = baseProductFormData();
    formData.set(
      "sizes",
      JSON.stringify([
        { size: 38, available: true },
        { size: 40, available: false },
      ])
    );

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: sizes, error: sizesError } = await client
      .from("product_sizes")
      .select("*")
      .eq("product_id", productId)
      .order("size", { ascending: true });

    expect(sizesError).toBeNull();
    expect(sizes).toEqual([
      { product_id: productId, size: 38, available: true },
      { product_id: productId, size: 40, available: false },
    ]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("sem nenhum tamanho enviado, persiste 0 linhas em product_sizes (rascunho, D-10)", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("sizes-empty");

    const formData = baseProductFormData();
    // Nenhum campo "sizes" anexado ao FormData — simula rascunho sem tamanho.

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: sizes, error: sizesError } = await client
      .from("product_sizes")
      .select("*")
      .eq("product_id", productId);

    expect(sizesError).toBeNull();
    expect(sizes).toEqual([]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);
});

describe("markProductEsgotado — atalho de bulk-esgotar (D-04)", () => {
  it("põe available=false em todos os tamanhos do produto", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("bulk-esgotar");

    const formData = baseProductFormData();
    formData.set(
      "sizes",
      JSON.stringify([
        { size: 39, available: true },
        { size: 40, available: true },
        { size: 41, available: false },
      ])
    );

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const bulkResult = await markProductEsgotado(productId);
    expect(bulkResult).toEqual({ success: true, id: productId });

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: sizes, error: sizesError } = await client
      .from("product_sizes")
      .select("available")
      .eq("product_id", productId);

    expect(sizesError).toBeNull();
    expect(sizes).toHaveLength(3);
    expect(sizes?.every((row) => row.available === false)).toBe(true);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("cross-tenant: markProductEsgotado em produto de outra loja afeta 0 linhas (RLS)", async () => {
    const lojaA = await signUpAndCompleteOnboarding("cross-a");

    const formDataA = baseProductFormData({ name: "Produto da Loja A" });
    formDataA.set("sizes", JSON.stringify([{ size: 42, available: true }]));
    const resultA = await saveProduct(formDataA);
    expect(resultA).toEqual({ success: true, id: expect.any(String) });
    const productIdA = (resultA as { success: true; id: string }).id;

    // Troca a sessão do cookie jar compartilhado (mock de next/headers) para
    // a Loja B antes de tentar esgotar o produto que pertence à Loja A —
    // markProductEsgotado resolve o owner via getOwnedStore() (auth.uid() da
    // sessão atual), então a policy RLS de product_sizes deve restringir o
    // UPDATE a 0 linhas, sem retornar erro.
    const lojaB = await signUpAndCompleteOnboarding("cross-b");

    const bulkResult = await markProductEsgotado(productIdA);
    expect(bulkResult).toEqual({ success: true, id: productIdA });

    const { client: clientA, storeId: storeIdA } = await signInAndFindStoreId(lojaA.email, lojaA.password);
    const { data: sizesA, error: sizesAError } = await clientA
      .from("product_sizes")
      .select("available")
      .eq("product_id", productIdA);

    expect(sizesAError).toBeNull();
    expect(sizesA).toEqual([{ available: true }]); // inalterado — cross-tenant não afetou

    const { client: clientB, storeId: storeIdB } = await signInAndFindStoreId(lojaB.email, lojaB.password);

    await clientA.from("stores").delete().eq("id", storeIdA);
    await clientB.from("stores").delete().eq("id", storeIdB);
  }, 30000);
});
