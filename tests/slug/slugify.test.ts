import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug/slugify";

describe("slugify", () => {
  it("folds diacritics, concatenates words (no separator), lowercase", () => {
    expect(slugify("Sapatênis São Paulo")).toBe("sapatenissaopaulo");
  });

  it("folds diacritics without dropping letters (D-01 'sem acento')", () => {
    expect(slugify("café")).toBe("cafe");
  });

  it("strips symbols and concatenates surrounding words", () => {
    expect(slugify("  --Nike__Air!!  ")).toBe("nikeair");
  });

  it("folds multiple accented vowels/consonants in the same string", () => {
    expect(slugify("Ção Ótimo")).toBe("caootimo");
  });

  it("never produces a hyphen, regardless of input separators", () => {
    expect(slugify("Chuteiras SP - Original")).toBe("chuteirassporiginal");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});
