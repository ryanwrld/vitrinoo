import { describe, it, expect, vi, afterEach } from "vitest";
import { copyText } from "@/lib/clipboard";

/**
 * `copyText` é uma fronteira pura, sem toast (T-02-11) — a UI decide como
 * reagir ao boolean retornado. Aqui só provamos o contrato: escreve o texto
 * EXATO e resolve true no sucesso, resolve false (sem lançar) na rejeição.
 */
describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("escreve o texto exato via navigator.clipboard.writeText e resolve true no sucesso", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const result = await copyText("https://vitrinoo.app/loja/minha-loja");

    expect(writeText).toHaveBeenCalledWith("https://vitrinoo.app/loja/minha-loja");
    expect(result).toBe(true);
  });

  it("resolve false (sem lançar) quando navigator.clipboard.writeText rejeita", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard indisponível"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const result = await copyText("https://vitrinoo.app/loja/minha-loja");

    expect(result).toBe(false);
  });
});
