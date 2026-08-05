import { describe, it, expect, vi } from "vitest";
import { seedAuthenticatedAccount, type SeededAccount } from "../setup/supabase-test";
import { signUpAction } from "@/lib/auth/actions";
import { checkSlugAvailability } from "@/lib/settings/actions";

/**
 * Regressão cross-tenant obrigatória (Threat T-02-03, 02-RESEARCH.md Pitfall
 * 1): a policy RLS de `stores` (`owner_id = auth.uid()`) bloqueia qualquer
 * SELECT direto entre tenants, então só o RPC `is_slug_available`
 * (SECURITY DEFINER) pode responder corretamente "esse slug já é de outro
 * revendedor". Loja B é seedada via client bruto (Padrão 4 do
 * 01-RESEARCH.md, mesmo esquema de tests/rls/isolation.test.ts); Loja A
 * passa pelo mesmo mock de `next/headers`/`next/navigation` usado em
 * tests/auth/signup.test.ts para exercitar a Server Action de verdade.
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
  return `vitrinoo.settings.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

async function signUpLojaA(label: string): Promise<void> {
  const formData = new FormData();
  formData.set("email", uniqueEmail(label));
  formData.set("password", "SenhaForte123!");
  await expect(signUpAction(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/onboarding");
}

describe("checkSlugAvailability (cross-tenant, via RPC is_slug_available)", () => {
  let lojaB: SeededAccount;
  let storeBId: string;
  const takenSlug = `loja-b-ocupado-${Date.now()}`;

  it("retorna available=false para um slug já ocupado por OUTRO tenant", async () => {
    lojaB = await seedAuthenticatedAccount("slug-avail-b");
    const { data: storeB, error: storeBError } = await lojaB.client
      .from("stores")
      .insert({ owner_id: lojaB.userId, name: "Loja B", slug: takenSlug })
      .select()
      .single();
    if (storeBError || !storeB) throw new Error(`Falha ao seedar Loja B: ${storeBError?.message}`);
    storeBId = storeB.id;
    await lojaB.client.from("store_settings").insert({ store_id: storeBId });

    await signUpLojaA("slug-avail-a-taken");

    const result = await checkSlugAvailability(takenSlug);
    expect(result.available).toBe(false);

    await lojaB.client.from("stores").delete().eq("id", storeBId);
  }, 30000);

  it("retorna available=true para um slug não utilizado", async () => {
    await signUpLojaA("slug-avail-a-unused");

    const unusedSlug = `slug-livre-${Date.now()}`;
    const result = await checkSlugAvailability(unusedSlug);
    expect(result.available).toBe(true);
  }, 30000);

  it("retorna available=false com mensagem de formato inválido para um slug fora do padrão D-02", async () => {
    await signUpLojaA("slug-avail-a-invalid");

    const result = await checkSlugAvailability("AB");
    expect(result.available).toBe(false);
    expect(result.error).toBeTruthy();
  }, 30000);
});
