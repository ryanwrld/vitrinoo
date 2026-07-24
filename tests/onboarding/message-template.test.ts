import { describe, it, expect, vi } from "vitest";
import { createAnonClient } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { saveOnboarding } from "@/lib/onboarding/actions";

/**
 * Mesmo padrão de `tests/auth/signup.test.ts`: mocka apenas a camada Next.js
 * (`next/headers`/`next/navigation`) com um cookie jar em memória, nunca o
 * Supabase.
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

async function signUpAndGetCredentials(label: string) {
  const email = uniqueEmail(label);
  const password = "SenhaForte123!";
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  return { email, password };
}

describe("saveOnboarding — template de mensagem (WPP-02)", () => {
  it("aceita template com os 4 placeholders obrigatórios e salva o texto exato", async () => {
    const { email, password } = await signUpAndGetCredentials("template-ok");

    const customTemplate = "Interesse: {modelo} / {solado} / {tamanho} / R$ {preço}";
    const formData = new FormData();
    formData.set("name", "Loja Template OK");
    formData.set("whatsapp", "(11) 98888-7777");
    formData.set("messageTemplate", customTemplate);

    await expect(saveOnboarding(formData)).rejects.toThrow("NEXT_REDIRECT:/dashboard");

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: stores } = await verifyClient
      .from("stores")
      .select("id")
      .eq("owner_id", signInData.user!.id);
    const { data: settings } = await verifyClient
      .from("store_settings")
      .select("message_template")
      .eq("store_id", stores![0].id);

    expect(settings![0].message_template).toBe(customTemplate);

    await verifyClient.from("stores").delete().eq("id", stores![0].id);
  }, 30000);

  it("rejeita template sem os placeholders obrigatórios, sem salvar", async () => {
    await signUpAndGetCredentials("template-invalido");

    const formData = new FormData();
    formData.set("name", "Loja Template Inválido");
    formData.set("whatsapp", "(11) 97777-6666");
    formData.set("messageTemplate", "Mensagem sem nenhum placeholder");

    const result = await saveOnboarding(formData);
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("rejeita template faltando apenas um dos quatro placeholders", async () => {
    await signUpAndGetCredentials("template-parcial");

    const formData = new FormData();
    formData.set("name", "Loja Template Parcial");
    formData.set("whatsapp", "(11) 96666-5555");
    formData.set("messageTemplate", "Modelo: {modelo}, Solado: {solado}, Tamanho: {tamanho}"); // falta {preço}

    const result = await saveOnboarding(formData);
    expect(result).toEqual({ error: expect.any(String) });
  });
});
