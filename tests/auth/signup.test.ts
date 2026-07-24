import { describe, it, expect, vi } from "vitest";
import { createAnonClient } from "../setup/supabase-test";
import { signInAction, signUpAction } from "@/lib/auth/actions";

/**
 * `next/headers`/`next/navigation` não existem fora de uma requisição real
 * do Next.js. Mockamos aqui com um cookie jar em memória (mesma interface
 * que `@supabase/ssr` espera: getAll/set) para permitir que
 * `src/lib/auth/actions.ts` rode de ponta a ponta contra o projeto Supabase
 * remoto real (nunca mockamos o Supabase em si — só a camada Next.js).
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
  return `vitrinoo.signup.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

describe("signUpAction", () => {
  it("cria usuário, grava stores + store_settings e redireciona para /onboarding", async () => {
    const email = uniqueEmail("ok");
    const password = "SenhaForte123!";

    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);

    await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/onboarding");

    // Confirma a escrita real autenticando como o mesmo usuário (RLS: só ele
    // enxerga sua própria linha `stores`/`store_settings`).
    const verifyClient = createAnonClient();
    const { data: signInData, error: signInError } = await verifyClient.auth.signInWithPassword({
      email,
      password,
    });
    expect(signInError).toBeNull();
    expect(signInData.user).not.toBeNull();

    const { data: stores, error: storesError } = await verifyClient
      .from("stores")
      .select("*")
      .eq("owner_id", signInData.user!.id);
    expect(storesError).toBeNull();
    expect(stores).toHaveLength(1);
    expect(stores![0].slug).toBeTruthy();

    const { data: settings, error: settingsError } = await verifyClient
      .from("store_settings")
      .select("*")
      .eq("store_id", stores![0].id);
    expect(settingsError).toBeNull();
    expect(settings).toHaveLength(1);
    expect(settings![0].onboarding_completed_at).toBeNull();

    await verifyClient.from("stores").delete().eq("id", stores![0].id);
  }, 30000);

  it("rejeita email inválido sem criar usuário", async () => {
    const formData = new FormData();
    formData.set("email", "nao-e-um-email");
    formData.set("password", "SenhaForte123!");

    const result = await signUpAction(formData);

    expect(result).toEqual({ error: expect.any(String) });
  });

  it("rejeita senha curta sem criar usuário", async () => {
    const formData = new FormData();
    formData.set("email", uniqueEmail("senha-curta"));
    formData.set("password", "123");

    const result = await signUpAction(formData);

    expect(result).toEqual({ error: expect.any(String) });
  });
});

describe("signInAction", () => {
  it("retorna mensagem genérica 'Email ou senha inválidos' para credenciais inválidas (sem enumerar conta)", async () => {
    const formData = new FormData();
    formData.set("email", uniqueEmail("inexistente"));
    formData.set("password", "SenhaQualquer123!");

    const result = await signInAction(formData);

    expect(result).toEqual({ error: "Email ou senha inválidos" });
  });

  it("retorna a mesma mensagem genérica para email malformado (não distingue validação de credenciais erradas)", async () => {
    const formData = new FormData();
    formData.set("email", "nao-e-um-email");
    formData.set("password", "");

    const result = await signInAction(formData);

    expect(result).toEqual({ error: "Email ou senha inválidos" });
  });
});
