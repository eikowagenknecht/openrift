import { describe, expect, it } from "vitest";

import { defaultVariantName } from "@/features/decks/components/deck-variant-create-dialog";

describe("defaultVariantName", () => {
  it("suffixes the source deck's name", () => {
    expect(defaultVariantName("Yasuo Aggro")).toBe("Yasuo Aggro (variant)");
  });

  it("suffixes a name that is already a variant, so the family keeps growing", () => {
    expect(defaultVariantName("Yasuo Aggro (variant)")).toBe("Yasuo Aggro (variant) (variant)");
  });

  it("leaves an empty name empty apart from the suffix", () => {
    expect(defaultVariantName("")).toBe(" (variant)");
  });
});
