import { describe, it, expect, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * Teste UNITÁRIO totalmente mockado (determinístico, sem rede real —
 * diferente dos testes de integração em `signup.test.ts`, que batem no
 * Supabase remoto). Cobre o gap do UAT teste 5 (01-UAT.md): `signInAction`
 * deve distinguir falha de rede (`AuthRetryableFetchError`) de credencial
 * real inválida (`AuthApiError`), sem enfraquecer o padrão anti-enumeração.
 * Root cause completo em `.planning/debug/login-network-error-message.md`.
 */
const { signInWithPassword } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword },
  }),
}));

// Import DEPOIS dos vi.mock acima — vi.mock é hoisted para o topo do arquivo
// pelo transform do Vitest, então o mock já está registrado quando este
// import (e o `signInAction` que ele resolve) é avaliado.
import { signInAction } from "@/lib/auth/actions";

describe("signInAction — erro de rede vs. credencial inválida", () => {
  it("retorna mensagem de conexão distinta para AuthRetryableFetchError (falha de rede)", async () => {
    signInWithPassword.mockResolvedValue({
      error: new AuthRetryableFetchError("fetch failed", 0),
    });

    const formData = new FormData();
    formData.set("email", "revendedor@gmail.com");
    formData.set("password", "SenhaQualquer123!");

    const result = await signInAction(formData);

    expect(result).toEqual({
      error: "Não foi possível conectar.",
    });
  });

  it("mantém a mensagem genérica anti-enumeração para AuthApiError (credencial real inválida)", async () => {
    signInWithPassword.mockResolvedValue({
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });

    const formData = new FormData();
    formData.set("email", "revendedor@gmail.com");
    formData.set("password", "SenhaQualquer123!");

    const result = await signInAction(formData);

    expect(result).toEqual({ error: "Email ou senha inválidos" });
  });
});
