import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Teste estático de regressão para o gap de contraste em dark mode (UAT M-4 +
 * achado bônus): o boilerplate do create-next-app inverte --background/--foreground
 * via @media (prefers-color-scheme: dark). O projeto TEM dark mode, mas
 * restrito ao painel admin autenticado ((painel)/layout.tsx e telas
 * dashboard/produtos/configurações, via next-themes + `.admin-scope` em
 * globals.css) — as telas de auth/onboarding ficam de fora do escopo e devem
 * seguir forçando fundo claro explícito. Lê os arquivos de fonte como string
 * (mesmo padrão de tests/middleware/matcher.test.ts) — não renderiza React.
 *
 * ATUALIZADO em 2026-08-03: a asserção original varria um `<main>` em cada uma
 * das 5 páginas procurando `bg-white`, e passou a falhar quando (a) as 4 telas
 * de auth foram unificadas sob o componente `AuthLayout` — deixando de ter
 * `<main>` próprio — e (b) o onboarding trocou `bg-white` por
 * `bg-dot-pattern` (que também é fundo claro: `background-color: #F7F8FB`).
 * O teste foi reescrito para a estrutura atual SEM afrouxar a garantia: em vez
 * de aceitar "sem fundo declarado, herda do body", o `AuthLayout` passou a
 * declarar `bg-white` explicitamente e é isso que se verifica aqui.
 */

/** As 4 telas de auth não têm mais `<main>` próprio: todas passam por AuthLayout. */
const AUTH_PAGES = [
  "src/app/admin/cadastro/page.tsx",
  "src/app/admin/login/page.tsx",
  "src/app/admin/esqueci-senha/page.tsx",
  "src/app/admin/redefinir-senha/page.tsx",
];

const AUTH_LAYOUT = "src/components/auth-layout.tsx";
const ONBOARDING = "src/app/admin/onboarding/onboarding-wizard.tsx";

/** Fundos claros aceitos como declaração EXPLÍCITA (nunca herança do body). */
const EXPLICIT_LIGHT_BG = /\b(bg-white|bg-dot-pattern|bg-gray-50)\b/;

function readSource(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

function mainClassName(rel: string): string {
  const source = readSource(rel);
  const match = source.match(/<main[^>]*className="([^"]*)"/);
  expect(match, `${rel}: nenhum <main className="..."> encontrado`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("dark mode contrast regression", () => {
  it("globals.css força color-scheme: light", () => {
    const css = readSource("src/app/globals.css");
    expect(css).toMatch(/color-scheme:\s*light/);
  });

  it("globals.css NÃO reintroduz o flip de esquema escuro do boilerplate", () => {
    const css = readSource("src/app/globals.css");
    expect(css).not.toMatch(/@media[^{]*prefers-color-scheme:\s*dark/);
  });

  it.each(AUTH_PAGES)(
    "%s: renderiza através do AuthLayout (nunca um shell próprio que escape da garantia de fundo)",
    (rel) => {
      expect(readSource(rel)).toMatch(/\bAuthLayout\b/);
    },
  );

  it("AuthLayout: <main> declara fundo claro explícito (vale pelas 4 telas de auth)", () => {
    expect(mainClassName(AUTH_LAYOUT)).toMatch(EXPLICIT_LIGHT_BG);
  });

  it("onboarding-wizard: <main> declara fundo claro explícito", () => {
    expect(mainClassName(ONBOARDING)).toMatch(EXPLICIT_LIGHT_BG);
  });

  it.each([...AUTH_PAGES, AUTH_LAYOUT, ONBOARDING])(
    "%s: nenhuma classe dark: (fora do escopo .admin-scope, seria inerte e enganosa)",
    (rel) => {
      expect(readSource(rel)).not.toMatch(/\bdark:/);
    },
  );

  it("dark: só ativa dentro de .admin-scope (custom variant escopado, não .dark solto)", () => {
    const css = readSource("src/app/globals.css");
    expect(css).toMatch(/@custom-variant dark \(&:where\(\.dark \.admin-scope, \.dark \.admin-scope \*\)\)/);
  });

  it("(painel)/layout.tsx declara o wrapper .admin-scope", () => {
    const source = readSource("src/app/admin/(painel)/layout.tsx");
    expect(source).toMatch(/\badmin-scope\b/);
  });
});
