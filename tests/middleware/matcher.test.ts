import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

/**
 * Converte um padrão de `config.matcher` do Next.js (sintaxe de path-to-regexp
 * simplificada, ex.: "/dashboard", "/produtos/:path*") em uma RegExp
 * equivalente, apenas para fins deste smoke test — não é o matcher real do
 * Next.js em produção, mas verifica que os padrões declarados cobrem
 * exatamente as rotas reais do painel admin e nada além delas (SC-7,
 * Armadilha 5 do 01-RESEARCH.md).
 *
 * O matcher NUNCA foi `['/admin/:path*']` de fato em produção: o painel
 * inteiro vive em route groups (`(admin)`, `(painel)`), que o Next.js
 * resolve para caminhos na raiz — nenhuma URL do projeto começa com
 * `/admin/`. A versão anterior deste teste fixava essa premissa errada
 * (asserção literal `toEqual(["/admin/:path*"])` + "`/login` NÃO coberto"),
 * mascarando o bug em vez de pegá-lo: o middleware de refresh de sessão
 * nunca rodava em nenhuma página real.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:path\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isCovered(pathname: string): boolean {
  return config.matcher.some((pattern) => patternToRegex(pattern).test(pathname));
}

describe("middleware config.matcher", () => {
  it("cobre todas as rotas reais do painel admin", () => {
    expect(isCovered("/login")).toBe(true);
    expect(isCovered("/cadastro")).toBe(true);
    expect(isCovered("/esqueci-senha")).toBe(true);
    expect(isCovered("/redefinir-senha")).toBe(true);
    expect(isCovered("/onboarding")).toBe(true);
    expect(isCovered("/dashboard")).toBe(true);
    expect(isCovered("/dashboard/notificacoes")).toBe(true);
    expect(isCovered("/produtos")).toBe(true);
    expect(isCovered("/produtos/novo")).toBe(true);
    expect(isCovered("/produtos/123/editar")).toBe(true);
    expect(isCovered("/configuracoes")).toBe(true);
    expect(isCovered("/configuracoes/loja")).toBe(true);
  });

  it("NÃO cobre a vitrine pública /loja/[slug]", () => {
    expect(isCovered("/loja/loja-teste")).toBe(false);
    expect(isCovered("/loja/loja-teste/produto-123")).toBe(false);
  });

  it("NÃO cobre a home /", () => {
    expect(isCovered("/")).toBe(false);
  });

  it("NÃO cobre a rota de callback de auth /auth/confirm", () => {
    expect(isCovered("/auth/confirm")).toBe(false);
  });
});
