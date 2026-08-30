import type { PublicDeckCardResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  archivedDeckIdentity,
  describeIncompleteList,
  medalRank,
  unknownZoneCounts,
} from "./meta-deck-archive";

function card(overrides: Partial<PublicDeckCardResponse> = {}): PublicDeckCardResponse {
  return {
    cardId: "card-1",
    zone: "main",
    quantity: 1,
    preferredPrintingId: null,
    cardName: "Punch First",
    cardSlug: "punch-first",
    cardType: "spell",
    cardTypes: ["spell"],
    superTypes: [],
    domains: ["fury"],
    tags: [],
    keywords: [],
    maxCopiesOverride: null,
    banned: false,
    energy: 1,
    might: null,
    power: null,
    resolvedPrintingId: null,
    shortCode: null,
    imageId: null,
    ...overrides,
  } as PublicDeckCardResponse;
}

const legend = card({
  cardId: "legend-1",
  zone: "legend",
  cardName: "Relentless Storm",
  cardSlug: "relentless-storm",
  cardType: "legend",
  cardTypes: ["legend"],
  tags: ["Volibear"],
  domains: ["fury", "body"],
});

describe("archivedDeckIdentity", () => {
  it("names the legend champion-first with its slug and domains", () => {
    expect(archivedDeckIdentity([legend, card()])).toEqual({
      name: "Volibear, Relentless Storm",
      slug: "relentless-storm",
      domains: ["fury", "body"],
    });
  });

  it("falls back to the chosen champion when the legend was never published", () => {
    const champion = card({
      cardId: "champ-1",
      zone: "champion",
      cardName: "Volibear, Thunder's Roar",
      cardSlug: "volibear-thunders-roar",
      cardType: "unit",
      cardTypes: ["unit"],
      tags: ["Volibear"],
    });
    expect(archivedDeckIdentity([champion, card()])?.name).toBe("Volibear, Thunder's Roar");
  });

  it("returns null when neither identity zone holds a card", () => {
    expect(archivedDeckIdentity([card()])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(archivedDeckIdentity([])).toBeNull();
  });
});

describe("unknownZoneCounts", () => {
  it("counts nothing for a full list", () => {
    expect(unknownZoneCounts([legend], "constructed", "full").size).toBe(0);
  });

  it("reports every required zone the partial list falls short in", () => {
    const counts = unknownZoneCounts(
      [legend, card({ zone: "main", quantity: 34 })],
      "constructed",
      "partial",
    );
    expect(counts.get("legend")).toBeUndefined();
    expect(counts.get("champion")).toBe(1);
    expect(counts.get("battlefield")).toBe(3);
    expect(counts.get("runes")).toBe(12);
    expect(counts.get("main")).toBe(5);
  });

  it("leaves a sideboard the list does carry out of the count, its target being a cap", () => {
    const counts = unknownZoneCounts(
      [legend, card({ zone: "sideboard", quantity: 2 })],
      "constructed",
      "partial",
    );
    expect(counts.has("sideboard")).toBe(false);
  });

  it("follows the format's own battlefield target", () => {
    const counts = unknownZoneCounts([legend], "custom-region", "partial");
    expect(counts.get("battlefield")).toBe(1);
  });

  it("counts nothing in a zone the list already fills", () => {
    const counts = unknownZoneCounts(
      [legend, card({ zone: "battlefield", quantity: 3 })],
      "constructed",
      "partial",
    );
    expect(counts.has("battlefield")).toBe(false);
  });
});

describe("describeIncompleteList", () => {
  function describe_(cards: PublicDeckCardResponse[]): string | null {
    return describeIncompleteList(
      "constructed",
      unknownZoneCounts(cards, "constructed", "partial"),
    );
  }

  it("says nothing about a list with nothing missing", () => {
    expect(describeIncompleteList("constructed", new Map())).toBeNull();
  });

  it("separates the zones it holds part of from the ones it holds none of", () => {
    const sentence = describe_([
      legend,
      card({ zone: "champion", quantity: 1 }),
      card({ zone: "main", quantity: 34 }),
      card({ zone: "runes", quantity: 12 }),
    ]);
    expect(sentence).toBe("34 of 39 main deck cards are known; the battlefields are not.");
  });

  it("names every missing zone when it holds only the main deck's start", () => {
    const sentence = describe_([legend, card({ zone: "main", quantity: 39 })]);
    expect(sentence).toBe("The Chosen Champion, the runes and the battlefields are not known.");
  });

  it("reads as one clause when only counts are short", () => {
    const sentence = describe_([
      legend,
      card({ zone: "champion", quantity: 1 }),
      card({ zone: "runes", quantity: 10 }),
      card({ zone: "battlefield", quantity: 2 }),
      card({ zone: "main", quantity: 39 }),
    ]);
    expect(sentence).toBe("10 of 12 runes and 2 of 3 battlefields are known.");
  });

  it("never names the sideboard, which the archive makes no claim about", () => {
    expect(describe_([legend])).not.toContain("sideboard");
  });
});

describe("medalRank", () => {
  it("medals the podium of an exactly-published field", () => {
    expect(medalRank(1, false)).toBe(1);
    expect(medalRank(3, false)).toBe(3);
  });

  it("stops at the top two when the source only published cut buckets", () => {
    expect(medalRank(2, true)).toBe(2);
    expect(medalRank(3, true)).toBeNull();
  });

  it("leaves the rest of the field unmedalled", () => {
    expect(medalRank(4, false)).toBeNull();
    expect(medalRank(64, true)).toBeNull();
  });

  it("refuses a rank below first, which would plate a 0", () => {
    expect(medalRank(0, false)).toBeNull();
    expect(medalRank(-1, false)).toBeNull();
  });
});
