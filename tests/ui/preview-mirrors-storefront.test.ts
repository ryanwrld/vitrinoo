import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A prévia do painel ("Assim fica o topo da sua vitrine", no card Identidade
 * visual) precisa mostrar a vitrine que EXISTE, não uma reconstrução dela.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * A primeira versão da prévia era um markup escrito à mão dentro do
 * `settings-form.tsx` — faixa chapada na cor da loja, logo centralizado, nome
 * e frase embaixo. Quando o cabeçalho da vitrine foi redesenhado (capa de
 * borda a borda, faixa branca, avatar à esquerda, selo, @, Instagram e a
 * linha de números), ninguém lembrou da prévia: o revendedor passou a
 * conferir a identidade visual numa tela que não correspondia mais a nada.
 * Uma divergência dessas não quebra teste nenhum e não gera erro — ela
 * simplesmente fica lá, silenciosa, até alguém reparar.
 *
 * O que se garante aqui é estrutural, e por isso resiste a mudanças de
 * layout: a prévia RENDERIZA o componente real, e a tela de Configurações
 * não voltou a ter uma cópia própria do cabeçalho.
 *
 * Lê os arquivos como texto, sem renderizar React — mesmo padrão de
 * tests/ui/dark-mode-contrast.test.ts e tests/middleware/matcher.test.ts.
 */

const ROOT = process.cwd();
const HERO = "src/app/[slug]/store-hero.tsx";
const PREVIEW = "src/app/admin/(painel)/configuracoes/vitrine-preview-dialog.tsx";
const SETTINGS_FORM = "src/app/admin/(painel)/configuracoes/settings-form.tsx";

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("prévia do topo da vitrine", () => {
  it("renderiza o StoreHero da rota pública, não uma cópia", () => {
    const preview = read(PREVIEW);

    expect(preview).toContain('from "@/app/[slug]/store-hero"');
    expect(preview).toContain("<StoreHero");
  });

  it("é o único lugar do painel que desenha o cabeçalho da vitrine", () => {
    const form = read(SETTINGS_FORM);

    // O formulário monta os DADOS da prévia (nome, capa, logo, cor, frase) e
    // delega o desenho. Se um dia ele voltar a montar a composição por conta
    // própria, estas marcas do cabeçalho reaparecem aqui — e é aí que a
    // divergência começa.
    expect(form).toContain("<VitrinePreviewDialog");
    expect(form).not.toContain("<StoreHero");
    expect(form).not.toMatch(/rounded-full[^"]*\bh-12\b[^"]*overflow-hidden/);
  });

  it("censura apenas o VALOR dos números, mantendo rótulo e ordem do original", () => {
    const hero = read(HERO);

    // Um caminho só monta `statItems`: `censorStats` entra nas MESMAS
    // condições e na renderização do valor, nunca numa segunda lista. Se
    // alguém reintroduzir um `statItems.push` exclusivo da prévia, o número de
    // rótulos deixa de bater.
    // Exatamente três `push`: um por número. Uma lista paralela para a prévia
    // (o erro original) aparece aqui como um quarto.
    expect(hero.match(/statItems\.push\(/g)).toHaveLength(3);
    expect(hero).toContain('stats.modelCount === 1 ? "modelo" : "modelos"');
    expect(hero).toContain('label: "a partir de"');
    expect(hero).toContain('label: "atualizados"');
    expect(hero).toContain("censorStats || stats.modelCount > 0");
    expect(hero).toContain("censorStats || stats.minPrice !== null");
    expect(hero).toContain("censorStats || freshness");
  });
});
