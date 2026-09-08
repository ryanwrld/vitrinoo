import { describe, it, expect, vi } from "vitest";
import { createAnonClient, makeFakeLogoFile } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";
import { saveProduct, setProductStatusEmLote, deleteProductsEmLote } from "@/lib/products/actions";

/**
 * Ações em LOTE da listagem de produtos.
 *
 * Mesmo andaime de tests/products/edit-delete-product.test.ts (mock de
 * next/headers + next/navigation + next/cache, seed por signUp+saveOnboarding e a convenção
 * de "trocar a sessão no cookie jar compartilhado" para provar isolamento entre lojas).
 *
 * O que importa aqui não é o caminho feliz — é a garantia de que uma LISTA de ids vinda do
 * cliente não vira uma porta para mexer no catálogo de outra loja. Uma ação individual erra
 * um produto; uma em lote erraria o acervo inteiro.
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

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

function uniqueEmail(label: string): string {
  return `vitrinoo.lote.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
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

async function signInAndFindStore(email: string, password: string) {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Falha ao autenticar: ${error?.message}`);
  const { data: stores } = await client.from("stores").select("id").eq("owner_id", data.user.id);
  if (!stores?.length) throw new Error("Loja de teste não encontrada.");
  return { client, storeId: stores[0].id };
}

/** Cria N rascunhos na loja da sessão atual e devolve os ids. */
async function criarRascunhos(label: string, quantos: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < quantos; i++) {
    const formData = new FormData();
    formData.set("name", `Produto ${label} ${i}`);
    formData.set("brand", "Nike");
    formData.set("price", "199,90");
    const r = await saveProduct(formData);
    expect(r).toEqual({ success: true, id: expect.any(String) });
    ids.push((r as { success: true; id: string }).id);
  }
  return ids;
}

describe("setProductStatusEmLote", () => {
  it("publica vários de uma vez e depois devolve todos para rascunho", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("status");
    const ids = await criarRascunhos("status", 3);

    const publicados = await setProductStatusEmLote(ids, "published");
    expect(publicados).toEqual({ success: true, afetados: 3 });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: depois } = await client.from("products").select("status").in("id", ids);
    expect(depois?.every((p) => p.status === "published")).toBe(true);

    const rascunhados = await setProductStatusEmLote(ids, "draft");
    expect(rascunhados).toEqual({ success: true, afetados: 3 });
    const { data: voltaram } = await client.from("products").select("status").in("id", ids);
    expect(voltaram?.every((p) => p.status === "draft")).toBe(true);

    await client.from("stores").delete().eq("id", storeId);
  }, 60000);

  it("lista vazia não faz nada e não é erro", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("vazio");
    expect(await setProductStatusEmLote([], "published")).toEqual({ success: true, afetados: 0 });
    expect(await deleteProductsEmLote([])).toEqual({ success: true, afetados: 0 });
    const { client, storeId } = await signInAndFindStore(email, password);
    await client.from("stores").delete().eq("id", storeId);
  }, 30000);

  it("cross-tenant: ids de outra loja não são publicados", async () => {
    const lojaA = await signUpAndCompleteOnboarding("status-cross-a");
    const idsA = await criarRascunhos("status-cross-a", 2);
    const { client: clientA, storeId: storeIdA } = await signInAndFindStore(lojaA.email, lojaA.password);

    // A partir daqui a sessão do cookie jar é a da loja B.
    const lojaB = await signUpAndCompleteOnboarding("status-cross-b");
    const idsB = await criarRascunhos("status-cross-b", 1);

    // B tenta publicar os produtos de A junto com o seu.
    const r = await setProductStatusEmLote([...idsA, ...idsB], "published");
    expect(r).toEqual({ success: true, afetados: 1 });

    const { data: deA } = await clientA.from("products").select("status").in("id", idsA);
    expect(deA?.every((p) => p.status === "draft")).toBe(true);

    const { client: clientB, storeId: storeIdB } = await signInAndFindStore(lojaB.email, lojaB.password);
    await clientA.from("stores").delete().eq("id", storeIdA);
    await clientB.from("stores").delete().eq("id", storeIdB);
  }, 60000);
});

describe("deleteProductsEmLote", () => {
  it("exclui vários de uma vez", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("apagar");
    const ids = await criarRascunhos("apagar", 3);

    const r = await deleteProductsEmLote(ids);
    expect(r).toEqual({ success: true, afetados: 3 });

    const { client, storeId } = await signInAndFindStore(email, password);
    const { data: sobraram } = await client.from("products").select("id").in("id", ids);
    expect(sobraram).toHaveLength(0);

    await client.from("stores").delete().eq("id", storeId);
  }, 60000);

  it("cross-tenant: ids de outra loja não são excluídos", async () => {
    const lojaA = await signUpAndCompleteOnboarding("apagar-cross-a");
    const idsA = await criarRascunhos("apagar-cross-a", 2);
    const { client: clientA, storeId: storeIdA } = await signInAndFindStore(lojaA.email, lojaA.password);

    const lojaB = await signUpAndCompleteOnboarding("apagar-cross-b");
    const idsB = await criarRascunhos("apagar-cross-b", 1);

    const r = await deleteProductsEmLote([...idsA, ...idsB]);
    expect(r).toEqual({ success: true, afetados: 1 });

    const { data: deA } = await clientA.from("products").select("id").in("id", idsA);
    expect(deA).toHaveLength(2);

    const { client: clientB, storeId: storeIdB } = await signInAndFindStore(lojaB.email, lojaB.password);
    await clientA.from("stores").delete().eq("id", storeIdA);
    await clientB.from("stores").delete().eq("id", storeIdB);
  }, 60000);
});
