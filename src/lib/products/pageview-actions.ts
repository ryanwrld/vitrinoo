"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server Action PÚBLICA/ANÔNIMA — arquivo deliberadamente SEPARADO de
 * src/lib/products/actions.ts (owner-scoped, autenticado), mesma disciplina
 * de order-clicks-actions.ts (05) e public-actions.ts (04). NUNCA importar/
 * chamar getOwnedStore() neste arquivo.
 *
 * `logPageview` registra um acesso à vitrine pública (grid = product_id
 * null, detalhe = product_id) de forma fire-and-forget: try/catch que só
 * loga via console.error, NUNCA lança — quem chama (pageview-tracker.tsx)
 * dispara isto dentro de um startTransition sem nunca esperar o resultado,
 * e a navegação nunca é atrasada por esta chamada.
 *
 * Insert BARE (sem encadear select ou single) — o papel `anon` não tem
 * nenhuma policy de leitura em `pageviews` (mesmo Pitfall 2 de
 * 05-RESEARCH.md); encadear uma leitura pós-insert faria um insert
 * bem-sucedido parecer uma falha. Só o `error` do insert é inspecionado.
 */

/** Violação de índice único no Postgres. Aqui NÃO é falha: é a deduplicação
 *  por visitante/dia da migration 0010 fazendo exatamente o seu trabalho. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Data civil brasileira, calculada SEMPRE no servidor. Nunca aceitar esta
 * data do cliente: relógio de visitante é desregulado e manipulável, e ela
 * é metade da chave de deduplicação. `en-CA` é usado só porque formata como
 * `YYYY-MM-DD`, que é o literal que o Postgres espera para `date`.
 */
function currentViewDateBR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function logPageview(
  storeId: string,
  productId: string | null,
  visitorId: string,
): Promise<void> {
  try {
    // Um visitorId ausente/malformado (localStorage bloqueado, storage cheio,
    // navegador exótico) NÃO pode custar a visita inteira: cai num id novo a
    // cada acesso, ou seja, degrada exatamente pro comportamento antigo de
    // contar toda vez — só nesse caso de borda, em vez de sempre.
    const visitor = UUID_PATTERN.test(visitorId) ? visitorId : crypto.randomUUID();

    const supabase = await createClient();
    const { error } = await supabase.from("pageviews").insert({
      store_id: storeId,
      product_id: productId,
      visitor_id: visitor,
      view_date: currentViewDateBR(),
    });

    // Duplicata = este visitante já foi contado neste produto hoje. É o
    // caminho ESPERADO em toda atualização de página / ida-e-volta entre
    // grid e produto, então não vira ruído no log.
    if (error && error.code !== PG_UNIQUE_VIOLATION) {
      console.error("logPageview: insert falhou", error);
    }
  } catch (err) {
    console.error("logPageview: erro inesperado", err);
  }
}
