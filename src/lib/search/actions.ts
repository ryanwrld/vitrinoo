"use server";

import { createClient } from "@/lib/supabase/server";
import { getProductImagePublicUrl, BUCKET_POR_ORIGEM } from "@/lib/storage/product-image-url";
import { escaparCurringasIlike, normalizeSearch } from "@/lib/search/ilike";

/**
 * Busca global do painel — as TRÊS fontes dinâmicas numa ida só.
 *
 * UMA ação, e não três: cada chamada de Server Action refaz `getUser()` e a
 * busca da loja do dono. Com três ações separadas isso aconteceria três vezes
 * por tecla digitada, para montar um painel só. Aqui o preâmbulo roda uma vez e
 * as três consultas saem em paralelo.
 *
 * O QUE CADA FONTE RESPONDE:
 *   - meusProdutos: o que a loja já tem. Leva para a edição do produto.
 *   - noPacote: o que existe no pacote e a loja ainda não tem. É esta que faz a
 *     busca servir para uma loja recém-criada, que antes não achava nada.
 *   - albuns: os poucos álbuns por marca/estilo. Levam para a lista filtrada.
 *
 * O storeId NUNCA vem do client — mesmo padrão de `getOwnedStore` em
 * settings/actions.ts.
 */

export type ProductSearchResult = {
  id: string;
  name: string;
  price: number;
  disponivel: boolean;
  coverUrl: string | null;
};

export type PackProductSearchResult = {
  id: string;
  name: string;
  coverUrl: string | null;
  /**
   * Quantas linhas do pacote têm exatamente este nome.
   *
   * SEM PREÇO no lugar disto, de propósito: `suggested_price` é o preço da
   * curadoria, não o que o lojista vai cobrar — o fluxo de precificação existe
   * justamente porque quem define é ele. Mostrar aquele número num resultado de
   * busca planta na cabeça dele um preço que não é o dele e que ele nunca vai
   * usar. E preço não é o que se decide aqui: a pergunta desta tela é "é esta
   * chuteira?", que a foto e o nome respondem.
   *
   * A contagem responde algo que o preço não respondia: por que esta linha
   * representa várias. É exata, porque a janela cobre o pacote inteiro.
   */
  opcoes: number;
};

export type AlbumSearchResult = {
  id: string;
  name: string;
  total: number;
};

export type GlobalSearchResult = {
  meusProdutos: ProductSearchResult[];
  noPacote: PackProductSearchResult[];
  albuns: AlbumSearchResult[];
};

const VAZIO: GlobalSearchResult = { meusProdutos: [], noPacote: [], albuns: [] };

/** Curto de propósito: a busca é atalho, não listagem. Quem quer ver tudo tem a rota. */
const LIMITE_PRODUTOS = 5;
const LIMITE_PACOTE = 5;
const LIMITE_ALBUNS = 4;
/**
 * Janela lida do pacote para extrair os nomes distintos.
 *
 * COBRE O PACOTE INTEIRO de propósito. Com 200 o resultado saía enviesado: como
 * o mesmo modelo se repete dezenas de vezes e a ordem é alfabética, as 200
 * primeiras linhas de "nike" eram só os quatro nomes do começo do alfabeto — um
 * "Nike Zoom" nunca apareceria, existindo ou não. Lendo tudo, os nomes distintos
 * são os reais.
 *
 * O custo fica no servidor, não no lojista: são só `id` e `name`, e essa lista
 * nunca chega ao navegador — só as cinco linhas escolhidas viajam.
 */
const JANELA_PACOTE = 1000;

/**
 * Coluna contra a qual o termo é comparado.
 *
 * `name_busca` é gerada pela migration 0037: minúscula e sem acento, para
 * "sintetica" achar "sintética". O termo passa pela MESMA normalização aqui
 * (`normalizeSearch`, em search/ilike.ts, espelho de `public.busca_sem_acento`)
 * antes de virar padrão — as duas pontas têm que concordar, senão o termo casa
 * de um lado e não casa do outro.
 */
const COLUNA_NOME = "name_busca";

export async function searchGlobal(query: string): Promise<GlobalSearchResult> {
  // Normaliza ANTES de escapar: a coluna do banco guarda o texto já em
  // minúscula e sem acento, então o termo tem que chegar na mesma forma. Depois
  // escapa, para um `%` digitado não virar curinga e devolver a tabela inteira.
  const termo = escaparCurringasIlike(normalizeSearch(query));
  if (!termo) return VAZIO;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return VAZIO;

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user.id)
    .single();
  if (!store) return VAZIO;

  const padrao = `%${termo}%`;
  // Sem escape, para comparar em memória no filtro dos álbuns — lá não existe
  // `ilike`, e a barra invertida do escape não faz parte do que o usuário digitou.
  const termoLimpo = normalizeSearch(query).trim();

  const [meusProdutos, noPacote, albuns] = await Promise.all([
    buscarMeusProdutos(supabase, store.id, padrao),
    buscarNoPacote(supabase, padrao),
    buscarAlbuns(supabase, termoLimpo),
  ]);

  return { meusProdutos, noPacote, albuns };
}

type Cliente = Awaited<ReturnType<typeof createClient>>;

async function buscarMeusProdutos(
  supabase: Cliente,
  storeId: string,
  padrao: string,
): Promise<ProductSearchResult[]> {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, price")
    .eq("store_id", storeId)
    .ilike(COLUNA_NOME, padrao)
    .order("created_at", { ascending: false })
    .limit(LIMITE_PRODUTOS);

  // ERRO SOBE, não vira lista vazia. Engolir aqui transformaria qualquer falha
  // de consulta em "Nenhum resultado" — a busca mentiria dizendo que não existe
  // o que ela não conseguiu procurar. Quem chama converte isso no aviso de erro.
  if (error) throw new Error(`Busca nos produtos da loja falhou: ${error.message}`);
  if (!products || products.length === 0) return [];

  const ids = products.map((product) => product.id);

  // Disponibilidade (qualquer tamanho disponível = "Disponível") e capa
  // (primeira foto por position) — mesma semântica do dashboard.
  const [{ data: sizeRows }, { data: photoRows }] = await Promise.all([
    supabase.from("product_sizes").select("product_id, available").in("product_id", ids),
    supabase
      .from("product_photos")
      .select("product_id, storage_path, position, source")
      .in("product_id", ids)
      .order("position", { ascending: true }),
  ]);

  const disponiveis = new Set(
    (sizeRows ?? []).filter((row) => row.available).map((row) => row.product_id),
  );

  const capaPorProduto = new Map<string, { path: string; source: string | null }>();
  for (const photo of photoRows ?? []) {
    if (!capaPorProduto.has(photo.product_id)) {
      capaPorProduto.set(photo.product_id, { path: photo.storage_path, source: photo.source });
    }
  }

  return products.map((product) => {
    // Bucket pela origem: sem isto, um produto importado devolvia miniatura quebrada.
    const capa = capaPorProduto.get(product.id);
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      disponivel: disponiveis.has(product.id),
      coverUrl: getProductImagePublicUrl(supabase, capa?.path ?? null, capa?.source ?? null),
    };
  });
}

/**
 * As chuteiras do pacote.
 *
 * Consulta enxuta escrita aqui em vez de reusar `queryMarketplaceProducts`: ela
 * devolve página de 48 com colunas que este resultado não usa, e puxar 48 linhas
 * por tecla digitada para mostrar 5 é desperdício.
 *
 * Sem filtro de status: a RLS da migration 0030 já restringe a leitura a
 * `status = 'published'` — exatamente o que a navegação mostra. A busca não
 * expõe nada que o lojista não veja clicando.
 *
 * AGRUPADO POR NOME, e é por isso que são duas idas ao banco.
 *
 * O pacote repete o mesmo modelo em várias cores: "Nike Streetgato Futsal (IC)"
 * existe 18 vezes, com marca, solado e preço idênticos — só a foto muda. Sem
 * agrupar, buscar "nike" devolvia cinco linhas que eram o mesmo texto três vezes
 * e outro duas: o lojista lia a mesma coisa repetida e não tinha como escolher.
 *
 * Então a primeira consulta traz só `id, name` de uma janela larga, barata, e
 * daí saem os cinco PRIMEIROS NOMES DISTINTOS. A segunda busca a foto apenas
 * desses cinco. Trazer foto de tudo para descartar quase tudo seria o caro.
 *
 * A linha anuncia quantas opções existem daquele nome, e o número é EXATO
 * porque a janela cobre o pacote inteiro. É o que explica por que uma linha só
 * representa dezoito: quem clica cai na lista filtrada por aquele nome, onde as
 * variações aparecem com foto — que é onde a escolha realmente acontece.
 */
async function buscarNoPacote(supabase: Cliente, padrao: string): Promise<PackProductSearchResult[]> {
  const { data: candidatos, error } = await supabase
    .from("marketplace_products")
    .select("id, name")
    .ilike(COLUNA_NOME, padrao)
    .order("name", { ascending: true })
    .limit(JANELA_PACOTE);

  if (error) throw new Error(`Busca no pacote falhou: ${error.message}`);
  if (!candidatos || candidatos.length === 0) return [];

  // Conta ANTES de cortar: o corte é de linhas mostradas, não de linhas
  // contadas. Contar depois faria "18 opções" virar "5 opções".
  const totalPorNome = new Map<string, number>();
  for (const item of candidatos) {
    totalPorNome.set(item.name, (totalPorNome.get(item.name) ?? 0) + 1);
  }

  const porNome = new Map<string, { id: string; name: string; opcoes: number }>();
  for (const item of candidatos) {
    if (porNome.size >= LIMITE_PACOTE) break;
    if (porNome.has(item.name)) continue;
    porNome.set(item.name, {
      id: item.id,
      name: item.name,
      opcoes: totalPorNome.get(item.name) ?? 1,
    });
  }

  const escolhidos = [...porNome.values()];
  const { data: fotos } = await supabase
    .from("marketplace_photos")
    .select("marketplace_product_id, storage_path, position")
    .in("marketplace_product_id", escolhidos.map((item) => item.id))
    .order("position", { ascending: true });

  // Falha só de foto não derruba o resultado: a linha sem miniatura ainda leva
  // ao destino certo, e o componente já desenha o lugar vazio da imagem.
  const capaPorProduto = new Map<string, string>();
  for (const foto of fotos ?? []) {
    if (!capaPorProduto.has(foto.marketplace_product_id)) {
      capaPorProduto.set(foto.marketplace_product_id, foto.storage_path);
    }
  }

  return escolhidos.map((item) => {
    const capa = capaPorProduto.get(item.id);
    return {
      ...item,
      coverUrl: capa
        ? supabase.storage.from(BUCKET_POR_ORIGEM.marketplace).getPublicUrl(capa).data.publicUrl
        : null,
    };
  });
}

/**
 * Álbuns por marca/estilo.
 *
 * São poucos (8 hoje), então a consulta é direta e sem paginação. A contagem sai
 * da tabela de ligação, que é a mesma fonte do número mostrado no card do álbum
 * — usar outra faria a busca anunciar um total diferente do da tela de destino.
 *
 * Filtrados em MEMÓRIA, e não no banco: a tabela de álbuns não tem a coluna
 * `name_busca`, e criar uma para oito linhas seria migration por capricho. Com
 * o filtro aqui, o acento é resolvido pela mesma `normalizeSearch` de graça.
 */
async function buscarAlbuns(supabase: Cliente, termo: string): Promise<AlbumSearchResult[]> {
  const { data, error } = await supabase
    .from("marketplace_albums")
    .select("id, name, position, marketplace_album_products(marketplace_product_id)")
    .order("position", { ascending: true });

  if (error) throw new Error(`Busca nos álbuns falhou: ${error.message}`);
  if (!data) return [];

  return data
    .filter((album) => normalizeSearch(album.name).includes(termo))
    .slice(0, LIMITE_ALBUNS)
    .map((album) => ({
      id: album.id,
      name: album.name,
      total: ((album.marketplace_album_products ?? []) as unknown[]).length,
    }));
}

