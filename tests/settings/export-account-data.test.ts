import { describe, it, expect, vi } from "vitest";
import { createAnonClient, makeFakeLogoFile } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { saveProduct } from "@/lib/products/actions";
import { exportAccountDataAction } from "@/lib/account/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";

/**
 * Regressão do bug de exportação: a primeira versão consultava
 * `product_images(path, position)` — tabela e coluna que NÃO existem (o
 * certo é `product_photos(storage_path, position)`). O Supabase devolvia
 * erro, o código fazia `products ?? []` e o arquivo baixado saía com
 * `"produtos": []`.
 *
 * O que torna esse bug perigoso é ser SILENCIOSO: um backup vazio é
 * indistinguível de uma loja vazia, e o dono só descobriria no dia em que
 * precisasse restaurar. Por isso o teste central aqui não é "a action
 * responde", e sim "o produto que eu acabei de criar está DENTRO do
 * arquivo, com tamanhos e preço".
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
  return `vitrinoo.export.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

async function signUpAndCompleteOnboarding(label: string): Promise<{ email: string; password: string }> {
  const email = uniqueEmail(label);
  const password = "SenhaForte123!";
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/onboarding");

  const onboardingFormData = new FormData();
  onboardingFormData.set("name", "Loja Export Teste");
  onboardingFormData.set("accentColor", "#0D3D2B");
  onboardingFormData.set("tagline", "Frase da loja");
  onboardingFormData.set("whatsapp", "(11) 99999-0000");
  onboardingFormData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
  onboardingFormData.set("logo", makeFakeLogoFile());
  await expect(saveOnboarding(onboardingFormData)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard");

  return { email, password };
}

describe("exportAccountDataAction — backup da conta", () => {
  it("inclui os produtos com tamanhos e preço (não devolve lista vazia)", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("com-produtos");

    const productFormData = new FormData();
    productFormData.set("name", "Mercurial Vapor Teste");
    productFormData.set("brand", "Nike");
    productFormData.set("price", "899,90");
    productFormData.set(
      "sizes",
      JSON.stringify([
        { size: 39, available: true },
        { size: 40, available: true },
        { size: 41, available: false },
      ])
    );
    const productResult = await saveProduct(productFormData);
    expect(productResult).toEqual({ success: true, id: expect.any(String) });

    const result = await exportAccountDataAction();
    expect(result).not.toHaveProperty("error");

    const payload = JSON.parse((result as { json: string }).json);

    // O coração da regressão: o produto criado precisa estar no arquivo.
    expect(payload.produtos).toHaveLength(1);
    expect(payload.produtos[0].name).toBe("Mercurial Vapor Teste");
    expect(payload.produtos[0].brand).toBe("Nike");
    expect(payload.produtos[0].price).toBe(899.9);

    // Tamanhos: o subtítulo do card promete "produtos, tamanhos, preços" —
    // se a promessa está na interface, o teste cobra a promessa.
    const tamanhos = payload.produtos[0].tamanhos.map((t: { size: number }) => t.size);
    expect(tamanhos).toEqual([39, 40, 41]);

    // Campos que a primeira versão esquecia por completo.
    expect(payload.produtos[0]).toHaveProperty("description");
    expect(payload.produtos[0]).toHaveProperty("category");
    expect(payload.produtos[0]).toHaveProperty("sole");
    expect(payload.produtos[0]).toHaveProperty("fotos");

    // Identidade e configurações da loja continuam no arquivo.
    expect(payload.loja.name).toBe("Loja Export Teste");
    expect(payload.loja.tagline).toBe("Frase da loja");
    expect(payload.configuracoes.whatsapp_e164).toBe("5511999990000");
    expect(payload.conta.email).toBe(email);

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: stores } = await verifyClient.from("stores").select("id").eq("owner_id", signInData.user!.id);
    await verifyClient.from("stores").delete().eq("id", stores![0].id);
  }, 40000);

  it("loja sem produtos exporta lista vazia com a identidade preservada", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("sem-produtos");

    const result = await exportAccountDataAction();
    const payload = JSON.parse((result as { json: string }).json);

    expect(payload.produtos).toEqual([]);
    expect(payload.loja.name).toBe("Loja Export Teste");
    expect(payload.loja.slug).toEqual(expect.any(String));

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: stores } = await verifyClient.from("stores").select("id").eq("owner_id", signInData.user!.id);
    await verifyClient.from("stores").delete().eq("id", stores![0].id);
  }, 40000);
});
