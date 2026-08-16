import { describe, it, expect } from "vitest";
import { slugSchema, type SlugInput } from "@/lib/slug/validation";

describe("slugSchema", () => {
  it("rejects a slug under 3 chars", () => {
    const result = slugSchema.safeParse("ab");
    expect(result.success).toBe(false);
  });

  it("rejects a slug over 30 chars", () => {
    const result = slugSchema.safeParse("a".repeat(31));
    expect(result.success).toBe(false);
  });

  it("accepts a 3-char slug", () => {
    const result = slugSchema.safeParse("abc");
    expect(result.success).toBe(true);
  });

  it("accepts a 30-char slug", () => {
    const result = slugSchema.safeParse("a".repeat(30));
    expect(result.success).toBe(true);
  });

  it("rejects uppercase characters", () => {
    const result = slugSchema.safeParse("Minha-Loja");
    expect(result.success).toBe(false);
  });

  it("rejects spaces", () => {
    const result = slugSchema.safeParse("minha loja");
    expect(result.success).toBe(false);
  });

  it("rejects accented characters", () => {
    const result = slugSchema.safeParse("cafecomacentoa");
    expect(slugSchema.safeParse("café-loja").success).toBe(false);
    expect(result.success).toBe(true);
  });

  it("rejects hyphens", () => {
    const result = slugSchema.safeParse("minha-loja");
    expect(result.success).toBe(false);
  });

  it("rejects underscore and other symbols", () => {
    const result = slugSchema.safeParse("minha_loja");
    expect(result.success).toBe(false);
  });

  it("returns the invalid-format message for a bad-charset slug", () => {
    const result = slugSchema.safeParse("Minha Loja!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Use apenas letras e números (3 a 30 caracteres)."
      );
    }
  });

  it("rejects a slug starting with a hyphen", () => {
    const result = slugSchema.safeParse("-minha-loja");
    expect(result.success).toBe(false);
  });

  it("rejects a slug ending with a hyphen", () => {
    const result = slugSchema.safeParse("minha-loja-");
    expect(result.success).toBe(false);
  });

  it("exports SlugInput as a string type", () => {
    const value: SlugInput = "minha-loja";
    expect(typeof value).toBe("string");
  });
});
