import { describe, it, expect, vi } from "vitest";
import { createAnonClient, makeFakeLogoFile } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";
import { saveProduct } from "@/lib/products/actions";

/**
 * Adaptado de tests/settings/store-settings-update.test.ts (mesmo mock de
 * next/headers/next/navigation + helper de seed via signUp+saveOnboarding).
 * Prova o caminho end-to-end mínimo do CRUD de produtos (03-02-PLAN.md
 * Task 1): `saveProduct` persiste nome/marca/preço com o parser BRL correto
 * (Pitfall 3 de 03-RESEARCH.md — nunca truncar 199,90 -> 199), rejeita
 * campos obrigatórios faltando (D-09) e persiste os opcionais.
 *
 * Este arquivo começa VERMELHO: `saveProduct` ainda não existe até a Task 2.
 * Fica verde após `src/lib/products/actions.ts` ser criado.
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
  return `vitrinoo.createproduct.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
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
 * reaproveitando o client interno de `saveProduct` — mesma disciplina de
 * "provar via API real" já usada em tests/rls/*.test.ts.
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

describe("saveProduct (cadastro de produto — form -> Server Action -> Postgres)", () => {
  it("persiste nome/marca/preço (happy path): price numérico 199.90, status draft", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("happy");

    const formData = new FormData();
    formData.set("name", "Mercurial Vapor");
    formData.set("brand", "Nike");
    formData.set("price", "199,90");

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: product, error: productError } = await client
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    expect(productError).toBeNull();
    expect(product?.name).toBe("Mercurial Vapor");
    expect(product?.brand).toBe("Nike");
    expect(product?.price).toBe(199.9);
    expect(typeof product?.price).toBe("number");
    expect(product?.status).toBe("draft");

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("parseia preço com separador de milhar '1.299,90' como 1299.90 (nunca truncado)", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("milhar");

    const formData = new FormData();
    formData.set("name", "Predator Elite");
    formData.set("brand", "Adidas");
    formData.set("price", "1.299,90");

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: product, error: productError } = await client
      .from("products")
      .select("price")
      .eq("id", productId)
      .single();

    expect(productError).toBeNull();
    expect(product?.price).toBe(1299.9);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("rejeita quando falta name, brand ou price, sem persistir nada (D-09)", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("obrigatorios");

    const missingName = new FormData();
    missingName.set("brand", "Nike");
    missingName.set("price", "100");
    const resultMissingName = await saveProduct(missingName);
    expect(resultMissingName).toEqual({ error: expect.any(String) });

    const missingBrand = new FormData();
    missingBrand.set("name", "Produto sem marca");
    missingBrand.set("price", "100");
    const resultMissingBrand = await saveProduct(missingBrand);
    expect(resultMissingBrand).toEqual({ error: expect.any(String) });

    const missingPrice = new FormData();
    missingPrice.set("name", "Produto sem preço");
    missingPrice.set("brand", "Nike");
    const resultMissingPrice = await saveProduct(missingPrice);
    expect(resultMissingPrice).toEqual({ error: expect.any(String) });

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: products, error: productsError } = await client.from("products").select("id").eq("store_id", storeId);
    expect(productsError).toBeNull();
    expect(products).toEqual([]);

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("persiste campos opcionais (line, sole, category, fulfillment, description)", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("opcionais");

    const formData = new FormData();
    formData.set("name", "Ultra Ultimate");
    formData.set("brand", "Puma");
    formData.set("price", "899,00");
    formData.set("line", "Ultra");
    formData.set("sole", "FG");
    formData.set("category", "Chuteira");
    formData.set("fulfillment", "pronta_entrega");
    formData.set("description", "Chuteira de campo profissional");

    const result = await saveProduct(formData);
    expect(result).toEqual({ success: true, id: expect.any(String) });
    const productId = (result as { success: true; id: string }).id;

    const { client, storeId } = await signInAndFindStoreId(email, password);
    const { data: product, error: productError } = await client
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    expect(productError).toBeNull();
    expect(product?.line).toBe("Ultra");
    expect(product?.sole).toBe("FG");
    expect(product?.category).toBe("Chuteira");
    expect(product?.fulfillment).toBe("pronta_entrega");
    expect(product?.description).toBe("Chuteira de campo profissional");

    await client.from("stores").delete().eq("id", storeId);
  }, 30000);
});
