import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

/**
 * Converte um padrão de `config.matcher` do Next.js (sintaxe de path-to-regexp
 * simplificada, ex.: "/admin/dashboard", "/admin/produtos/:path*") em uma RegExp
 * equivalente, apenas para fins deste smoke test — não é o matcher real do
 * Next.js em produção, mas verifica que os padrões declarados cobrem
 * exatamente as rotas reais do painel admin e nada além delas (SC-7,
 * Armadilha 5 do 01-RESEARCH.md).
 *
 * O painel morava em route groups (`(admin)`, `(painel)`) que resolviam para
 * a RAIZ, e por isso o matcher precisou um dia listar cada rota à mão. Com a
 * vitrine pública ocupando a raiz (`/[slug]`), o painel passou a viver sob o
 * segmento real `/admin/*` e o matcher voltou a ser um prefixo único.
 *
 * O ponto crítico que este teste protege continua o mesmo, só que agora pelo
 * lado oposto: a vitrine pública NÃO pode ser coberta pelo middleware. Antes
 * ela estava a salvo por morar em `/loja/*`; hoje ela é a raiz inteira, então
 * o que a protege é o matcher ser um prefixo `/admin/` explícito. Se alguém
 * um dia trocar isso por um catch-all com allowlist interna, estes casos
 * quebram.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:path\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isCovered(pathname: string): boolean {
  return config.matcher.some((pattern: string) => patternToRegex(pattern).test(pathname));
}

describe("middleware config.matcher", () => {
  it("cobre todas as rotas reais do painel admin", () => {
    expect(isCovered("/admin/login")).toBe(true);
    expect(isCovered("/admin/cadastro")).toBe(true);
    expect(isCovered("/admin/esqueci-senha")).toBe(true);
    expect(isCovered("/admin/redefinir-senha")).toBe(true);
    expect(isCovered("/admin/onboarding")).toBe(true);
    expect(isCovered("/admin/dashboard")).toBe(true);
    expect(isCovered("/admin/dashboard/notificacoes")).toBe(true);
    expect(isCovered("/admin/produtos")).toBe(true);
    expect(isCovered("/admin/produtos/novo")).toBe(true);
    expect(isCovered("/admin/produtos/123/editar")).toBe(true);
    expect(isCovered("/admin/configuracoes")).toBe(true);
    expect(isCovered("/admin/configuracoes/loja")).toBe(true);
  });

  it("NÃO cobre a vitrine pública, que agora mora na raiz (/[slug])", () => {
    expect(isCovered("/loja-teste")).toBe(false);
    expect(isCovered("/loja-teste/produto-123")).toBe(false);
    // Um slug que por acaso comece com as letras de "admin" também precisa
    // ficar de fora: só o segmento inteiro `/admin/` é do painel.
    expect(isCovered("/administradora-de-chuteiras")).toBe(false);
  });

  it("NÃO cobre a home /", () => {
    expect(isCovered("/")).toBe(false);
  });

  it("cobre o callback de auth, que passou a viver sob /admin", () => {
    // `updateSession` só renova cookies de sessão — nunca redireciona nem
    // bloqueia — então rodar o middleware antes do `verifyOtp` do Route
    // Handler é inofensivo. Coberto por consequência do prefixo único, não
    // por uma exceção declarada.
    expect(isCovered("/admin/auth/confirm")).toBe(true);
  });
});
