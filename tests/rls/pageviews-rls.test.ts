import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAnonClient,
  orderClickDedupColumns,
  pageviewDedupColumns,
  seedAuthenticatedAccount,
  type SeededAccount,
} from "../setup/supabase-test";

/**
 * Prova o contrato RLS/multi-tenant da migration 0006 (T-06-01, T-06-02,
 * T-06-03): a nova tabela `pageviews` (product_id NULLABLE — NULL = acesso
 * ao grid/D-01, preenchido = visualização de produto) espelha o padrão
 * "anon insert-only, owner read-scoped" de `order_clicks`
 * (tests/rls/order-clicks-rls.test.ts), e as duas views agregadas
 * (`product_pageview_counts`, `product_order_click_counts`) nunca vazam
 * agregados entre lojas — provado com um SEGUNDO dono autenticado, nunca só
 * com o client anon (06-RESEARCH.md Pitfall 6).
 *
 * Seed via client autenticado do dono (seedAuthenticatedAccount), nunca
 * service_role — mesma disciplina do analog.
 */
describe("RLS de pageviews + isolamento das views agregadas (migration 0006)", () => {
  let lojaA: SeededAccount;
  let lojaB: SeededAccount;
  let lojaSemPublicado: SeededAccount;
  let storeAId: string;
  let storeBId: string;
  let storeNoPublishedId: string;
  let publishedProductAId: string;
  let publishedProductBId: string;
  let draftProductAId: string;

  beforeAll(async () => {
    lojaA = await seedAuthenticatedAccount("pageviews-loja-a");
    lojaB = await seedAuthenticatedAccount("pageviews-loja-b");
    // Conta própria para a loja sem produto publicado — migration 0015
    // (stores_owner_id_unique_idx) passou a limitar UMA loja por dono, então
    // não dá mais pra reaproveitar `lojaA` pra uma segunda loja como este
    // teste fazia antes dessa migration.
    lojaSemPublicado = await seedAuthenticatedAccount("pageviews-loja-sem-publicado");

    const { data: storeA, error: storeAError } = await lojaA.client
      .from("stores")
      .insert({ owner_id: lojaA.userId, name: "Loja A - Pageviews", slug: `pageviews-loja-a-teste-${Date.now()}` })
      .select()
      .single();
    if (storeAError || !storeA) {
      throw new Error(`Falha ao seedar stores da Loja A: ${storeAError?.message}`);
    }
    storeAId = storeA.id;

    const { data: storeB, error: storeBError } = await lojaB.client
      .from("stores")
      .insert({ owner_id: lojaB.userId, name: "Loja B - Pageviews", slug: `pageviews-loja-b-teste-${Date.now()}` })
      .select()
      .single();
    if (storeBError || !storeB) {
      throw new Error(`Falha ao seedar stores da Loja B: ${storeBError?.message}`);
    }
    storeBId = storeB.id;

    const { data: storeNoPublished, error: storeNoPublishedError } = await lojaSemPublicado.client
      .from("stores")
      .insert({
        owner_id: lojaSemPublicado.userId,
        name: "Loja Sem Produto Publicado",
        slug: `pageviews-loja-sem-pub-teste-${Date.now()}`,
      })
      .select()
      .single();
    if (storeNoPublishedError || !storeNoPublished) {
      throw new Error(`Falha ao seedar store sem produto publicado: ${storeNoPublishedError?.message}`);
    }
    storeNoPublishedId = storeNoPublished.id;

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
    await lojaSemPublicado?.client.from("stores").delete().eq("id", storeNoPublishedId);
    await lojaB?.client.from("stores").delete().eq("id", storeBId);
  });

  it("anon INSERE acesso ao grid válido (product_id null) contra loja com produto publicado", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("pageviews").insert({ store_id: storeAId, product_id: null, ...pageviewDedupColumns() });
    expect(error).toBeNull();
  });

  it("anon INSERE visualização de produto válida (product_id preenchido)", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("pageviews").insert({ store_id: storeAId, product_id: publishedProductAId, ...pageviewDedupColumns() });
    expect(error).toBeNull();
  });

  it("anon INSERE visualização com par product_id/store_id inconsistente é REJEITADO pelo WITH CHECK", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("pageviews").insert({ store_id: storeAId, product_id: publishedProductBId, ...pageviewDedupColumns() });
    expect(error).not.toBeNull();
  });

  it("anon INSERE visualização apontando para produto draft é REJEITADO pelo WITH CHECK", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("pageviews").insert({ store_id: storeAId, product_id: draftProductAId, ...pageviewDedupColumns() });
    expect(error).not.toBeNull();
  });

  it("anon INSERE acesso ao grid (product_id null) para store SEM produto publicado é REJEITADO pelo WITH CHECK", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("pageviews").insert({ store_id: storeNoPublishedId, product_id: null, ...pageviewDedupColumns() });
    expect(error).not.toBeNull();
  });

  it("anon NUNCA lê nenhuma linha de pageviews (nenhuma policy SELECT para anon)", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from("pageviews").select("*").eq("store_id", storeAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("owner (Loja A) lê os próprios pageviews; os da Loja B retornam [] (isolamento cross-tenant)", async () => {
    const anon = createAnonClient();
    const { error: insertError } = await anon.from("pageviews").insert({ store_id: storeBId, product_id: null, ...pageviewDedupColumns() });
    expect(insertError).toBeNull();

    const { data: ownData, error: ownError } = await lojaA.client.from("pageviews").select("*").eq("store_id", storeAId);
    expect(ownError).toBeNull();
    expect(ownData).not.toBeNull();
    expect(ownData!.length).toBeGreaterThan(0);
    expect(ownData!.every((row) => row.store_id === storeAId)).toBe(true);

    const { data: crossData, error: crossError } = await lojaA.client
      .from("pageviews")
      .select("*")
      .eq("store_id", storeBId);
    expect(crossError).toBeNull();
    expect(crossData).toEqual([]);
  });

  it("isolamento das VIEWS agregadas (security_invoker): dono da Loja A nunca lê agregados da Loja B", async () => {
    const anon = createAnonClient();

    // Seed extra: mais uma visualização de produto (Loja A) e um clique WhatsApp (Loja A e B)
    const { error: viewInsertError } = await anon
      .from("pageviews")
      .insert({ store_id: storeAId, product_id: publishedProductAId, ...pageviewDedupColumns() });
    expect(viewInsertError).toBeNull();

    const { error: clickAError } = await anon
      .from("order_clicks")
      .insert({ store_id: storeAId, product_id: publishedProductAId, size: 40, ...orderClickDedupColumns() });
    expect(clickAError).toBeNull();

    const { error: clickBError } = await anon
      .from("order_clicks")
      .insert({ store_id: storeBId, product_id: publishedProductBId, size: 41, ...orderClickDedupColumns() });
    expect(clickBError).toBeNull();

    const { data: ownViews, error: ownViewsError } = await lojaA.client
      .from("product_pageview_counts")
      .select("*")
      .eq("store_id", storeAId);
    expect(ownViewsError).toBeNull();
    expect(ownViews).not.toBeNull();
    expect(ownViews!.length).toBeGreaterThan(0);
    expect(ownViews!.every((row) => row.store_id === storeAId)).toBe(true);

    const { data: crossViews, error: crossViewsError } = await lojaA.client
      .from("product_pageview_counts")
      .select("*")
      .eq("store_id", storeBId);
    expect(crossViewsError).toBeNull();
    expect(crossViews).toEqual([]);

    const { data: ownClicks, error: ownClicksError } = await lojaA.client
      .from("product_order_click_counts")
      .select("*")
      .eq("store_id", storeAId);
    expect(ownClicksError).toBeNull();
    expect(ownClicks).not.toBeNull();
    expect(ownClicks!.length).toBeGreaterThan(0);
    expect(ownClicks!.every((row) => row.store_id === storeAId)).toBe(true);

    const { data: crossClicks, error: crossClicksError } = await lojaA.client
      .from("product_order_click_counts")
      .select("*")
      .eq("store_id", storeBId);
    expect(crossClicksError).toBeNull();
    expect(crossClicks).toEqual([]);
  });
});
