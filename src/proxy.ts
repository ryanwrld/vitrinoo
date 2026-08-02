import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Único ponto de entrada de middleware do projeto. Escopo estritamente
 * limitado às rotas reais do painel admin, listadas explicitamente no
 * matcher — NUNCA um matcher catch-all com allowlist/denylist interna em
 * código (Antipadrão #1 do 01-RESEARCH.md; CVE-2025-29927 é o precedente).
 *
 * `/admin/:path*` (valor original) NUNCA bateu com nenhuma rota real: o
 * painel inteiro vive em route groups (`(admin)`, `(painel)`), que o
 * Next.js resolve para caminhos na raiz (`/login`, `/dashboard`,
 * `/produtos`, ...) — nenhuma URL do projeto começa com `/admin/`. Na
 * prática isso fazia o refresh de sessão de `updateSession()` nunca
 * rodar, apesar de `src/lib/supabase/server.ts` assumir (no comentário do
 * `setAll`) que ele sempre roda — sessões podiam expirar em silêncio.
 *
 * A rota pública `/loja/[slug]` (e qualquer outra fora desta lista) deve
 * ser inalcançável por este middleware por construção, não por exceção.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/login",
    "/cadastro",
    "/esqueci-senha",
    "/redefinir-senha",
    "/onboarding",
    "/dashboard",
    "/dashboard/:path*",
    "/produtos",
    "/produtos/:path*",
    "/configuracoes",
    "/configuracoes/:path*",
  ],
};
