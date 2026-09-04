"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBRLPrice } from "@/lib/currency/brl";
import { queryIdsDaAmostra } from "@/lib/marketplace/amostra";
import { queryPackPrincipal, queryIdsDoPack } from "@/lib/marketplace/packs";
import {
  TIPOS_DE_SOLADO,
  expandirParaSolados,
  queryContextoPrecificacao,
  queryRegraDaLoja,
  queryTiposPresentes,
  type ContextoPrecificacao,
} from "@/lib/marketplace/precificacao";

/**
 * Precificar e importar, numa ação só.
 *
 * A ORDEM IMPORTA e é o motivo de esta ação existir: até aqui, importar gravava
 * `suggested_price` — o preço da curadoria — e o lojista ficava com centenas de rascunhos
 * com um número que ele não escolheu. Publicar um deles por engano é dinheiro perdido de
 * verdade. Agora o preço é decidido ANTES, e o produto nasce certo.
 *
 * A REGRA É GRAVADA ANTES DA IMPORTAÇÃO, de propósito: se a importação falhar no meio, o
 * lojista reabre o fluxo com o que ele já tinha digitado em vez de recomeçar do zero. O
 * inverso perderia o trabalho dele justamente no caso ruim.
 */

export type Origem = "amostra" | "pacote";

export type ResultadoPrecificacao = {
  ok: boolean;
  importados: number;
  jaTinha: number;
  bloqueados: number;
  erro?: string;
};

const FALHA = (erro: string): ResultadoPrecificacao => ({
  ok: false,
  importados: 0,
  jaTinha: 0,
  bloqueados: 0,
  erro,
});

export async function precificarEImportar(entrada: {
  origem: Origem;
  /** Um preço por TIPO da interface ("fg", "sg", "ic", "tf", "ag"), como o usuário digitou. */
  precosPorTipo: Record<string, string>;
  adicionalLancamento: string;
}): Promise<ResultadoPrecificacao> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return FALHA("Sessão expirada. Entre novamente.");

  const { data: store } = await supabase
    .from("stores")
    .select("id, marketplace_access")
    .eq("owner_id", userData.user.id)
    .single();

  if (!store) return FALHA("Loja não encontrada.");

  /*
    QUAIS ids entram é decidido AQUI, no servidor, e nunca vem do cliente.

    A chave `authenticated` do Supabase é pública: uma lista de ids vinda do formulário
    permitiria a quem está na amostra pedir os 990 — e ainda que o trigger de quota da 0029
    barrasse, ele escolheria a dedo QUAIS 10 levar, que é justamente o que a amostra
    sorteada existe para impedir.
  */
  const ids =
    entrada.origem === "amostra"
      ? [...(await queryIdsDaAmostra(supabase))]
      : await idsDoPacote(supabase, Boolean(store.marketplace_access));

  if (!ids.length) {
    return FALHA(
      entrada.origem === "amostra"
        ? "Sua amostra ainda não foi sorteada. Recarregue a página."
        : "Nenhum pacote disponível para importar.",
    );
  }

  /*
    Validação na fronteira do servidor, com `parseBRLPrice` — nunca `Number()` cru sobre o
    input. O campo aceita vírgula decimal ("430,50") e é isso que um `Number()` transforma
    em NaN, que viraria preço nulo num produto que o cliente final vai ver.

    EXIGE PREÇO SÓ DOS TIPOS QUE ESTE CONJUNTO TEM, e quem diz quais é o BANCO, nunca o
    formulário: a tela esconde o tipo sem nenhum par (dez sorteadas podem não ter uma
    society sequer), então cobrar os cinco aqui rejeitaria um envio legítimo. Confiar no
    cliente para dizer quais cobrar seria o erro simétrico — um tipo cheio de pares passaria
    sem preço e cairia no `coalesce` do RPC, gravando o preço da curadoria.
  */
  const presentes = await queryTiposPresentes(supabase, ids);
  const aCobrar = TIPOS_DE_SOLADO.filter((t) => presentes.has(t.id));

  const porTipo: Record<string, number> = {};
  for (const tipo of aCobrar) {
    const cru = entrada.precosPorTipo[tipo.id] ?? "";
    const valor = parseBRLPrice(cru);
    if (valor === null) {
      return FALHA(`Informe um preço válido para ${tipo.rotulo}.`);
    }
    porTipo[tipo.id] = valor;
  }

  // Adicional em branco é ZERO, e não erro: o lojista que não diferencia lançamento passa
  // reto pela etapa 2, e obrigá-lo a digitar "0" seria atrito por nada.
  const adicionalCru = entrada.adicionalLancamento.trim();
  const adicional = adicionalCru ? (parseBRLPrice(adicionalCru) ?? null) : 0;
  if (adicional === null) return FALHA("Informe um adicional de lançamento válido.");

  const precosPorSolado = expandirParaSolados(porTipo);

  /*
    MESCLA com o que a loja já tinha, em vez de substituir.

    Como agora só os tipos presentes são cobrados, um upsert cru apagaria da regra o preço de
    um tipo que ficou de fora desta leva — e é dela que o formulário sai pré-preenchido, então
    a próxima importação pediria de novo um número que ele já tinha dado. O que ele digitou
    AGORA manda: as chaves novas sobrescrevem as antigas.
  */
  const regraAnterior = await queryRegraDaLoja(supabase, store.id);
  const precosGravados = { ...(regraAnterior?.precosPorSolado ?? {}), ...precosPorSolado };

  const { error: erroRegra } = await supabase.from("store_pricing").upsert(
    {
      store_id: store.id,
      sole_prices: precosGravados,
      launch_surcharge: adicional,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id" },
  );

  if (erroRegra) return FALHA("Não foi possível salvar seus preços. Tente de novo.");

  const { data, error } = await supabase.rpc("importar_marketplace_em_lote", {
    p_ids: ids,
    p_precos: precosPorSolado,
    p_adicional: adicional,
  });

  if (error) return FALHA(error.message);

  const r = (data ?? {}) as {
    ok?: boolean;
    erro?: string;
    importados?: number;
    ja_tinha?: number;
    bloqueados?: number;
  };
  if (r.ok === false) return FALHA(r.erro ?? "Falha na importação.");

  /*
    O carimbo só é gravado DEPOIS de a importação dar certo. É ele que desarma a abertura
    automática do fluxo (`marketplace_access && pack_imported_at is null`) — carimbar antes
    deixaria o lojista com o acesso liberado, sem produto nenhum, e sem o fluxo voltando
    para tentar de novo.
  */
  if (entrada.origem === "pacote") {
    await supabase
      .from("stores")
      .update({ pack_imported_at: new Date().toISOString() })
      .eq("id", store.id);
  } else {
    // Some com a pendência da amostra. É o que faz o fluxo parar de reabrir — o simétrico
    // do `pack_imported_at`, e pelo mesmo motivo: só DEPOIS de os produtos existirem.
    await supabase
      .from("stores")
      .update({ sample_pricing_started_at: null })
      .eq("id", store.id);
  }

  revalidatePath("/admin/marketplace");
  revalidatePath("/admin/marketplace/tudo");
  revalidatePath("/admin/produtos");
  revalidatePath("/admin/dashboard");

  return {
    ok: true,
    importados: r.importados ?? 0,
    jaTinha: r.ja_tinha ?? 0,
    bloqueados: r.bloqueados ?? 0,
  };
}

/**
 * Todas as chuteiras do pack principal.
 *
 * Falha cedo para quem não liberou: o banco já barra (trigger da 0029), mas a mensagem que
 * ele devolve é a de UM item, e um pedido de 990 vindo de uma loja com 10 vagas voltaria
 * como um erro sem sentido para quem está lendo a tela.
 */
async function idsDoPacote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  temAcesso: boolean,
): Promise<string[]> {
  if (!temAcesso) return [];
  const pack = await queryPackPrincipal(supabase);
  if (!pack) return [];
  return queryIdsDoPack(supabase, pack.id);
}

/**
 * Carrega o que o fluxo precisa para abrir, SOB DEMANDA.
 *
 * Não é prop de página de propósito. O contexto do pacote lê 990 fichas para contar por
 * solado e achar o modelo de destaque — pagar isso em todo carregamento de
 * `/admin/marketplace` (e, no caso da abertura automática, em toda navegação do painel)
 * seria cobrar de todo mundo um custo que só quem abre o fluxo usa.
 *
 * A URL da foto do destaque é resolvida AQUI: o cliente não monta caminho de bucket, que é
 * a regra que mantém `marketplace-assets` como detalhe do servidor.
 */
export async function carregarContextoPrecificacao(origem: Origem): Promise<{
  contexto: ContextoPrecificacao;
  urlDaFoto: string | null;
} | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: store } = await supabase
    .from("stores")
    .select("id, marketplace_access")
    .eq("owner_id", userData.user.id)
    .single();

  if (!store) return null;

  const ids =
    origem === "amostra"
      ? [...(await queryIdsDaAmostra(supabase))]
      : await idsDoPacote(supabase, Boolean(store.marketplace_access));

  if (!ids.length) return null;

  const contexto = await queryContextoPrecificacao(supabase, store.id, ids);

  const urlDaFoto = contexto.destaque?.fotoPath
    ? supabase.storage.from("marketplace-assets").getPublicUrl(contexto.destaque.fotoPath).data
        .publicUrl
    : null;

  return { contexto, urlDaFoto };
}

/**
 * Marca que o lojista ACEITOU a amostra e entrou na precificação.
 *
 * A partir daqui o fluxo é irrecusável: sem X, sem Esc, sem clique fora — e, porque o
 * estado vive no banco e não na aba, ele reabre depois de recarregar, de sair da conta ou
 * de entrar por outro aparelho. Antes disso a precificação existia só enquanto o pop-up
 * estivesse montado, e fechar a aba deixava o lojista sem as 10 chuteiras e sem caminho de
 * volta, porque o sorteio só oferece o botão uma vez.
 *
 * Aceitar o teste grátis continua opcional: fechar o SORTEIO não chama isto.
 */
export async function iniciarPrecificacaoAmostra(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false };

  const { data: store } = await supabase
    .from("stores")
    .select("id, sample_pricing_started_at")
    .eq("owner_id", userData.user.id)
    .single();

  if (!store) return { ok: false };
  // Já pendente: não reescreve o carimbo. O que importa é ESTAR pendente, e regravar a
  // cada reabertura só apagaria desde quando ele está devendo isso.
  if (store.sample_pricing_started_at) return { ok: true };

  const { error } = await supabase
    .from("stores")
    .update({ sample_pricing_started_at: new Date().toISOString() })
    .eq("id", store.id);

  return { ok: !error };
}
