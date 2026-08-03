import { describe, it, expect, vi } from "vitest";
import { createAnonClient } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { saveStoreSettings } from "@/lib/settings/actions";
import { saveProduct } from "@/lib/products/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";

/**
 * Cobre D-09/D-11 (04-05-PLAN.md Task 3): mudar `hideSoldOutDefault` em
 * `saveStoreSettings` persiste `stores.hide_sold_out_default` E, quando o
 * valor REALMENTE muda, reseta (`null`) todas as exceções por produto já
 * configuradas — mas NUNCA num resubmit sem alteração deste campo
 * específico. Mesmo padrão de mock de next/headers/next/navigation de
 * tests/settings/store-settings-update.test.ts.
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
// A Server Action sob teste (`saveStoreSettings`) revalida o layout pra
// atualizar o avatar/nome da loja — comportamento de cache, não a regra de
// negócio que estes testes verificam, então é simulado aqui.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

function uniqueEmail(label: string): string {
  return `vitrinoo.hidesoldoutdefault.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
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

function baseSettingsFormData(hideSoldOutDefault: string): FormData {
  const formData = new FormData();
  formData.set("name", "Chuteiras Import Teste");
  formData.set("accentColor", "#0D3D2B");
  formData.set("tagline", "Frase original");
  formData.set("whatsapp", "(11) 99999-0000");
  formData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
  formData.set("hideSoldOutDefault", hideSoldOutDefault);
  return formData;
}

describe("hide_sold_out_default (D-11 — reset condicional de exceções por produto)", () => {
  it("mudar de false para true persiste o novo padrão E reseta exceções por produto já configuradas", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("reset-on-change");

    const productFormData = new FormData();
    productFormData.set("name", "Produto Com Exceção");
    productFormData.set("brand", "Nike");
    productFormData.set("price", "199,90");
    productFormData.set("hideWhenSoldOut", "true"); // exceção própria configurada
    const productResult = await saveProduct(productFormData);
    expect(productResult).toEqual({ success: true, id: expect.any(String) });
    const productId = (productResult as { success: true; id: string }).id;

    const verifyClient = createAnonClient();
    const { data: signInBefore } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: storesBefore } = await verifyClient.from("stores").select("*").eq("owner_id", signInBefore.user!.id);
    expect(storesBefore![0].hide_sold_out_default).toBe(false);

    // Muda a preferência global de false (padrão) para true — mudança real.
    const settingsResult = await saveStoreSettings(baseSettingsFormData("true"));
    expect(settingsResult).toEqual({ success: true });

    const { data: storesAfter } = await verifyClient.from("stores").select("*").eq("owner_id", signInBefore.user!.id);
    expect(storesAfter![0].hide_sold_out_default).toBe(true);

    const { data: productAfter } = await verifyClient.from("products").select("hide_when_sold_out").eq("id", productId).single();
    expect(productAfter?.hide_when_sold_out).toBeNull(); // D-11: exceção resetada

    await verifyClient.from("stores").delete().eq("id", storesAfter![0].id);
  }, 30000);

  it("resubmeter com o MESMO valor de hideSoldOutDefault NÃO reseta exceções configuradas depois", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("no-reset-unchanged");

    // Primeiro save: já estabelece hide_sold_out_default = true.
    const firstSettingsResult = await saveStoreSettings(baseSettingsFormData("true"));
    expect(firstSettingsResult).toEqual({ success: true });

    // Configura uma exceção por produto DEPOIS dessa mudança global.
    const productFormData = new FormData();
    productFormData.set("name", "Produto Com Exceção Pós-Mudança");
    productFormData.set("brand", "Adidas");
    productFormData.set("price", "299,90");
    productFormData.set("hideWhenSoldOut", "false"); // exceção: sempre mostrar, mesmo com padrão global = ocultar
    const productResult = await saveProduct(productFormData);
    expect(productResult).toEqual({ success: true, id: expect.any(String) });
    const productId = (productResult as { success: true; id: string }).id;

    // Resubmete o formulário com o MESMO valor "true" (sem mudança real).
    const secondSettingsResult = await saveStoreSettings(baseSettingsFormData("true"));
    expect(secondSettingsResult).toEqual({ success: true });

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: product } = await verifyClient.from("products").select("hide_when_sold_out").eq("id", productId).single();
    expect(product?.hide_when_sold_out).toBe(false); // exceção preservada, não resetada

    const { data: stores } = await verifyClient.from("stores").select("id").eq("owner_id", signInData.user!.id);
    await verifyClient.from("stores").delete().eq("id", stores![0].id);
  }, 30000);
});
