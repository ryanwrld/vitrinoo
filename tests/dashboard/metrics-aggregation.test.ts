import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAnonClient, pageviewDedupColumns, seedAuthenticatedAccount, type SeededAccount } from "../setup/supabase-test";
import { queryAccessCount, queryTopOrderClickProducts, queryTopViewedProducts } from "@/lib/dashboard/metrics";

/**
 * Cobre MTR-01/MTR-02 (06-03-PLAN.md Task 1): agregação de `metrics.ts`
 * (`queryAccessCount`, `queryTopViewedProducts`, `queryTopOrderClickProducts`)
 * consumida pelo dashboard. Espelha o padrão de seed de duas contas +
 * `createAnonClient()` insert de `tests/rls/order-clicks-rls.test.ts` e
 * `tests/rls/pageviews-rls.test.ts` (as views/tabela já existem desde a
 * migration 0006/Plan 06-01), e o estilo de asserção sobre resultado
 * ordenado de `tests/products/list-filter-sort.test.ts`.
 *
 * Este arquivo começa VERMELHO: `src/lib/dashboard/metrics.ts` ainda não
 * existe até a Task 2 (Wave 0).
 */
describe("metrics.ts — queryAccessCount / queryTopViewedProducts / queryTopOrderClickProducts", () => {
  let lojaA: SeededAccount;
  let lojaB: SeededAccount;
  let storeAId: string;
  let storeBId: string;
  const productIds: string[] = [];
  let productBId: string;

  beforeAll(async () => {
    lojaA = await seedAuthenticatedAccount("metrics-loja-a");
    lojaB = await seedAuthenticatedAccount("metrics-loja-b");

    const { data: storeA, error: storeAError } = await lojaA.client
      .from("stores")
      .insert({ owner_id: lojaA.userId, name: "Loja A - Métricas", slug: `metrics-loja-a-teste-${Date.now()}` })
      .select()
      .single();
    if (storeAError || !storeA) {
      throw new Error(`Falha ao seedar store da Loja A: ${storeAError?.message}`);
    }
    storeAId = storeA.id;

    const { data: storeB, error: storeBError } = await lojaB.client
      .from("stores")
      .insert({ owner_id: lojaB.userId, name: "Loja B - Métricas", slug: `metrics-loja-b-teste-${Date.now()}` })
      .select()
      .single();
    if (storeBError || !storeB) {
      throw new Error(`Falha ao seedar store da Loja B: ${storeBError?.message}`);
    }
    storeBId = storeB.id;

    // 12 produtos publicados na Loja A — necessário para provar truncamento
    // em exatamente 10 (Task 1, item 4 do plano).
    for (let i = 0; i < 12; i++) {
      const { data, error } = await lojaA.client
        .from("products")
        .insert({ store_id: storeAId, name: `Produto Métrica ${i + 1}`, brand: "Nike", price: 100 + i, status: "published" })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`Falha ao seedar produto ${i + 1}: ${error?.message}`);
      }
      productIds.push(data.id);
    }

    const { data: prodB, error: prodBError } = await lojaB.client
      .from("products")
      .insert({ store_id: storeBId, name: "Produto Loja B", brand: "Adidas", price: 200, status: "published" })
      .select("id")
      .single();
    if (prodBError || !prodB) {
      throw new Error(`Falha ao seedar produto da Loja B: ${prodBError?.message}`);
    }
    productBId = prodB.id;

    const anon = createAnonClient();

    // Acessos ao grid (product_id null) — 7 acessos exatos, para provar que
    // queryAccessCount SÓ conta essas linhas (D-01), nunca as de produto.
    // Um visitante distinto por linha (ver pageviewDedupColumns): desde a
    // migration 0010 os 7 acessos precisam ser de 7 pessoas diferentes pra
    // continuarem valendo 7.
    const gridRows = Array.from({ length: 7 }, () => ({
      store_id: storeAId,
      product_id: null,
      ...pageviewDedupColumns(),
    }));
    const { error: gridError } = await anon.from("pageviews").insert(gridRows);
    if (gridError) {
      throw new Error(`Falha ao seedar pageviews de grid: ${gridError.message}`);
    }

    // Pageviews de produto — contagens distintas e decrescentes:
    // productIds[0] recebe 12 views, productIds[11] recebe 1 view. Prova
    // ordenação desc e truncamento em 10 (os 2 últimos ficam de fora).
    const productViewRows: { store_id: string; product_id: string; visitor_id: string; view_date: string }[] = [];
    productIds.forEach((id, index) => {
      const viewCount = 12 - index;
      for (let v = 0; v < viewCount; v++) {
        productViewRows.push({ store_id: storeAId, product_id: id, ...pageviewDedupColumns() });
      }
    });
    const { error: viewsError } = await anon.from("pageviews").insert(productViewRows);
    if (viewsError) {
      throw new Error(`Falha ao seedar pageviews de produto: ${viewsError.message}`);
    }

    // order_clicks — ordem INVERSA da de views, para provar que a lista de
    // cliques é ranqueada independentemente (D-08/D-09, nunca fundida):
    // productIds[0] recebe 1 clique, productIds[11] recebe 12 cliques.
    const clickRows: { store_id: string; product_id: string; size: number }[] = [];
    productIds.forEach((id, index) => {
      const clickCount = index + 1;
      for (let c = 0; c < clickCount; c++) {
        clickRows.push({ store_id: storeAId, product_id: id, size: 40 });
      }
    });
    const { error: clicksError } = await anon.from("order_clicks").insert(clickRows);
    if (clicksError) {
      throw new Error(`Falha ao seedar order_clicks: ${clicksError.message}`);
    }

    // Ruído da Loja B — nunca deve aparecer nos resultados escopados pra Loja A.
    const { error: noiseViewsError } = await anon
      .from("pageviews")
      .insert({ store_id: storeBId, product_id: productBId, ...pageviewDedupColumns() });
    if (noiseViewsError) {
      throw new Error(`Falha ao seedar pageview de ruído da Loja B: ${noiseViewsError.message}`);
    }
    const { error: noiseClicksError } = await anon
      .from("order_clicks")
      .insert({ store_id: storeBId, product_id: productBId, size: 39 });
    if (noiseClicksError) {
      throw new Error(`Falha ao seedar order_click de ruído da Loja B: ${noiseClicksError.message}`);
    }
  }, 60000);

  afterAll(async () => {
    await lojaA?.client.from("stores").delete().eq("id", storeAId);
    await lojaB?.client.from("stores").delete().eq("id", storeBId);
  });

  it("queryAccessCount conta só os acessos ao grid (product_id null), nunca visualizações de produto (D-01)", async () => {
    const count = await queryAccessCount(lojaA.client, storeAId);
    expect(count).toBe(7);
  });

  it("queryTopViewedProducts retorna no máx 10 itens ordenados desc por views, truncando os 2 produtos com menos views", async () => {
    const top = await queryTopViewedProducts(lojaA.client, storeAId);
    expect(top.length).toBe(10);

    const viewsSequence = top.map((item) => item.views);
    expect(viewsSequence).toEqual([...viewsSequence].sort((a, b) => b - a));

    expect(top[0].productId).toBe(productIds[0]);
    expect(top[0].views).toBe(12);
    expect(top[0].name).toBe("Produto Métrica 1");
    expect(top[0].name.length).toBeGreaterThan(0);

    const topIds = top.map((item) => item.productId);
    expect(topIds).not.toContain(productIds[10]); // 2 views — fora do top 10
    expect(topIds).not.toContain(productIds[11]); // 1 view — fora do top 10
    expect(topIds).not.toContain(productBId);
  });

  it("queryTopOrderClickProducts retorna no máx 10 itens ordenados desc por clicks, ranking independente do de views", async () => {
    const top = await queryTopOrderClickProducts(lojaA.client, storeAId);
    expect(top.length).toBe(10);

    const clicksSequence = top.map((item) => item.clicks);
    expect(clicksSequence).toEqual([...clicksSequence].sort((a, b) => b - a));

    expect(top[0].productId).toBe(productIds[11]);
    expect(top[0].clicks).toBe(12);
    expect(top[0].name.length).toBeGreaterThan(0);

    const topIds = top.map((item) => item.productId);
    expect(topIds).not.toContain(productIds[0]); // 1 clique — fora do top 10
    expect(topIds).not.toContain(productIds[1]); // 2 cliques — fora do top 10
    expect(topIds).not.toContain(productBId);
  });

  it("isolamento cross-tenant: nenhuma das três funções retorna dado de outra loja mesmo passando o storeId da Loja B", async () => {
    const crossViews = await queryTopViewedProducts(lojaA.client, storeBId);
    expect(crossViews).toEqual([]);

    const crossClicks = await queryTopOrderClickProducts(lojaA.client, storeBId);
    expect(crossClicks).toEqual([]);

    const crossAccess = await queryAccessCount(lojaA.client, storeBId);
    expect(crossAccess).toBe(0);
  });
});
