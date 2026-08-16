import { describe, it, expect, vi } from "vitest";
import { createAnonClient, makeFakeLogoFile } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";

/**
 * Mesmo padrão de `tests/auth/signup.test.ts`: mocka apenas a camada Next.js
 * (`next/headers`/`next/navigation`) com um cookie jar em memória, nunca o
 * Supabase — toda escrita roda contra o projeto remoto real (Padrão 4 do
 * 01-RESEARCH.md).
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
  return `vitrinoo.onboarding.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

/** Cadastra uma conta real e deixa a sessão no cookie jar mockado, pronta
 * para `saveOnboarding` consumir via `getUser()`. */
async function signUpAndGetCredentials(label: string) {
  const email = uniqueEmail(label);
  const password = "SenhaForte123!";
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/onboarding");
  return { email, password };
}

describe("saveOnboarding — identidade da loja (LOJA-01)", () => {
  it("salva nome/cor/frase, normaliza o WhatsApp e seta onboarding_completed_at", async () => {
    const { email, password } = await signUpAndGetCredentials("ok");

    const formData = new FormData();
    formData.set("name", "Chuteiras do Ryan");
    formData.set("accentColor", "#00C46A");
    formData.set("tagline", "As melhores chuteiras importadas do Brasil");
    formData.set("whatsapp", "(11) 99999-9999");
    formData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formData.set("slug", "chuteirasdorayan");
    // Logo virou obrigatória no onboarding — este é o caminho de SUCESSO,
    // então precisa de um arquivo válido para chegar ao redirect.
    formData.set("logo", makeFakeLogoFile());

    await expect(saveOnboarding(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard");

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    expect(signInData.user).not.toBeNull();

    const { data: stores } = await verifyClient
      .from("stores")
      .select("*")
      .eq("owner_id", signInData.user!.id);
    expect(stores).toHaveLength(1);
    expect(stores![0].name).toBe("Chuteiras do Ryan");
    expect(stores![0].accent_color).toBe("#00C46A");
    expect(stores![0].tagline).toBe("As melhores chuteiras importadas do Brasil");
    expect(stores![0].slug).toBe("chuteirasdorayan");

    const { data: settings } = await verifyClient
      .from("store_settings")
      .select("*")
      .eq("store_id", stores![0].id);
    expect(settings).toHaveLength(1);
    expect(settings![0].whatsapp_e164).toBe("5511999999999");
    expect(settings![0].onboarding_completed_at).not.toBeNull();

    await verifyClient.from("stores").delete().eq("id", stores![0].id);
  }, 30000);

  it("rejeita frase com mais de 100 caracteres sem salvar", async () => {
    await signUpAndGetCredentials("frase-longa");

    const formData = new FormData();
    formData.set("name", "Loja Teste Frase Longa");
    formData.set("accentColor", "");
    formData.set("tagline", "a".repeat(101));
    formData.set("whatsapp", "(11) 98888-7777");
    formData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);

    const result = await saveOnboarding(formData);
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("rejeita número de WhatsApp inválido sem salvar", async () => {
    await signUpAndGetCredentials("whatsapp-invalido");

    const formData = new FormData();
    formData.set("name", "Loja Teste WhatsApp Inválido");
    formData.set("whatsapp", "123");
    formData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    // Sem isso, o teste passaria pelo motivo ERRADO: a checagem de logo
    // obrigatória roda antes da normalização de telefone, então sem arquivo
    // o erro devolvido seria "Envie uma logo…", não o de WhatsApp inválido —
    // a asserção genérica (`any(String)`) não denunciaria a troca.
    formData.set("logo", makeFakeLogoFile());

    const result = await saveOnboarding(formData);
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("rejeita um slug fora do formato (com hifen) sem gravar nada", async () => {
    const { email } = await signUpAndGetCredentials("slug-invalid-format");
    void email;

    const formData = new FormData();
    formData.set("name", "Chuteiras Inválidas");
    formData.set("accentColor", "#00C46A");
    formData.set("tagline", "");
    formData.set("whatsapp", "(11) 99999-9999");
    formData.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formData.set("slug", "chuteiras-com-hifen");
    formData.set("logo", makeFakeLogoFile());

    const result = await saveOnboarding(formData);
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("retorna erro amigavel quando o slug ja pertence a outra loja", async () => {
    const { email: emailA, password: passwordA } = await signUpAndGetCredentials("slug-taken-a");

    const formDataA = new FormData();
    formDataA.set("name", "Loja A");
    formDataA.set("accentColor", "#00C46A");
    formDataA.set("tagline", "");
    formDataA.set("whatsapp", "(11) 99999-9999");
    formDataA.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formDataA.set("slug", `lojaataken${Date.now()}`);
    formDataA.set("logo", makeFakeLogoFile());
    await expect(saveOnboarding(formDataA)).rejects.toThrow("NEXT_REDIRECT:/admin/dashboard");

    const verifyClientA = createAnonClient();
    const { data: signInDataA } = await verifyClientA.auth.signInWithPassword({
      email: emailA,
      password: passwordA,
    });
    const { data: storesA } = await verifyClientA
      .from("stores")
      .select("slug")
      .eq("owner_id", signInDataA.user!.id);
    const takenSlug = storesA![0].slug;

    const { email: emailB } = await signUpAndGetCredentials("slug-taken-b");
    void emailB;

    const formDataB = new FormData();
    formDataB.set("name", "Loja B");
    formDataB.set("accentColor", "#00C46A");
    formDataB.set("tagline", "");
    formDataB.set("whatsapp", "(11) 98888-8888");
    formDataB.set("messageTemplate", DEFAULT_MESSAGE_TEMPLATE);
    formDataB.set("slug", takenSlug);
    formDataB.set("logo", makeFakeLogoFile());

    const result = await saveOnboarding(formDataB);
    expect(result).toEqual({ error: "Este link já está em uso. Escolha outro." });
  });
});
