import { describe, it, expect } from "vitest";
import { seedAuthenticatedAccount } from "../setup/supabase-test";
import { queryPublicProducts, PUBLIC_PAGE_SIZE } from "@/lib/products/public-list";

/**
 * Cobre VITR-01/VITR-04 (04-02-PLAN.md Task 1): queryPublicProducts filtra
 * status='published' (nunca draft), isola por storeId (defesa em
 * profundidade, mesma disciplina de queryProducts/T-03-13), e pagina
 * corretamente (PUBLIC_PAGE_SIZE por carga, técnica "buscar N+1, mostrar N"
 * para hasMore, page 1-based).
 *
 * Filtros multi-select/busca são adicionados no Plan 04-03 (mesmo arquivo,
 * novos casos) — este arquivo cobre só o Plan 04-02 nesta primeira versão.
 *
 * Seed direto via o client autenticado do dono (mesma disciplina de
 * tests/products/list-filter-sort.test.ts) — queryPublicProducts é uma
 * função pura que recebe (supabase, storeId, params) diretamente.
 */
describe("queryPublicProducts (leitura pública paginada de produtos publicados)", () => {
  it("filtra só status=published, deriva disponibilidade/capa, isola por loja", async () => {
    const lojaA = await seedAuthenticatedAccount("public-list-a");
    const lojaB = await seedAuthenticatedAccount("public-list-b");

    const { data: storeA, error: storeAError } = await lojaA.client
      .from("stores")
      .insert({ owner_id: lojaA.userId, name: "Loja A - Vitrine Pública", slug: `loja-a-public-list-${Date.now()}` })
      .select()
      .single();
    if (storeAError || !storeA) throw new Error(`Falha ao seedar store da Loja A: ${storeAError?.message}`);

    const { data: storeB, error: storeBError } = await lojaB.client
      .from("stores")
      .insert({ owner_id: lojaB.userId, name: "Loja B - Vitrine Pública", slug: `loja-b-public-list-${Date.now()}` })
      .select()
      .single();
    if (storeBError || !storeB) throw new Error(`Falha ao seedar store da Loja B: ${storeBError?.message}`);

    const { data: publishedProduct, error: publishedError } = await lojaA.client
      .from("products")
      .insert({ store_id: storeA.id, name: "Mercurial Publicado", brand: "Nike", price: 599.9, status: "published" })
      .select("id")
      .single();
    if (publishedError || !publishedProduct) throw new Error(`Falha ao seedar produto published: ${publishedError?.message}`);

    const { data: draftProduct, error: draftError } = await lojaA.client
      .from("products")
      .insert({ store_id: storeA.id, name: "Predator Rascunho", brand: "Adidas", price: 499.9, status: "draft" })
      .select("id")
      .single();
    if (draftError || !draftProduct) throw new Error(`Falha ao seedar produto draft: ${draftError?.message}`);

    const { error: sizeError } = await lojaA.client
      .from("product_sizes")
      .insert({ product_id: publishedProduct.id, size: 40, available: true });
    if (sizeError) throw new Error(`Falha ao seedar product_sizes: ${sizeError.message}`);

    const { error: photoError } = await lojaA.client
      .from("product_photos")
      .insert({ product_id: publishedProduct.id, storage_path: `${lojaA.userId}/${publishedProduct.id}/capa.jpg`, position: 0 });
    if (photoError) throw new Error(`Falha ao seedar product_photos: ${photoError.message}`);

    const { error: productBError } = await lojaB.client
      .from("products")
      .insert({ store_id: storeB.id, name: "Produto da Loja B", brand: "Nike", price: 100, status: "published" });
    if (productBError) throw new Error(`Falha ao seedar produto da Loja B: ${productBError.message}`);

    const result = await queryPublicProducts(lojaA.client, storeA.id, { page: 1 }, false);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe("Mercurial Publicado");
    expect(result.products[0].disponivel).toBe(true);
    expect(result.products[0].coverPath).toBe(`${lojaA.userId}/${publishedProduct.id}/capa.jpg`);
    expect(result.hasMore).toBe(false);

    // Isolamento cross-tenant: storeA nunca retorna produto da Loja B, mesmo
    // que ambos tenham status published.
    expect(result.products.some((p) => p.name.includes("Loja B"))).toBe(false);

    await lojaA.client.from("stores").delete().eq("id", storeA.id);
    await lojaB.client.from("stores").delete().eq("id", storeB.id);
  }, 30000);

  it("pagina corretamente: PUBLIC_PAGE_SIZE+1 publicados -> page 1 enche a página (hasMore=true), page 2 traz o resto (hasMore=false)", async () => {
    const loja = await seedAuthenticatedAccount("public-list-pagination");

    const { data: store, error: storeError } = await loja.client
      .from("stores")
      .insert({ owner_id: loja.userId, name: "Loja Paginação Pública", slug: `loja-paginacao-publica-${Date.now()}` })
      .select()
      .single();
    if (storeError || !store) throw new Error(`Falha ao seedar store: ${storeError?.message}`);

    const now = Date.now();
    const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

    const TOTAL_PRODUCTS = PUBLIC_PAGE_SIZE + 1; // 21
    for (let i = 0; i < TOTAL_PRODUCTS; i++) {
      const { error } = await loja.client.from("products").insert({
        store_id: store.id,
        name: `Produto Paginado ${i}`,
        brand: "Nike",
        price: 100 + i,
        status: "published",
        created_at: daysAgo(TOTAL_PRODUCTS - i), // ordem crescente de idade -> mais recente por último criado
      });
      if (error) throw new Error(`Falha ao seedar produto paginado ${i}: ${error.message}`);
    }

    const page1 = await queryPublicProducts(loja.client, store.id, { page: 1 }, false);
    expect(page1.products).toHaveLength(PUBLIC_PAGE_SIZE);
    expect(page1.hasMore).toBe(true);

    const page2 = await queryPublicProducts(loja.client, store.id, { page: 2 }, false);
    expect(page2.products).toHaveLength(1);
    expect(page2.hasMore).toBe(false);

    // Sem sobreposição/pulo entre páginas.
    const page1Ids = new Set(page1.products.map((p) => p.id));
    const page2Ids = new Set(page2.products.map((p) => p.id));
    const overlap = [...page1Ids].filter((id) => page2Ids.has(id));
    expect(overlap).toEqual([]);

    await loja.client.from("stores").delete().eq("id", store.id);
  }, 30000);

  it("filtra por marca multi-select (D-02), solado, modalidade, busca por nome, combinados", async () => {
    const loja = await seedAuthenticatedAccount("public-list-filters");

    const { data: store, error: storeError } = await loja.client
      .from("stores")
      .insert({ owner_id: loja.userId, name: "Loja Filtros Públicos", slug: `loja-filtros-publicos-${Date.now()}` })
      .select()
      .single();
    if (storeError || !store) throw new Error(`Falha ao seedar store: ${storeError?.message}`);

    const productsToSeed = [
      { name: "Mercurial Vapor", brand: "Nike", sole: "FG", fulfillment: "pronta_entrega", price: 899.9 },
      { name: "Predator Elite", brand: "Adidas", sole: "AG", fulfillment: "sob_encomenda", price: 799.9 },
      { name: "Ultra Ultimate", brand: "Puma", sole: "FG", fulfillment: "ambos", price: 1099.9 },
    ];

    for (const product of productsToSeed) {
      const { error } = await loja.client
        .from("products")
        .insert({ store_id: store.id, status: "published", ...product });
      if (error) throw new Error(`Falha ao seedar produto ${product.name}: ${error.message}`);
    }

    // Multi-select de marca (D-02): Nike E Adidas ao mesmo tempo.
    const brandResult = await queryPublicProducts(loja.client, store.id, { brand: ["Nike", "Adidas"] }, false);
    expect(brandResult.products.map((p) => p.name).sort()).toEqual(["Mercurial Vapor", "Predator Elite"]);

    // Filtro por solado.
    const soleResult = await queryPublicProducts(loja.client, store.id, { sole: ["FG"] }, false);
    expect(soleResult.products.map((p) => p.name).sort()).toEqual(["Mercurial Vapor", "Ultra Ultimate"]);

    // Filtro por modalidade — um produto marcado "ambos" satisfaz TANTO
    // pronta entrega quanto encomenda, então aparece nas duas seleções
    // (expandFulfillmentFilter). Antes ele sumia de ambas e só era
    // alcançável por um chip "Ambos", que era o bug: o cliente que filtrava
    // "Pronta entrega" não via produtos que o revendedor entrega na hora.
    const fulfillmentResult = await queryPublicProducts(loja.client, store.id, { fulfillment: ["sob_encomenda"] }, false);
    expect(fulfillmentResult.products.map((p) => p.name).sort()).toEqual(["Predator Elite", "Ultra Ultimate"]);

    const prontaResult = await queryPublicProducts(loja.client, store.id, { fulfillment: ["pronta_entrega"] }, false);
    expect(prontaResult.products.map((p) => p.name).sort()).toEqual(["Mercurial Vapor", "Ultra Ultimate"]);

    // Busca por nome (ilike, parcial, case-insensitive).
    const searchResult = await queryPublicProducts(loja.client, store.id, { q: "merc" }, false);
    expect(searchResult.products.map((p) => p.name)).toEqual(["Mercurial Vapor"]);

    // Filtro combinado (brand + sole).
    const combinedResult = await queryPublicProducts(loja.client, store.id, { brand: ["Nike", "Puma"], sole: ["FG"] }, false);
    expect(combinedResult.products.map((p) => p.name).sort()).toEqual(["Mercurial Vapor", "Ultra Ultimate"]);

    // Valor de marca inválido/inexistente é ignorado silenciosamente (Security Domain V5)
    // — nunca lançado como erro, nunca interpolado cru; resultado equivale a nenhum filtro de marca.
    const invalidBrandResult = await queryPublicProducts(loja.client, store.id, { brand: ["Reebok"] }, false);
    expect(invalidBrandResult.products).toHaveLength(3);

    // Ordenação por preço (799,90 / 899,90 / 1099,90).
    const menorPreco = await queryPublicProducts(loja.client, store.id, { sort: "menor_preco" }, false);
    expect(menorPreco.products.map((p) => p.name)).toEqual([
      "Predator Elite",
      "Mercurial Vapor",
      "Ultra Ultimate",
    ]);

    const maiorPreco = await queryPublicProducts(loja.client, store.id, { sort: "maior_preco" }, false);
    expect(maiorPreco.products.map((p) => p.name)).toEqual([
      "Ultra Ultimate",
      "Mercurial Vapor",
      "Predator Elite",
    ]);

    // Valor de ordenação arbitrário vindo da URL cai no padrão em vez de
    // chegar ao Postgres — mesma disciplina de allowlist dos filtros.
    const sortInvalido = await queryPublicProducts(loja.client, store.id, { sort: "'; drop table--" }, false);
    expect(sortInvalido.products).toHaveLength(3);

    await loja.client.from("stores").delete().eq("id", store.id);
  }, 30000);
});
