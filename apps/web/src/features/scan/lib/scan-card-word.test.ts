import { describe, expect, it } from "vitest";

import { cardWord } from "@/features/scan/lib/scan-card-word";

describe("cardWord", () => {
  it("uses the singular for exactly one", () => {
    expect(cardWord(1)).toBe("card");
  });

  it("uses the plural for none and for many", () => {
    expect(cardWord(0)).toBe("cards");
    expect(cardWord(7)).toBe("cards");
  });
});
