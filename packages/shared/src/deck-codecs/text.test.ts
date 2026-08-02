import { describe, expect, it } from "vitest";

import { encodeText, parseTextFormat } from "./text.js";
import type { DeckCodecCard } from "./types.js";

function card(overrides: Partial<DeckCodecCard> & { cardName: string }): DeckCodecCard {
  return {
    cardId: "1",
    shortCode: "OGN-001",
    zone: "main",
    quantity: 1,
    cardType: "unit",
    superTypes: [],
    domains: [],
    preferredPrintingId: null,
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

  it("groups by zone in output order and skips empty zones", () => {
    const { code } = encodeText([
      card({ cardName: "Fireball", zone: "sideboard" }),
      card({ cardName: "Garen", zone: "legend" }),
      card({ cardName: "Bolt", zone: "main" }),
    ]);

    expect(code).toBe("Legend:\n1 Garen\n\nMainDeck:\n1 Bolt\n\nSideboard:\n1 Fireball");
  });

  it("never writes the overflow zone", () => {
    const { code } = encodeText([card({ cardName: "Stashed", zone: "overflow" })]);
    expect(code).toBe("");
  });
});

describe("parseTextFormat", () => {
  it("assigns cards to the zone of the preceding header", () => {
    const { entries } = parseTextFormat("Legend:\n1 Garen\n\nSideboard:\n2 Fireball");

    expect(entries).toEqual([
      {
        cardName: "Garen",
        quantity: 1,
        sourceSlot: "mainDeck",
        explicitZone: "legend",
        rawFields: { Name: "Garen", Zone: "Legend" },
      },
      {
        cardName: "Fireball",
        quantity: 2,
        sourceSlot: "sideboard",
        explicitZone: "sideboard",
        rawFields: { Name: "Fireball", Zone: "Sideboard" },
      },
    ]);
  });

  it("accepts the alternate header spellings other tools write", () => {
    const zoneOf = (header: string) => parseTextFormat(`${header}\n1 Card`).entries[0].explicitZone;

    expect(zoneOf("Main Deck:")).toBe("main");
    expect(zoneOf("Main:")).toBe("main");
    expect(zoneOf("MAINDECK:")).toBe("main");
    expect(zoneOf("Battlefield:")).toBe("battlefield");
    expect(zoneOf("Rune Pool:")).toBe("runes");
    expect(zoneOf("Overflow:")).toBe("overflow");
  });

  it("leaves the zone unset with no header so type inference decides", () => {
    const { entries } = parseTextFormat("3 Fireball");

    expect(entries[0].explicitZone).toBeUndefined();
    expect(entries[0].sourceSlot).toBe("mainDeck");
    expect(entries[0].quantity).toBe(3);
  });

  it("treats a bare name line as a single copy", () => {
    const { entries } = parseTextFormat("Fireball");

    expect(entries[0]).toMatchObject({ cardName: "Fireball", quantity: 1 });
  });

  it("routes an explicit champion header to the chosenChampion slot", () => {
    const { entries } = parseTextFormat("Champion:\n1 Ekko");

    expect(entries[0].sourceSlot).toBe("chosenChampion");
    expect(entries[0].explicitZone).toBe("champion");
  });

  it("clears the zone and warns on an unknown header", () => {
    // Reproduces the riftdecks.com bug: an unknown 'Rune Pool:' header used to
    // make the rune cards inherit the prior 'Battlefields:' zone silently.
    const { entries, warnings } = parseTextFormat(
      "Battlefields:\n1 Sunken Temple\n\nMystery Zone:\n5 Body Rune",
    );

    expect(warnings).toEqual(["Unknown zone header: Mystery Zone:"]);
    expect(entries[0].explicitZone).toBe("battlefield");
    // The card after the unknown header must not inherit 'battlefield'.
    expect(entries[1].explicitZone).toBeUndefined();
    expect(entries[1].sourceSlot).toBe("mainDeck");
  });

  it("ignores blank lines", () => {
    const { entries } = parseTextFormat("\n\nMainDeck:\n\n1 Fireball\n\n");

    expect(entries).toHaveLength(1);
  });
});
