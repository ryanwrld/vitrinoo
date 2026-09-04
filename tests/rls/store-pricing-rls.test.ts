import { beforeAll, describe, expect, it } from "vitest";
import { seedAuthenticatedAccount, type SeededAccount } from "../setup/supabase-test";

/**
 * Isolamento RLS de `store_pricing` (migration 0032).
 *
 * A tabela guarda o preço que cada revendedor cobra por tipo de solado e quanto ele soma
 * nos lançamentos. É informação comercial: um concorrente que conseguisse LER a linha de
 * outra loja saberia a margem dela, e um que conseguisse ESCREVER poderia mudar o preço com
 * que os produtos dele entram na vitrine.
 *
 * Duas contas reais via signUp + signInWithPassword — nunca role administrativa, que
 * ignora RLS e faria o teste passar sem provar nada (Padrão 4 do 01-RESEARCH.md).
 */
describe("Isolamento RLS de store_pricing", () => {
  let lojaA: SeededAccount;
  let lojaB: SeededAccount;
  let storeAId: string;
  let storeBId: string;

  beforeAll(async () => {
    lojaA = await seedAuthenticatedAccount("pricing-loja-a");
    lojaB = await seedAuthenticatedAccount("pricing-loja-b");

    const criarLoja = async (conta: SeededAccount, nome: string, prefixo: string) => {
      const { data, error } = await conta.client
        .from("stores")
        .insert({
          owner_id: conta.userId,
          name: nome,
          slug: `${prefixo}-${Date.now()}`,
        })
        .select()
        .single();
      if (error || !data) throw new Error(`Falha ao seedar ${nome}: ${error?.message}`);
      return data.id as string;
    };

    storeAId = await criarLoja(lojaA, "Loja A - Preços", "pricing-loja-a-teste");
    storeBId = await criarLoja(lojaB, "Loja B - Preços", "pricing-loja-b-teste");

    const { error: erroA } = await lojaA.client.from("store_pricing").insert({
      store_id: storeAId,
      sole_prices: { FG: 430, SG: 520, IC: 300, TF: 380, AG: 390, MG: 390 },
      launch_surcharge: 50,
    });
    if (erroA) throw new Error(`Falha ao seedar store_pricing da Loja A: ${erroA.message}`);

    const { error: erroB } = await lojaB.client.from("store_pricing").insert({
      store_id: storeBId,
      sole_prices: { FG: 999 },
      launch_surcharge: 0,
    });
    if (erroB) throw new Error(`Falha ao seedar store_pricing da Loja B: ${erroB.message}`);
  });

  it("cada loja lê a própria regra", async () => {
    const { data } = await lojaA.client
      .from("store_pricing")
      .select("sole_prices, launch_surcharge")
      .eq("store_id", storeAId)
      .single();

    expect(data?.launch_surcharge).toBe(50);
    // AG e MG com o mesmo número: é a fusão "Multigramados" da interface chegando ao banco.
    expect((data?.sole_prices as Record<string, number>).AG).toBe(390);
    expect((data?.sole_prices as Record<string, number>).MG).toBe(390);
  });

  it("Loja A não enxerga a regra da Loja B", async () => {
    const { data, error } = await lojaA.client
      .from("store_pricing")
      .select("store_id")
      .eq("store_id", storeBId);

    // RLS filtra em vez de recusar: a resposta é vazia, não um erro de permissão.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("um SELECT sem filtro devolve só a própria linha", async () => {
    // A checagem que pega policy larga demais: filtrar por id esconderia uma policy que na
    // verdade libera a tabela inteira.
    const { data } = await lojaA.client.from("store_pricing").select("store_id");
    expect(data?.map((l) => l.store_id)).toEqual([storeAId]);
  });

  it("Loja A não consegue reescrever o preço da Loja B", async () => {
    const { data, error } = await lojaA.client
      .from("store_pricing")
      .update({ sole_prices: { FG: 1 }, launch_surcharge: 0 })
      .eq("store_id", storeBId)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: verificacao } = await lojaB.client
      .from("store_pricing")
      .select("sole_prices")
      .eq("store_id", storeBId)
      .single();
    expect((verificacao?.sole_prices as Record<string, number>).FG).toBe(999);
  });

  it("Loja A não consegue criar regra para a loja de outro", async () => {
    const { error } = await lojaA.client
      .from("store_pricing")
      .insert({ store_id: storeBId, sole_prices: { FG: 1 }, launch_surcharge: 0 });

    // INSERT é o caminho oposto do SELECT: aqui a policy REJEITA, não filtra.
    expect(error).not.toBeNull();
  });

  it("Loja A não consegue apagar a regra da Loja B", async () => {
    const { data, error } = await lojaA.client
      .from("store_pricing")
      .delete()
      .eq("store_id", storeBId)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: verificacao } = await lojaB.client
      .from("store_pricing")
      .select("store_id")
      .eq("store_id", storeBId)
      .single();
    expect(verificacao?.store_id).toBe(storeBId);
  });
});
