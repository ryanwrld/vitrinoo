/**
 * Chave do identificador anônimo de visitante no `localStorage`.
 * `localStorage` e não `sessionStorage` de propósito: sessionStorage morre
 * ao fechar a aba, então abrir a vitrine numa aba nova (comportamento
 * corriqueiro de quem recebe o link no WhatsApp) já valeria como pessoa
 * nova — justamente a contagem inflada que a migration 0010 corrige.
 */
const VISITOR_ID_KEY = "vitrinoo:visitor-id";

/**
 * UUID v4 que funciona em CONTEXTO INSEGURO (http:// num IP de rede local).
 *
 * `crypto.randomUUID()` é restrito a contexto seguro (https/localhost) — em
 * `http://192.168.x.x:3000`, cenário real de testar a vitrine no celular da
 * mesma Wi-Fi, ele simplesmente não existe. Uma versão anterior chamava
 * `crypto.randomUUID()` no try E no catch: o catch lançava de novo, a
 * exceção escapava e derrubava o efeito inteiro — nenhuma visita era
 * registrada. Mesma pegadinha de contexto seguro que já apareceu no botão
 * de compartilhar (Web Share API).
 *
 * `crypto.getRandomValues` NÃO tem essa restrição, então é a primeira
 * alternativa; `Math.random` fecha como último recurso (aqui só precisamos
 * de unicidade prática por navegador, não de aleatoriedade criptográfica).
 */
function randomUuid(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;

  if (typeof c?.randomUUID === "function") return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Identidade anônima e estável do visitante. É um UUID SORTEADO: não deriva
 * de e-mail, telefone, IP nem de fingerprint do aparelho — não identifica
 * pessoa alguma, só permite dizer "estas duas visitas vieram do mesmo
 * navegador", que é o mínimo necessário pra não contar a mesma pessoa
 * várias vezes no mesmo dia.
 *
 * Todo acesso ao storage é protegido: navegador em modo restrito, storage
 * bloqueado ou cota estourada fazem `localStorage` LANÇAR, e uma exceção
 * aqui derrubaria o efeito chamador — a visita não seria contada. No pior
 * caso devolvemos um id efêmero: a visita continua registrada, só não
 * deduplicada (mesmo comportamento que o sistema tinha antes).
 *
 * Compartilhado entre `pageview-tracker.tsx` (visita à loja) e
 * `product-view-tracker.tsx` (visita a um produto) — os dois precisam do
 * MESMO id para o índice único (visitante, produto, dia) da migration 0010
 * funcionar; duas cópias da função gerariam ids independentes e a
 * deduplicação silenciosamente pararia de valer.
 */
export function resolveVisitorId(): string {
  const generated = randomUuid();
  try {
    const stored = window.localStorage.getItem(VISITOR_ID_KEY);
    if (stored) return stored;

    window.localStorage.setItem(VISITOR_ID_KEY, generated);
    return generated;
  } catch {
    return generated;
  }
}
