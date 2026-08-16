import { describe, it, expect, vi } from "vitest";
import { signUpAction } from "@/lib/auth/actions";
import { createAnonClient } from "../setup/supabase-test";

/**
 * Mesmo padrão de tests/onboarding/store-settings.test.ts: mocka só a
 * camada Next.js, escreve contra o Supabase de teste real.
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
  return `vitrinoo.ensurestore.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

describe("ensureStoreForUser — slug provisório do signup", () => {
  it("gera um slug provisório sem hifen no cadastro", async () => {
    const email = uniqueEmail("no-hyphen");
    const password = "SenhaForte123!";
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/onboarding");

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: stores } = await verifyClient
      .from("stores")
      .select("slug")
      .eq("owner_id", signInData.user!.id);

    expect(stores).toHaveLength(1);
    expect(stores![0].slug).toMatch(/^[a-z0-9]+$/);
  }, 30000);
});
