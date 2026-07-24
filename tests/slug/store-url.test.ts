import { describe, it, expect, afterEach, vi } from "vitest";
import { buildStoreUrl } from "@/lib/slug/store-url";

describe("buildStoreUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the default origin + /loja/<slug> when NEXT_PUBLIC_SITE_URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(buildStoreUrl("minha-loja")).toBe("https://vitrinoo.app/loja/minha-loja");
  });

  it("trims a trailing slash from the configured base so the result never contains '//loja'", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://vitrinoo.app/");
    expect(buildStoreUrl("minha-loja")).toBe("https://vitrinoo.app/loja/minha-loja");
    expect(buildStoreUrl("minha-loja")).not.toContain("//loja");
  });

  it("uses a custom configured base when set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemplo.com.br");
    expect(buildStoreUrl("outra-loja")).toBe("https://exemplo.com.br/loja/outra-loja");
  });
});
