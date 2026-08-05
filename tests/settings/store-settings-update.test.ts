import { describe, it, expect, vi } from "vitest";
import { createAnonClient, makeFakeLogoFile } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { saveStoreSettings } from "@/lib/settings/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";

/**
 * Adaptado de tests/onboarding/store-settings.test.ts (mesmo mock de
 * next/headers/next/navigation). Prova que `saveStoreSettings` persiste
 * edições pós-onboarding SEM resetar `onboarding_completed_at` e SEM
 * redirect — é um save "em página", não um passo de wizard.
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
  return `vitrinoo.settingssave.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

async function signUpAndCompleteOnboarding(label: string): Promise<{ email: string; password: string }> {
  const email = uniqueEmail(label);
  const password = "SenhaForte123!";
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/onboarding");

  const onboardingFormData = new FormData();
  onboardingFormData.set("name", "Chuteiras Original");
  onboardingFormData.set("accentColor", "#0D3D2B");
  onboardingFormData.set("tagline", "Frase original");
  onboardingFormData.set("whatsapp", "(11) 99999-0000");
  onboardingFormData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
  onboardingFormData.set("logo", makeFakeLogoFile());
  await expect(saveOnboarding(onboardingFormData)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard");

  return { email, password };
}

describe("saveStoreSettings (persistência pós-onboarding, sem redirect nem reset de onboarding_completed_at)", () => {
  it("salva edições de name/accentColor/tagline/whatsapp/messageTemplate mantendo onboarding_completed_at intacto", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("edit-ok");

    const verifyClient = createAnonClient();
    const { data: signInBefore } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: storesBefore } = await verifyClient
      .from("stores")
      .select("*")
      .eq("owner_id", signInBefore.user!.id);
    const { data: settingsBefore } = await verifyClient
      .from("store_settings")
      .select("*")
      .eq("store_id", storesBefore![0].id);
    const originalCompletedAt = settingsBefore![0].onboarding_completed_at;
    expect(originalCompletedAt).not.toBeNull();

    const editFormData = new FormData();
    editFormData.set("name", "Chuteiras Editada");
    editFormData.set("accentColor", "#00C46A");
    editFormData.set("tagline", "Frase editada");
    editFormData.set("whatsapp", "(11) 98888-1234");
    editFormData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);

    const result = await saveStoreSettings(editFormData);
    expect(result).toEqual({ success: true });

    const { data: signInAfter } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: storesAfter } = await verifyClient
      .from("stores")
      .select("*")
      .eq("owner_id", signInAfter.user!.id);
    expect(storesAfter![0].name).toBe("Chuteiras Editada");
    expect(storesAfter![0].accent_color).toBe("#00C46A");
    expect(storesAfter![0].tagline).toBe("Frase editada");

    const { data: settingsAfter } = await verifyClient
      .from("store_settings")
      .select("*")
      .eq("store_id", storesAfter![0].id);
    expect(settingsAfter![0].whatsapp_e164).toBe("5511988881234");
    expect(settingsAfter![0].onboarding_completed_at).toBe(originalCompletedAt);

    await verifyClient.from("stores").delete().eq("id", storesAfter![0].id);
  }, 30000);

  it("rejeita whatsapp inválido sem persistir nenhuma edição", async () => {
    const { email, password } = await signUpAndCompleteOnboarding("edit-invalid-whatsapp");

    const editFormData = new FormData();
    editFormData.set("name", "Nome Que Não Deveria Salvar");
    editFormData.set("accentColor", "");
    editFormData.set("tagline", "");
    editFormData.set("whatsapp", "123");
    editFormData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);

    const result = await saveStoreSettings(editFormData);
    expect(result).toEqual({ error: expect.any(String) });

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: stores } = await verifyClient.from("stores").select("name").eq("owner_id", signInData.user!.id);
    expect(stores![0].name).toBe("Chuteiras Original");

    await verifyClient.from("stores").delete().eq("owner_id", signInData.user!.id);
  }, 30000);
});
