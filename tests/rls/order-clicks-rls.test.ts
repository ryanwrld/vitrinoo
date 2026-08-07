import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAnonClient,
  orderClickDedupColumns,
  seedAuthenticatedAccount,
  type SeededAccount,
} from "../setup/supabase-test";

/**
 * Prova o comportamento RLS da migration 0005 (T-05-01, T-05-03): a
 * primeira superfície de ESCRITA pública do projeto (`anon insert` em
 * order_clicks). Cliente anônimo real (createAnonClient, sem signIn/signUp)
 * insere um clique válido, tem inserts inconsistentes/não-publicados
 * rejeitados pelo WITH CHECK, e nunca consegue ler nenhuma linha de volta
 * (nenhuma policy SELECT para anon nesta tabela, por design). Owner lê só
 * os cliques da própria loja (isolamento cross-tenant, mesmo padrão de
 * tests/rls/product-isolation.test.ts).
 *
 * Seed via client autenticado do dono (seedAuthenticatedAccount), nunca
 * service_role — mesma disciplina de product-isolation.test.ts.
 */
describe("RLS de order_clicks (migration 0005 — anon insert-only, owner read-scoped)", () => {
  let lojaA: SeededAccount;
  let lojaB: SeededAccount;
  let storeAId: string;
  let storeBId: string;
  let publishedProductAId: string;
  let publishedProductBId: string;
  let draftProductAId: string;

  beforeAll(async () => {
    lojaA = await seedAuthenticatedAccount("clicks-loja-a");
    lojaB = await seedAuthenticatedAccount("clicks-loja-b");

    const { data: storeA, error: storeAError } = await lojaA.client
      .from("stores")
      .insert({ owner_id: lojaA.userId, name: "Loja A - Cliques", slug: `clicks-loja-a-teste-${Date.now()}` })
      .select()
      .single();
    if (storeAError || !storeA) {
      throw new Error(`Falha ao seedar stores da Loja A: ${storeAError?.message}`);
    }
    storeAId = storeA.id;

    const { data: storeB, error: storeBError } = await lojaB.client
      .from("stores")
      .insert({ owner_id: lojaB.userId, name: "Loja B - Cliques", slug: `clicks-loja-b-teste-${Date.now()}` })
      .select()
      .single();
    if (storeBError || !storeB) {
      throw new Error(`Falha ao seedar stores da Loja B: ${storeBError?.message}`);
    }
    storeBId = storeB.id;

    const { data: publishedProductA, error: publishedAError } = await lojaA.client
      .from("products")
      .insert({ store_id: storeAId, name: "Mercurial Publicado A", brand: "Nike", price: 599.9, status: "published" })
      .select()
      .single();
    if (publishedAError || !publishedProductA) {
      throw new Error(`Falha ao seedar produto published da Loja A: ${publishedAError?.message}`);
    }
    publishedProductAId = publishedProductA.id;

    const { data: draftProductA, error: draftAError } = await lojaA.client
      .from("products")
      .insert({ store_id: storeAId, name: "Predator Rascunho A", brand: "Adidas", price: 499.9, status: "draft" })
      .select()
      .single();
    if (draftAError || !draftProductA) {
      throw new Error(`Falha ao seedar produto draft da Loja A: ${draftAError?.message}`);
    }
    draftProductAId = draftProductA.id;

    const { data: publishedProductB, error: publishedBError } = await lojaB.client
      .from("products")
      .insert({ store_id: storeBId, name: "Ultraboost Publicado B", brand: "Adidas", price: 699.9, status: "published" })
      .select()
      .single();
    if (publishedBError || !publishedProductB) {
      throw new Error(`Falha ao seedar produto published da Loja B: ${publishedBError?.message}`);
    }
    publishedProductBId = publishedProductB.id;
  }, 30000);

  afterAll(async () => {
    await lojaA?.client.from("stores").delete().eq("id", storeAId);
    await lojaB?.client.from("stores").delete().eq("id", storeBId);
  });

  it("cliente anônimo INSERE um clique válido contra produto publicado (par product_id/store_id consistente)", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("order_clicks").insert({ store_id: storeAId, product_id: publishedProductAId, size: 40, ...orderClickDedupColumns() });
    expect(error).toBeNull();
  });

  it("insert anônimo com par product_id/store_id inconsistente é REJEITADO pelo WITH CHECK", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("order_clicks").insert({
      store_id: storeAId,
      product_id: publishedProductBId,
      size: 40,
      ...orderClickDedupColumns(),
    });
    expect(error).not.toBeNull();
  });

  it("insert anônimo apontando para produto NÃO publicado é REJEITADO pelo WITH CHECK", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("order_clicks").insert({
      store_id: storeAId,
      product_id: draftProductAId,
      size: 40,
      ...orderClickDedupColumns(),
    });
    expect(error).not.toBeNull();
  });

  it("cliente anônimo NUNCA lê nenhuma linha de order_clicks (nenhuma policy SELECT para anon)", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from("order_clicks").select("*").eq("store_id", storeAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("owner (Loja A) lê os próprios cliques; cliques da Loja B retornam [] (isolamento cross-tenant)", async () => {
    const anon = createAnonClient();
    const { error: insertError } = await anon
      .from("order_clicks")
      .insert({ store_id: storeBId, product_id: publishedProductBId, size: 41, ...orderClickDedupColumns() });
    expect(insertError).toBeNull();

    const { data: ownData, error: ownError } = await lojaA.client.from("order_clicks").select("*").eq("store_id", storeAId);
    expect(ownError).toBeNull();
    expect(ownData).not.toBeNull();
    expect(ownData!.length).toBeGreaterThan(0);
    expect(ownData!.every((row) => row.store_id === storeAId)).toBe(true);

    const { data: crossData, error: crossError } = await lojaA.client
      .from("order_clicks")
      .select("*")
      .eq("store_id", storeBId);
    expect(crossError).toBeNull();
    expect(crossData).toEqual([]);
  });
});
