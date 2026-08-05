import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Único ponto de entrada de middleware do projeto. Escopo estritamente
 * limitado às rotas reais do painel admin, listadas explicitamente no
 * matcher — NUNCA um matcher catch-all com allowlist/denylist interna em
 * código (Antipadrão #1 do 01-RESEARCH.md; CVE-2025-29927 é o precedente).
 *
 * Historicamente o painel resolvia para caminhos na RAIZ (`/dashboard`,
 * `/produtos`, ...) por viver em route groups, e o matcher precisava listar
 * cada rota uma a uma. Desde que a vitrine pública passou a ocupar a raiz
 * (`/[slug]`, para encurtar o link que o cliente final digita), o painel
 * inteiro mora sob o segmento real `/admin/*` — o que torna o matcher um
 * único prefixo em vez de uma lista que precisava ser atualizada à mão a
 * cada rota nova (e que silenciosamente deixava a rota sem refresh de
 * sessão quando alguém esquecia).
 *
 * A vitrine pública `/[slug]` continua inalcançável por este middleware por
 * CONSTRUÇÃO: ela não começa com `/admin/`, e o matcher é um prefixo
 * explícito — nunca um catch-all com allowlist interna (Antipadrão #1 do
 * 01-RESEARCH.md; CVE-2025-29927 é o precedente).
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
