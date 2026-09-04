import fs from "node:fs";
import { describe, expect, it } from "vitest";
// Script de curadoria em .mjs, sem tipos próprios: ele roda no Node do ingest, não no
// bundle do app. Tipá-lo exigiria arrastar o pipeline inteiro para o tsconfig.
import { classificarLancamento, geracoesAtuais } from "../../scripts/marketplace/lib-lancamento.mjs";

/**
 * Prova que "lançamento" saiu da heurística e virou dado de mercado.
 *
 * A régua ANTERIOR era `recente = terço superior por album_id` (ingest.mjs), e ela
 * respondia a pergunta errada: album_id diz quando o FORNECEDOR subiu a foto, não quando a
 * marca lançou o par. Um retrô fotografado ontem entrava como lançamento e levava +R$40 no
 * preço sugerido. Estes testes travam o comportamento novo — inclusive os casos em que a
 * resposta certa é NÃO MARCAR, que são a maioria e o ponto todo da mudança.
 */
describe("classificação de lançamento (dados reais de mercado)", () => {
  it("marca a geração atual da linha", () => {
    // Mercurial Vapor 17 / Superfly 11 — Nike, junho de 2026.
    expect(classificarLancamento("Mercurial 17 tecido Campo (FG)").lancamento).toBe(true);
    // Predator 26 — adidas, janeiro de 2026.
    expect(classificarLancamento("Predator 26 com aba Campo (FG)").lancamento).toBe(true);
  });

  it("trata .1/.2/+ como a MESMA geração", () => {
    // O acabamento (Elite/League/Club, ".1"/".2"/".3") não muda a geração — e sem isto a
    // Predator 26.1 ficaria de fora do adicional que o lojista definiu para a 26.
    for (const nome of ["Predator 26.1 Campo (FG)", "Predator 26.2 Society (TF)", "Predator 26+ Campo (FG)"]) {
      expect(classificarLancamento(nome).lancamento, nome).toBe(true);
    }
  });

  it("NÃO marca a geração anterior da mesma linha", () => {
    expect(classificarLancamento("Mercurial Vapor 16 cano baixo Campo (FG)").lancamento).toBe(false);
    expect(classificarLancamento("Predator 25+ Campo (FG)").lancamento).toBe(false);
    expect(classificarLancamento("Phantom GX II cano baixo Campo (FG)").lancamento).toBe(false);
  });

  it("NÃO marca a geração mais nova do ACERVO quando o mercado já a aposentou", () => {
    /*
      Este é o caso que separa dado real de heurística. A Puma Future 8 é a mais nova Future
      que o fornecedor tem, e qualquer régua interna ao acervo a chamaria de lançamento —
      mas a Future 9 saiu em julho de 2026. Cobrar adicional de lançamento por ela seria
      vender temporada passada como novidade.
    */
    expect(classificarLancamento("Puma Future 8 Campo (FG)").lancamento).toBe(false);
    expect(classificarLancamento("Puma Ultra 5 Campo (FG)").lancamento).toBe(false);
    // Idem F50: o acervo só tem a de 2024, e a Hyperfast é de maio de 2026.
    expect(classificarLancamento("F50 língua solta Campo (FG)").lancamento).toBe(false);
  });

  it("NÃO marca nome sem correspondência confiável, e diz o porquê", () => {
    // A adidas estava na Predator 26 em setembro de 2026 — "27" e "30" não existem. Ficam
    // fora até alguém olhar o par. O lado seguro do erro é não marcar: cobrar adicional de
    // lançamento por uma chuteira velha queima o cliente do lojista.
    const p27 = classificarLancamento("Predator 27 com aba Campo (FG)");
    expect(p27.lancamento).toBe(false);
    expect(p27.motivo).toMatch(/^confirmar:/);

    // A pendência tem que VENCER o padrão genérico da linha: sem a checagem de `confirmar`
    // vindo antes, "Predator 27" casaria com nada e "Predator 30" idem — mas um nome
    // pendente que colidisse com um padrão conhecido entraria como geração de verdade.
    expect(p27.linha).toBeNull();
  });

  it("resolve 'Phantom GX III' como a Phantom 6 (confirmado pelo dono)", () => {
    /*
      A Nike foi GX (2023) -> GX II (2024) -> Phantom 6 (2025-12); "GX III" é o nome que o
      FORNECEDOR usa. São 101 dos 990 — 10% do pacote — e ficavam fora do lançamento até o
      dono do produto conferir o par em 2026-09-01. Este teste é o que impede a
      identificação de se perder num refactor da tabela.
    */
    const r = classificarLancamento("Phantom GX III cano baixo em malha Campo (FG)");
    expect(r.lancamento).toBe(true);
    expect(r.linha).toBe("Phantom");
    expect(r.ger).toBe("6");

    // E a GX II continua sendo a geração anterior, não pode ter sido arrastada junto.
    expect(classificarLancamento("Phantom GX II cano baixo Campo (FG)").lancamento).toBe(false);
    // A GX sem número também não: o padrão da 6 casa "GX III"/"GX 3", nunca "GX" sozinho.
    expect(classificarLancamento("Phantom GX cano alto Campo (FG)").lancamento).toBe(false);
  });

  it("NÃO marca linha descontinuada nem linha sem ciclo de geração", () => {
    expect(classificarLancamento("Mercurial Vapor 1 Campo (FG)").motivo).toBe("linha descontinuada");
    expect(classificarLancamento("Joma Top Flex Ultimate Futsal (IC)").motivo).toBe(
      "linha sem ciclo de geração",
    );
    expect(classificarLancamento("Puma King Campo (FG)").lancamento).toBe(false);
  });

  it("NÃO marca nome que a tabela não conhece", () => {
    const r = classificarLancamento("Chuteira genérica sem linha (FG)");
    expect(r.lancamento).toBe(false);
    expect(r.motivo).toBe("sem correspondência na tabela");
  });

  it("devolve data de lançamento no formato que a coluna `date` aceita", () => {
    const r = classificarLancamento("Mercurial 17 tecido Campo (FG)");
    expect(r.data).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("elege UMA geração atual por linha, sem empate", () => {
    /*
      Empate de data dentro de uma linha faria "quem é a atual" virar ordem de array em vez
      de decisão — e a linha inteira perderia ou ganharia o adicional dependendo de onde a
      entrada foi parar no JSON. A conferência é contra a tabela, não contra o texto
      formatado: "Puma Future" e "Puma Ultra" são linhas diferentes que começam igual.
    */
    const tabela = JSON.parse(
      fs.readFileSync("scripts/marketplace/lancamentos.json", "utf8"),
    ) as { linhas: Array<{ linha: string; data?: string }> };

    const comData = tabela.linhas.filter((e) => e.data);
    const linhasComData = new Set(comData.map((e) => e.linha));

    expect(geracoesAtuais()).toHaveLength(linhasComData.size);

    for (const linha of linhasComData) {
      const datas = comData.filter((e) => e.linha === linha).map((e) => e.data!);
      const maior = datas.reduce((a, b) => (a > b ? a : b));
      expect(datas.filter((d) => d === maior), `empate em ${linha}`).toHaveLength(1);
    }
  });
});
