import { describe, it, expect, vi, beforeEach } from "vitest";

const checkSlugAvailability = vi.fn();

vi.mock("@/lib/settings/actions", () => ({
  checkSlugAvailability: (...args: unknown[]) => checkSlugAvailability(...args),
}));

import { resolveAvailableSlug } from "@/lib/slug/resolve-available";

describe("resolveAvailableSlug", () => {
  beforeEach(() => {
    checkSlugAvailability.mockReset();
  });

  it("retorna a base quando ela já está livre", async () => {
    checkSlugAvailability.mockResolvedValueOnce({ available: true });

    const result = await resolveAvailableSlug("rlesportes");

    expect(result).toBe("rlesportes");
    expect(checkSlugAvailability).toHaveBeenCalledTimes(1);
    expect(checkSlugAvailability).toHaveBeenCalledWith("rlesportes");
  });

  it("incrementa numericamente (sem hifen) até achar uma livre", async () => {
    checkSlugAvailability
      .mockResolvedValueOnce({ available: false })
      .mockResolvedValueOnce({ available: false })
      .mockResolvedValueOnce({ available: true });

    const result = await resolveAvailableSlug("rlesportes");

    expect(result).toBe("rlesportes3");
    expect(checkSlugAvailability).toHaveBeenNthCalledWith(1, "rlesportes");
    expect(checkSlugAvailability).toHaveBeenNthCalledWith(2, "rlesportes2");
    expect(checkSlugAvailability).toHaveBeenNthCalledWith(3, "rlesportes3");
  });

  it("retorna null ao esgotar as tentativas", async () => {
    checkSlugAvailability.mockResolvedValue({ available: false });

    const result = await resolveAvailableSlug("rlesportes", 3);

    expect(result).toBeNull();
    expect(checkSlugAvailability).toHaveBeenCalledTimes(3);
  });
});
