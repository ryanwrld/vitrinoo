import { describe, it, expect, vi } from "vitest";
import { createAnonClient } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";
import { saveProduct, updateProduct } from "@/lib/products/actions";

/**
 * Cobre D-09/D-10 (04-05-PLAN.md Task 1): campo `hide_when_sold_out` por
 * produto — três estados via select ("" -> null, "true" -> true, "false" ->
 * false). Mesmo padrão de mock de next/headers/next/navigation e helper de
 * seed via signUp+saveOnboarding de tests/products/create-product.test.ts.
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
  return `vitrinoo.hidesoldout.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
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

describe("hide_when_sold_out (D-09/D-10 — três estados: herdar/mostrar/ocultar)", () => {
  it("saveProduct sem o campo (ou vazio) persiste hide_when_sold_out = null (herda o padrão da loja)", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("null-default");

    const formData = new FormData();
    formData.set("name", "Mercurial Sem Exceção");
    formData.set("brand", "Nike");
    formData.set("price", "199,90");

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: product } = await client.from("products").select("hide_when_sold_out").eq("id", productId).single();
    expect(product?.hide_when_sold_out).toBeNull();

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("saveProduct com hideWhenSoldOut='true' persiste true (ocultar quando esgotado)", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("true-hide");

    const formData = new FormData();
    formData.set("name", "Predator Ocultar");
    formData.set("brand", "Adidas");
    formData.set("price", "299,90");
    formData.set("hideWhenSoldOut", "true");

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: product } = await client.from("products").select("hide_when_sold_out").eq("id", productId).single();
    expect(product?.hide_when_sold_out).toBe(true);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("saveProduct com hideWhenSoldOut='false' persiste false (sempre mostrar esmaecido)", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("false-show");

    const formData = new FormData();
    formData.set("name", "Ultra Sempre Mostrar");
    formData.set("brand", "Puma");
    formData.set("price", "399,90");
    formData.set("hideWhenSoldOut", "false");

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: product } = await client.from("products").select("hide_when_sold_out").eq("id", productId).single();
    expect(product?.hide_when_sold_out).toBe(false);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("updateProduct muda de 'true' para '' (ausente) e volta para null", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("update-reset");

    const createFormData = new FormData();
    createFormData.set("name", "Mizuno Transição");
    createFormData.set("brand", "Mizuno");
    createFormData.set("price", "249,90");
    createFormData.set("hideWhenSoldOut", "true");

    const createResult = await saveProduct(createFormData);
    expect(createResult).toEqual({ success: true, id: expect.any(String) });
    const productId = (createResult as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: beforeUpdate } = await client.from("products").select("hide_when_sold_out").eq("id", productId).single();
    expect(beforeUpdate?.hide_when_sold_out).toBe(true);

    const updateFormData = new FormData();
    updateFormData.set("name", "Mizuno Transição");
    updateFormData.set("brand", "Mizuno");
    updateFormData.set("price", "249,90");
    // hideWhenSoldOut deliberadamente ausente do FormData (equivalente a "").

    const updateResult = await updateProduct(productId, updateFormData);
    expect(updateResult).toEqual({ success: true, id: productId });

    const { data: afterUpdate } = await client.from("products").select("hide_when_sold_out").eq("id", productId).single();
    expect(afterUpdate?.hide_when_sold_out).toBeNull();

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);
});
