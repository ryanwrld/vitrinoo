import { describe, it, expect, vi } from "vitest";
import { seedAuthenticatedAccount, createAnonClient, type SeededAccount } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { updateStoreSlug } from "@/lib/settings/actions";

/**
 * Prova o caminho de rede de segurança contra TOCTOU (Threat T-02-05,
 * 02-RESEARCH.md Pitfall 3): mesmo se o debounce de disponibilidade no
 * client já tiver rodado, a UNIQUE constraint de `stores.slug` (0001) é a
 * fonte de verdade — `updateStoreSlug` precisa traduzir o `23505` do
 * Postgres na mensagem amigável do Copywriting Contract, nunca vazar o erro
 * cru do banco.
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
  return `vitrinoo.updateslug.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

async function signUpLojaA(label: string): Promise<{ email: string; password: string }> {
  const email = uniqueEmail(label);
  const password = "SenhaForte123!";
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  return { email, password };
}

describe("updateStoreSlug (D-08, 23505 unique_violation path)", () => {
  it("retorna 'Este link já está em uso. Escolha outro.' quando o slug pertence a OUTRO tenant", async () => {
    const lojaB: SeededAccount = await seedAuthenticatedAccount("update-slug-b");
    const takenSlug = `loja-b-taken-${Date.now()}`;
    const { data: storeB, error: storeBError } = await lojaB.client
      .from("stores")
      .insert({ owner_id: lojaB.userId, name: "Loja B", slug: takenSlug })
      .select()
      .single();
    if (storeBError || !storeB) throw new Error(`Falha ao seedar Loja B: ${storeBError?.message}`);
    await lojaB.client.from("store_settings").insert({ store_id: storeB.id });

    await signUpLojaA("update-slug-a-conflict");

    const result = await updateStoreSlug(takenSlug);
    expect(result).toEqual({ error: "Este link já está em uso. Escolha outro." });

    await lojaB.client.from("stores").delete().eq("id", storeB.id);
  }, 30000);

  it("salva com sucesso um slug novo e não utilizado", async () => {
    const { email, password } = await signUpLojaA("update-slug-a-success");

    const freshSlug = `slug-novo-${Date.now()}`;
    const result = await updateStoreSlug(freshSlug);
    expect(result).toEqual({ success: true });

    const verifyClient = createAnonClient();
    const { data: signInData } = await verifyClient.auth.signInWithPassword({ email, password });
    const { data: stores } = await verifyClient.from("stores").select("slug").eq("owner_id", signInData.user!.id);
    expect(stores).toHaveLength(1);
    expect(stores![0].slug).toBe(freshSlug);
  }, 30000);

  it("rejeita um novo slug fora do formato D-02 sem tocar o banco", async () => {
    await signUpLojaA("update-slug-a-invalid-format");

    const result = await updateStoreSlug("AB");
    expect(result).toEqual({ error: expect.any(String) });
  }, 30000);
});
