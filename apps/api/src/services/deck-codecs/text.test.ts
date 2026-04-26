import { describe, expect, it } from "vitest";

import type { TextCodecCard } from "./text.js";
import { encodeText } from "./text.js";

function card(overrides: Partial<TextCodecCard> & { cardName: string }): TextCodecCard {
  return {
    cardId: "1",
    shortCode: "OGN-001",
    zone: "main",
    quantity: 1,
    cardType: "unit",
    superTypes: [],
    domains: [],
    cardName: overrides.cardName,
    ...overrides,
  };
}

describe("encodeText", () => {
  it("emits card names with straight apostrophes (curly → ASCII)", () => {
    const { code } = encodeText([card({ cardName: "Kai’Sa, Survivor" })]);
    expect(code).toContain("1 Kai'Sa, Survivor");
    expect(code).not.toContain("’");
  });

  it("leaves names without curly apostrophes unchanged", () => {
    const { code } = encodeText([card({ cardName: "Fireball" })]);
    expect(code).toContain("1 Fireball");
  });
});
