import { describe, it, expect, afterEach, vi } from "vitest";
import { buildStoreUrl } from "@/lib/slug/store-url";

describe("buildStoreUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("põe o slug na RAIZ, sem o antigo prefixo /loja", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(buildStoreUrl("minha-loja")).toBe("https://vitrinoo.app/minha-loja");
    // O prefixo antigo não pode voltar por descuido: ele é o segmento a mais
    // que o cliente final teria que digitar/ditar.
    expect(buildStoreUrl("minha-loja")).not.toContain("/loja/");
  });

  it("remove a barra final da base pra nunca gerar barra dupla", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://vitrinoo.app/");
    expect(buildStoreUrl("minha-loja")).toBe("https://vitrinoo.app/minha-loja");
    expect(buildStoreUrl("minha-loja")).not.toContain("app//");
  });

  it("usa a base configurada quando existe", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemplo.com.br");
    expect(buildStoreUrl("outra-loja")).toBe("https://exemplo.com.br/outra-loja");
  });
});
