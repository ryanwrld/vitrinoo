import { describe, expect, it } from "vitest";
import {
  TIPOS_DE_SOLADO,
  TIPO_POR_SOLADO,
  expandirParaSolados,
  colapsarParaTipos,
  passosDoProcessamento,
  tiposComModelo,
  type ContagemPorTipo,
} from "@/lib/marketplace/precificacao";
import { SOLES } from "@/lib/products/constants";

/**
 * O contrato entre o que o lojista vê (CINCO tipos) e o que o banco guarda (SEIS siglas).
 *
 * A interface junta AG e MG num item só — MG é como a Puma chama grama sintética, e pedir
 * dois preços para a mesma coisa faria o lojista parar para descobrir uma diferença que não
 * existe. Mas o SQL da importação casa por sigla (`p_precos->>mp.sole`), então as duas
 * precisam sair daqui com o mesmo número. Se esta tradução quebrar, um solado inteiro
 * entra com `suggested_price` — o preço da curadoria — sem ninguém perceber.
 */
describe("tradução entre tipo da interface e sigla do banco", () => {
  it("cobre todos os solados de `SOLES`, sem sobra nem falta", () => {
    // Uma sigla fora de qualquer tipo nunca receberia preço e cairia silenciosamente no
    // `suggested_price`. Uma sigla em dois tipos receberia dois preços diferentes.
    const cobertas = TIPOS_DE_SOLADO.flatMap((t) => t.solados);
    expect([...cobertas].sort()).toEqual([...SOLES].sort());
    expect(new Set(cobertas).size).toBe(cobertas.length);
  });

  it("expande Multigramados para AG e MG com o MESMO valor", () => {
    const saida = expandirParaSolados({ fg: 430, sg: 520, ic: 300, tf: 380, ag: 390 });
    expect(saida.AG).toBe(390);
    expect(saida.MG).toBe(390);
    expect(saida.FG).toBe(430);
    expect(saida.SG).toBe(520);
  });

  it("ignora tipo sem valor em vez de gravar zero", () => {
    // Zero gravado viraria produto a R$ 0,00 na vitrine. Ausente cai no `coalesce` do RPC,
    // que usa o preço sugerido — errado, mas nunca de graça.
    const saida = expandirParaSolados({ fg: 430, sg: 0, ic: Number.NaN });
    expect(saida).toEqual({ FG: 430 });
  });

  it("volta de sigla para tipo, para reabrir o formulário pré-preenchido", () => {
    const original = { fg: 430, sg: 520, ic: 300, tf: 380, ag: 390 };
    expect(colapsarParaTipos(expandirParaSolados(original))).toEqual(original);
  });

  it("aceita registro antigo que só tenha AG ou só MG", () => {
    // Robustez para regra gravada antes de a fusão existir: ler qualquer uma das duas dá no
    // mesmo, e a primeira que existir manda.
    expect(colapsarParaTipos({ MG: 350 }).ag).toBe(350);
    expect(colapsarParaTipos({ AG: 350 }).ag).toBe(350);
  });

  it("mapeia cada sigla para o tipo que a mostra", () => {
    expect(TIPO_POR_SOLADO.get("AG")).toBe("ag");
    expect(TIPO_POR_SOLADO.get("MG")).toBe("ag");
    expect(TIPO_POR_SOLADO.get("FG")).toBe("fg");
    expect(TIPO_POR_SOLADO.get("XX")).toBeUndefined();
  });
});

/**
 * Qual tipo entra na tela de preços.
 *
 * A tela pergunta um preço por tipo e trava o "Continuar" enquanto faltar algum. Um tipo com
 * zero par nessa lista vira uma pergunta sem resposta possível: quem tira dez chuteiras sem
 * nenhuma society não tem número para dar, e ficava preso na etapa 1. O tipo volta sozinho
 * quando ele comprar o pacote — aí com os pares que justificam a pergunta.
 */
describe("quais tipos a tela de preços mostra", () => {
  const contagens = (porId: Partial<Record<string, number>>): ContagemPorTipo[] =>
    TIPOS_DE_SOLADO.map((t) => ({ id: t.id, total: porId[t.id] ?? 0, lancamentos: 0 }));

  it("esconde o tipo sem nenhum par", () => {
    const tipos = tiposComModelo(contagens({ fg: 2, ic: 3 }));
    expect(tipos.map((t) => t.id)).toEqual(["fg", "ic"]);
  });

  it("mostra os cinco quando a leva tem todos", () => {
    const tipos = tiposComModelo(contagens({ fg: 2, sg: 1, ic: 2, tf: 3, ag: 2 }));
    expect(tipos).toHaveLength(TIPOS_DE_SOLADO.length);
  });

  it("preserva a ordem do mockup, e não a ordem das contagens", () => {
    const tipos = tiposComModelo(contagens({ ag: 1, fg: 1, tf: 1 }));
    expect(tipos.map((t) => t.id)).toEqual(["fg", "tf", "ag"]);
  });

  it("cai nos cinco quando NENHUM tipo tem par", () => {
    // Conjunto sem solado reconhecível (sigla nova no acervo). Uma etapa 1 sem campo nenhum
    // travaria um fluxo que é obrigatório — sem X, sem Esc, sem clique fora.
    expect(tiposComModelo(contagens({}))).toHaveLength(TIPOS_DE_SOLADO.length);
  });
});

/**
 * O roteiro da tela de processamento.
 *
 * As frases devolvem ao lojista as decisões que ele acabou de tomar. Quando a leva não tem
 * lançamento, a etapa do adicional nem aparece — e uma frase dizendo "Aplicando o adicional
 * nos lançamentos" contaria uma tela que ele nunca viu, sobre pares que não existem.
 */
describe("frases do processamento", () => {
  it("não cita lançamento quando a leva não tem nenhum", () => {
    const { passos } = passosDoProcessamento(false);
    expect(passos.join(" ").toLowerCase()).not.toMatch(/lançamento|adicional/);
  });

  it("mantém as três frases no caminho normal", () => {
    const { passos } = passosDoProcessamento(true);
    expect(passos).toHaveLength(3);
    expect(passos.join(" ")).toContain("adicional");
  });

  for (const temLancamento of [true, false]) {
    it(`tem um tempo por frase, com lançamento=${temLancamento}`, () => {
      // Descasar as duas listas trava o teatro: `passoMs[passo]` viria `undefined` e o
      // `setTimeout` da última troca dispararia na hora, cortando a frase.
      const { passos, passoMs } = passosDoProcessamento(temLancamento);
      expect(passoMs).toHaveLength(passos.length);
      expect(passoMs.every((ms) => ms > 0)).toBe(true);
    });

    it(`o piso da espera é a soma das frases, com lançamento=${temLancamento}`, () => {
      // Piso MAIOR que as frases deixa a última parada na tela depois de a importação ter
      // acabado; piso MENOR corta a última no meio.
      const { passoMs, msTeatro } = passosDoProcessamento(temLancamento);
      expect(msTeatro).toBe(passoMs.reduce((a, b) => a + b, 0));
    });
  }
});
