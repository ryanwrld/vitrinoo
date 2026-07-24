import { beforeAll, describe, expect, it, vi } from "vitest";
// Efeito colateral: carrega NEXT_PUBLIC_SUPABASE_URL/ANON_KEY de .env.local
// para process.env (o Next.js faz isso automaticamente em dev/build; o
// Vitest, não).
import "../setup/supabase-test";

/**
 * Cookie jar em memória compartilhado entre as chamadas de `createClient()`
 * desta suíte, simulando o ciclo request/response real: o cadastro grava a
 * sessão neste "cookie store", e o logout precisa lê-la e limpá-la a
 * partir do MESMO jar — por isso o mock precisa ser stateful (nunca
 * mockamos o Supabase em si, só a camada de cookies do Next.js).
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

import { signOutAction, signUpAction } from "@/lib/auth/actions";
import { createClient as createServerClient } from "@/lib/supabase/server";

describe("signOutAction", () => {
  const email = `vitrinoo.signout.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
  const password = "SenhaForte123!";

  beforeAll(async () => {
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);

    // Popula o cookie jar compartilhado com uma sessão real (mesmo padrão
    // de escrita real usado no restante da suíte de auth/RLS do projeto).
    await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  }, 30000);

  it("encerra a sessão (auth.signOut) e redireciona para /login", async () => {
    const before = await createServerClient();
    const { data: beforeUser } = await before.auth.getUser();
    expect(beforeUser.user).not.toBeNull();

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/login");

    const after = await createServerClient();
    const { data: afterUser } = await after.auth.getUser();
    expect(afterUser.user).toBeNull();
  }, 30000);
});
