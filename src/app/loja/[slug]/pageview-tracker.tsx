"use client";

import { startTransition, useEffect } from "react";
import { usePathname } from "next/navigation";
import { logPageview } from "@/lib/products/pageview-actions";

/**
 * Chave do identificador anônimo de visitante no `localStorage`.
 * `localStorage` e não `sessionStorage` de propósito: sessionStorage morre
 * ao fechar a aba, então abrir a vitrine numa aba nova (comportamento
 * corriqueiro de quem recebe o link no WhatsApp) já valeria como pessoa
 * nova — justamente a contagem inflada que a migration 0010 corrige.
 */
const VISITOR_ID_KEY = "vitrinoo:visitor-id";

/**
 * Identidade anônima e estável do visitante. É um UUID SORTEADO: não deriva
 * de e-mail, telefone, IP nem de fingerprint do aparelho — não identifica
 * pessoa alguma, só permite dizer "estas duas visitas vieram do mesmo
 * navegador", que é o mínimo necessário pra não contar a mesma pessoa
 * várias vezes no mesmo dia.
 *
 * Todo acesso ao storage é protegido: navegador em modo restrito, storage
 * bloqueado ou cota estourada fazem `localStorage` LANÇAR, e uma exceção
 * aqui derrubaria o efeito inteiro — a visita não seria contada. No pior
 * caso devolvemos um id efêmero: a visita continua registrada, só não
 * deduplicada (mesmo comportamento que o sistema tinha antes).
 */
/**
 * UUID v4 que funciona em CONTEXTO INSEGURO (http:// num IP de rede local).
 *
 * `crypto.randomUUID()` é restrito a contexto seguro (https/localhost) — em
 * `http://192.168.x.x:3000`, cenário real de testar a vitrine no celular da
 * mesma Wi-Fi, ele simplesmente não existe. A versão anterior desta função
 * chamava `crypto.randomUUID()` no try E no catch: o catch lançava de novo, a
 * exceção escapava e derrubava o efeito inteiro — nenhuma visita era
 * registrada. Mesma pegadinha de contexto seguro que já apareceu no botão de
 * compartilhar (Web Share API).
 *
 * `crypto.getRandomValues` NÃO tem essa restrição, então é a primeira
 * alternativa; `Math.random` fecha como último recurso (aqui só precisamos de
 * unicidade prática por navegador, não de aleatoriedade criptográfica).
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

function resolveVisitorId(): string {
  const generated = randomUuid();
  try {
    const stored = window.localStorage.getItem(VISITOR_ID_KEY);
    if (stored) return stored;

    window.localStorage.setItem(VISITOR_ID_KEY, generated);
    return generated;
  } catch {
    // Storage bloqueado/cheio: devolve um id efêmero em vez de propagar a
    // exceção. A visita continua sendo contada, só não deduplicada.
    return generated;
  }
}

/**
 * Tracker invisível montado uma única vez por `layout.tsx` da vitrine
 * (nunca em `page.tsx` — `page.tsx` recebe `searchParams` e remontaria a
 * cada troca de filtro, violando D-02). Mesmo formato de `SessionWatcher`
 * (`useEffect` + `return null`), mas reagindo a `usePathname()` em vez de
 * `onAuthStateChange`.
 *
 * A dependência do efeito é deliberadamente `pathname`, NUNCA
 * `searchParams` — `usePathname()` exclui a query string por definição, o
 * que garante que trocar um filtro/termo de busca (mesma pathname, query
 * diferente) não dispara um novo pageview (D-02). Só uma navegação real
 * (grid → detalhe, ou detalhe de um produto → outro) muda `pathname`.
 *
 * Disparo em `useEffect` (client-side), nunca no corpo de um Server
 * Component: crawlers de unfurling (WhatsApp/Facebook) fazem GET real na
 * página para gerar o preview de Open Graph, mas não executam JavaScript
 * do cliente — nunca chegam a montar este componente, então nunca inflam
 * a contagem (Pitfall 2 do 06-RESEARCH.md).
 *
 * Repetição (atualizar a página, ir e voltar entre grid e produto) NÃO é
 * filtrada aqui: este componente sempre dispara, e quem descarta a
 * duplicata é o índice único de (visitante, produto, dia) da migration
 * 0010. Filtrar no cliente seria frágil (basta limpar o storage) e
 * espalharia a regra de contagem por duas camadas — o banco é a única
 * fonte de verdade sobre o que conta como visualização.
 */
export function PageviewTracker({ storeId }: { storeId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    // pathname: "/loja/{slug}" (grid, D-01, product_id null) ou
    // "/loja/{slug}/{produto}" (detalhe, product_id presente).
    const segments = pathname.split("/").filter(Boolean); // ["loja", slug, produto?]
    const productId = segments.length >= 3 ? segments[2] : null;
    const visitorId = resolveVisitorId();

    startTransition(() => {
      logPageview(storeId, productId, visitorId).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
