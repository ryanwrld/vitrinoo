"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TAMANHO_AMOSTRA, queryIdsDaAmostra } from "@/lib/marketplace/amostra";

/**
 * Importação do marketplace para a loja do revendedor.
 *
 * O produto importado é uma CÓPIA independente: a partir daqui ele é do lojista,
 * que edita nome, preço e fotos sem nada disso voltar para o acervo. A única
 * coisa que sobrevive do vínculo é `products.marketplace_product_id`, que serve
 * de procedência — e é o que faz a vitrine exibir "Importado direto da fábrica
 * (Prazo: 7-25 dias)" em vez do rótulo comum de sob encomenda.
 *
 * AS FOTOS NÃO SÃO COPIADAS. `product_photos.source = 'marketplace'` aponta para
 * o bucket global, e só na primeira edição de foto o produto ganha cópias
 * próprias (decisão do dono: com 990 produtos, duplicar ~530 MB por lojista
 * inviabiliza o storage). Ver migration 0025.
 */

export type ResultadoImportacao = {
  ok: boolean;
  importados: number;
  jaTinha: number;
  bloqueadosPorLimite: number;
  /** Pedidos que não fazem parte da amostra sorteada desta loja. */
  foraDaAmostra: number;
  erro?: string;
};

export async function importarDoMarketplace(
  marketplaceProductIds: string[],
): Promise<ResultadoImportacao> {
  const vazio = { ok: true, importados: 0, jaTinha: 0, bloqueadosPorLimite: 0, foraDaAmostra: 0 };
  if (!marketplaceProductIds.length) return vazio;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ...vazio, ok: false, erro: "Sessão expirada. Entre novamente." };
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, marketplace_access")
    .eq("owner_id", userData.user.id)
    .single();

  if (!store) return { ...vazio, ok: false, erro: "Loja não encontrada." };

  // Fichas do acervo. A RLS já limita ao que esta loja pode ver — pedir um id
  // fora do alcance dela simplesmente não retorna linha, sem erro especial.
  const { data: fichas } = await supabase
    .from("marketplace_products")
    .select(
      "id, name, brand, brand_other, sole, category, suggested_price, size_min, size_max, marketplace_photos(storage_path, position)",
    )
    .in("id", marketplaceProductIds)
    .eq("status", "published");

  if (!fichas?.length) return { ...vazio, ok: false, erro: "Nenhuma chuteira disponível para importar." };

  // O que a loja já importou antes — evita recriar e evita gastar vaga da amostra.
  const { data: jaImportados } = await supabase
    .from("marketplace_imports")
    .select("id, marketplace_product_id, product_id")
    .eq("store_id", store.id);

  const jaAtivos = new Set(
    (jaImportados ?? []).filter((i) => i.product_id).map((i) => i.marketplace_product_id),
  );
  const jaConhecidos = new Set((jaImportados ?? []).map((i) => i.marketplace_product_id));

  // Rastros ÓRFÃOS: itens que a loja já importou e depois excluiu, cujo
  // `product_id` virou NULL. São reaproveitados em vez de gerar linha nova —
  // manter um rastro por par (loja, item) é o que faz a vaga da amostra não
  // ser cobrada de novo em quem reimporta.
  const rastroOrfao = new Map<string, string>();
  for (const i of jaImportados ?? []) {
    if (!i.product_id) rastroOrfao.set(i.marketplace_product_id, i.id);
  }

  const pendentes = fichas.filter((f) => !jaAtivos.has(f.id));
  const jaTinha = fichas.length - pendentes.length;

  // Espelho da regra que vale de verdade, que é o trigger da migration 0029.
  // Existe aqui só para dar uma MENSAGEM decente e não deixar produtos órfãos:
  // a chave `authenticated` é pública, então qualquer barreira só de aplicação
  // seria contornável chamando a REST direto.
  let permitidos = pendentes;
  let bloqueadosPorLimite = 0;
  let foraDaAmostra = 0;

  if (!store.marketplace_access) {
    // QUAIS, não quantos. A versão anterior cortava o excedente com
    // `novos.slice(disponiveis)` — ordem que vinha do cliente —, o que na
    // prática permitia escolher a dedo as 10 melhores do preview e esvaziava o
    // motivo de o pacote existir.
    const daAmostra = await queryIdsDaAmostra(supabase);
    const fora = pendentes.filter((p) => !daAmostra.has(p.id) && !jaConhecidos.has(p.id));
    if (fora.length) {
      const cortados = new Set(fora.map((p) => p.id));
      permitidos = permitidos.filter((p) => !cortados.has(p.id));
      foraDaAmostra = cortados.size;
    }

    const vagasUsadas = jaConhecidos.size;
    const disponiveis = Math.max(0, TAMANHO_AMOSTRA - vagasUsadas);
    const novos = permitidos.filter((p) => !jaConhecidos.has(p.id));
    if (novos.length > disponiveis) {
      const cortados = new Set(novos.slice(disponiveis).map((p) => p.id));
      permitidos = permitidos.filter((p) => !cortados.has(p.id));
      bloqueadosPorLimite = cortados.size;
    }
  }

  if (!permitidos.length) {
    return {
      ok: bloqueadosPorLimite === 0 && foraDaAmostra === 0,
      importados: 0,
      jaTinha,
      bloqueadosPorLimite,
      foraDaAmostra,
      erro:
        foraDaAmostra > 0
          ? "Essas chuteiras não fazem parte da sua amostra sorteada. Libere o pacote para escolher o que quiser."
          : bloqueadosPorLimite > 0
            ? `Você já usou as ${TAMANHO_AMOSTRA} chuteiras da amostra. Libere o pacote para importar o resto.`
            : undefined,
    };
  }

  let importados = 0;

  for (const ficha of permitidos) {
    // A LINHA DE RASTRO VEM PRIMEIRO, de propósito: é nela que o trigger de
    // quota dispara. Se viesse depois do produto, um bloqueio deixaria um
    // produto criado sem rastro — visível na loja e invisível para o controle
    // da amostra, que é o pior dos dois mundos.
    //
    // INSERT, não upsert: o índice que impede duplicata é PARCIAL
    // (`where product_id is not null`, migration 0025), e `ON CONFLICT` exige um
    // índice único total — um upsert aqui falha com 42P10. Reaproveitar o rastro
    // órfão quando ele existe resolve o mesmo problema sem depender disso.
    let rastroId = rastroOrfao.get(ficha.id) ?? null;

    if (!rastroId) {
      const { data: novo, error: erroRastro } = await supabase
        .from("marketplace_imports")
        .insert({ store_id: store.id, marketplace_product_id: ficha.id, product_id: null })
        .select("id")
        .single();

      if (erroRastro || !novo) {
        // O trigger de quota rejeita aqui quando a amostra acabou.
        bloqueadosPorLimite++;
        continue;
      }
      rastroId = novo.id;
    }

    const { data: produto, error: erroProduto } = await supabase
      .from("products")
      .insert({
        store_id: store.id,
        name: ficha.name,
        brand: ficha.brand,
        brand_other: ficha.brand_other,
        sole: ficha.sole,
        category: ficha.category ?? "Chuteira",
        // Sempre sob encomenda: o pacote existe para quem trabalha por
        // encomenda. Quem tem pronta entrega ajusta depois, produto a produto.
        fulfillment: "sob_encomenda",
        price: ficha.suggested_price,
        // Rascunho: publicar dezenas de itens direto na vitrine, com preço que o
        // lojista ainda não conferiu, é irreversível aos olhos do cliente final.
        status: "draft",
        marketplace_product_id: ficha.id,
      })
      .select("id")
      .single();

    if (erroProduto || !produto) continue;

    // Grade do fornecedor, toda disponível. Não é mentira no modelo por
    // encomenda: "disponível" aqui significa "o fornecedor tem essa numeração",
    // que é exatamente o que o lojista vende. Decisão registrada em
    // docs/marketplace/02-RESPOSTAS.md (resposta A4).
    const tamanhos = [];
    for (let t = ficha.size_min; t <= ficha.size_max; t++) {
      tamanhos.push({ product_id: produto.id, size: t, available: true });
    }
    if (tamanhos.length) await supabase.from("product_sizes").insert(tamanhos);

    const fotos = ((ficha.marketplace_photos ?? []) as Array<{
      storage_path: string;
      position: number;
    }>)
      .sort((a, b) => a.position - b.position)
      .map((f) => ({
        product_id: produto.id,
        storage_path: f.storage_path,
        position: f.position,
        source: "marketplace",
      }));
    if (fotos.length) await supabase.from("product_photos").insert(fotos);

    await supabase
      .from("marketplace_imports")
      .update({ product_id: produto.id })
      .eq("id", rastroId);

    importados++;
  }

  revalidatePath("/admin/marketplace");
  revalidatePath("/admin/produtos");

  return { ok: true, importados, jaTinha, bloqueadosPorLimite, foraDaAmostra };
}

/**
 * Importa o PACK inteiro (ou um álbum) numa única chamada ao banco.
 *
 * Usa a função `importar_marketplace_em_lote` (migration 0028) em vez do laço de
 * `importarDoMarketplace`: 990 produtos pelo caminho item a item seriam ~4.000
 * idas ao banco e minutos de espera, sem atomicidade se caísse no meio. A função
 * resolve em uma transação — ou tudo entra, ou nada entra.
 */
export async function importarEmLote(
  ids: string[],
): Promise<{ ok: boolean; importados: number; jaTinha: number; bloqueados: number; erro?: string }> {
  const vazio = { ok: true, importados: 0, jaTinha: 0, bloqueados: 0 };
  if (!ids.length) return vazio;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importar_marketplace_em_lote", { p_ids: ids });

  if (error) return { ...vazio, ok: false, erro: error.message };

  const r = (data ?? {}) as {
    ok?: boolean;
    erro?: string;
    importados?: number;
    ja_tinha?: number;
    bloqueados?: number;
  };
  if (r.ok === false) return { ...vazio, ok: false, erro: r.erro ?? "Falha na importação." };

  revalidatePath("/admin/marketplace");
  revalidatePath("/admin/marketplace/tudo");
  revalidatePath("/admin/produtos");

  return {
    ok: true,
    importados: r.importados ?? 0,
    jaTinha: r.ja_tinha ?? 0,
    bloqueados: r.bloqueados ?? 0,
  };
}

/**
 * Só quem liberou o pacote importa em massa.
 *
 * Falhar cedo, com frase inteira: o banco já barra (0029), mas a mensagem que
 * ele devolve é a de um item, e "adicionar o álbum Nike" pedindo 468 chuteiras
 * para uma loja com 10 vagas sorteadas voltaria como um erro sem sentido.
 */
async function exigirAcessoAoPacote(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return "Sessão expirada. Entre novamente.";

  const { data: store } = await supabase
    .from("stores")
    .select("marketplace_access")
    .eq("owner_id", userData.user.id)
    .single();

  if (!store) return "Loja não encontrada.";
  if (!store.marketplace_access) {
    return "Adicionar tudo de uma vez precisa do pacote liberado. Sua amostra grátis é sorteada.";
  }
  return null;
}

/** Todas as chuteiras do pack, sem repetir as que estão em mais de um álbum. */
export async function importarPackInteiro(packId: string) {
  const supabase = await createClient();

  const erro = await exigirAcessoAoPacote(supabase);
  if (erro) return { ok: false, importados: 0, jaTinha: 0, bloqueados: 0, erro };

  const { data: albuns } = await supabase
    .from("marketplace_albums")
    .select("marketplace_album_products(marketplace_product_id)")
    .eq("pack_id", packId);

  const ids = new Set<string>();
  for (const a of albuns ?? []) {
    const ligacoes = (a.marketplace_album_products ?? []) as Array<{
      marketplace_product_id: string;
    }>;
    ligacoes.forEach((l) => ids.add(l.marketplace_product_id));
  }
  return importarEmLote([...ids]);
}

/** Todas as chuteiras de um álbum. */
export async function importarAlbumInteiro(albumId: string) {
  const supabase = await createClient();

  const erro = await exigirAcessoAoPacote(supabase);
  if (erro) return { ok: false, importados: 0, jaTinha: 0, bloqueados: 0, erro };

  const { data } = await supabase
    .from("marketplace_album_products")
    .select("marketplace_product_id")
    .eq("album_id", albumId);
  return importarEmLote((data ?? []).map((l) => l.marketplace_product_id));
}

/** Desfaz uma importação: apaga o produto e libera a reimportação. */
export async function desimportar(productId: string): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return { ok: false, erro: error.message };

  // `marketplace_imports.product_id` é `on delete set null`, então o rastro
  // sobrevive à exclusão — é o que impede a vaga da amostra de ser cobrada duas
  // vezes quando o lojista exclui e importa o mesmo item de novo.
  revalidatePath("/admin/marketplace");
  revalidatePath("/admin/produtos");
  return { ok: true };
}
