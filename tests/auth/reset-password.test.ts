import { describe, it, expect, vi } from "vitest";
import { createAnonClient } from "../setup/supabase-test";
import { requestPasswordReset, updatePassword } from "@/lib/auth/reset-actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Mesma estratégia de mock dos demais testes de Server Action
 * (`tests/auth/signup.test.ts`): mockamos APENAS a camada Next.js
 * (`next/headers`/`next/navigation`), nunca o Supabase — toda escrita roda
 * contra o projeto remoto real já linkado.
 */
const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
  headers: async () => ({
    get: (name: string) => (name === "host" ? "localhost:3000" : null),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

function uniqueEmail(label: string): string {
  return `vitrinoo.reset.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

describe("requestPasswordReset", () => {
  it("retorna a mensagem genérica para um email que provavelmente não existe (anti-enumeração)", async () => {
    const formData = new FormData();
    formData.set("email", uniqueEmail("inexistente"));

    const result = await requestPasswordReset(formData);

    expect(result).toEqual({ message: "Se o email existir, um link de recuperação foi enviado." });
  });

  it("retorna a MESMA mensagem genérica mesmo com email vazio/malformado (nunca diferencia)", async () => {
    const formData = new FormData();
    formData.set("email", "");

    const result = await requestPasswordReset(formData);

    expect(result).toEqual({ message: "Se o email existir, um link de recuperação foi enviado." });
  });
});

describe("updatePassword", () => {
  /**
   * O Route Handler `/auth/confirm` (Task 2 deste plano) é quem troca o
   * `token_hash` do email por uma sessão real via `verifyOtp` — isso exige
   * interceptar um email de verdade e é coberto pelo human-check manual do
   * PLAN.md (fluxo completo ponta a ponta). Aqui testamos o contrato de
   * `updatePassword` isoladamente: dada uma sessão real já estabelecida
   * (simulada via signUp+signIn, o mesmo efeito prático de uma sessão pós
   * verifyOtp), `updateUser` troca a senha de verdade contra o Supabase
   * remoto — sem mockar o Supabase.
   */
  it("com sessão real estabelecida, troca a senha via updateUser e a nova senha passa a funcionar", async () => {
    const email = uniqueEmail("ok");
    const oldPassword = "SenhaAntiga123!";
    const newPassword = "SenhaNova456!";

    // Estabelece a sessão através do MESMO `createClient()` (cookie jar
    // mockado compartilhado) que `updatePassword` usa internamente — assim
    // a sessão fica disponível para o Server Action ler, simulando o estado
    // pós `verifyOtp` do Route Handler `/auth/confirm` (Task 2).
    const setupClient = await createClient();
    const { data: signUpData, error: signUpError } = await setupClient.auth.signUp({
      email,
      password: oldPassword,
    });
    expect(signUpError).toBeNull();
    expect(signUpData.session).not.toBeNull();

    const formData = new FormData();
    formData.set("password", newPassword);

    await expect(updatePassword(formData)).rejects.toThrow("NEXT_REDIRECT:/dashboard");

    // Confirma contra o Supabase real: a senha antiga não funciona mais, a
    // nova funciona.
    const verifyClient = createAnonClient();
    const { error: oldPasswordError } = await verifyClient.auth.signInWithPassword({
      email,
      password: oldPassword,
    });
    expect(oldPasswordError).not.toBeNull();

    const { data: newPasswordData, error: newPasswordError } = await verifyClient.auth.signInWithPassword({
      email,
      password: newPassword,
    });
    expect(newPasswordError).toBeNull();
    expect(newPasswordData.user).not.toBeNull();
  }, 30000);

  it("rejeita senha fraca sem chamar updateUser", async () => {
    const formData = new FormData();
    formData.set("password", "123");

    const result = await updatePassword(formData);

    expect(result).toEqual({ error: expect.any(String) });
  });
});
