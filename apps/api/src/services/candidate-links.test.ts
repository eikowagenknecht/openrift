/* oxlint-disable no-restricted-imports -- api has no @/ alias */
import { describe, expect, it } from "vitest";

import {
  buildCandidateLinkIndex,
  resolveCardIdByName,
  resolvePrintingLink,
} from "./candidate-links.js";

const FIREBALL_PRINTING = {
  id: "printing-uuid",
  shortCode: "OGN-001",
  finish: "normal",
  markerSlugs: [],
  language: "EN",
};

function makeIndex({
  cardNorms = [{ id: "card-uuid", normName: "fireball" }],
  aliases = [] as { cardId: string; normName: string }[],
  printings = [FIREBALL_PRINTING],
  linkOverrides = [] as {
    externalId: string;
    finish: string;
    provider: string;
    printingId: string;
  }[],
} = {}) {
  return buildCandidateLinkIndex({ cardNorms, aliases, printings, linkOverrides });
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    provider: "test-provider",
    externalId: "ext-1",
    shortCode: "OGN-001",
    finish: "normal" as string | null,
    markerSlugs: [] as string[],
    language: "EN" as string | null,
    cardLinked: true,
    ...overrides,
  };
}

describe("resolveCardIdByName", () => {
  it("resolves by normalized name", () => {
    expect(resolveCardIdByName(makeIndex(), "Fireball")).toBe("card-uuid");
  });

  it("falls back to an alias when the direct norm does not match", () => {
    const index = makeIndex({ aliases: [{ cardId: "card-uuid", normName: "firbal" }] });
    expect(resolveCardIdByName(index, "Firbal")).toBe("card-uuid");
  });

  it("prefers the card norm over an alias pointing elsewhere", () => {
    const index = makeIndex({ aliases: [{ cardId: "other-uuid", normName: "fireball" }] });
    expect(resolveCardIdByName(index, "Fireball")).toBe("card-uuid");
  });

  it("never resolves an empty norm, even when a card normalizes to one", () => {
    const index = makeIndex({
      cardNorms: [
        { id: "card-uuid", normName: "fireball" },
        { id: "empty-card-uuid", normName: "" },
      ],
    });
    expect(resolveCardIdByName(index, "!?!")).toBeNull();
  });

  it("returns null for an unknown name", () => {
    expect(resolveCardIdByName(makeIndex(), "Unknown Card")).toBeNull();
  });
});

describe("resolvePrintingLink", () => {
  it("links on the composite key", () => {
    expect(resolvePrintingLink(makeIndex(), candidate())).toBe("printing-uuid");
  });

  it("links a lowercase short code to an uppercase live printing", () => {
    expect(resolvePrintingLink(makeIndex(), candidate({ shortCode: "ogn-001" }))).toBe(
      "printing-uuid",
    );
  });

  it("links without a rarity — rarity is not part of the gate", () => {
    // The candidate shape carries no rarity at all: requiring one left sources
    // that report a finish but no rarity permanently unlinked.
    expect(resolvePrintingLink(makeIndex(), candidate())).toBe("printing-uuid");
  });

  it("defaults a missing language to EN", () => {
    expect(resolvePrintingLink(makeIndex(), candidate({ language: null }))).toBe("printing-uuid");
  });

  it("does not link when the card did not resolve", () => {
    expect(resolvePrintingLink(makeIndex(), candidate({ cardLinked: false }))).toBeNull();
  });

  it("does not link without a finish", () => {
    expect(resolvePrintingLink(makeIndex(), candidate({ finish: null }))).toBeNull();
  });

  it("does not link when no live printing matches the key", () => {
    expect(resolvePrintingLink(makeIndex(), candidate({ shortCode: "OGN-999" }))).toBeNull();
  });

  it("prefers a manual link override over key resolution", () => {
    const index = makeIndex({
      linkOverrides: [
        {
          externalId: "ext-1",
          finish: "normal",
          provider: "test-provider",
          printingId: "override-uuid",
        },
      ],
    });
    expect(resolvePrintingLink(index, candidate())).toBe("override-uuid");
  });

  it("applies an override to a candidate with no finish, where the key cannot", () => {
    const index = makeIndex({
      linkOverrides: [
        { externalId: "ext-1", finish: "", provider: "test-provider", printingId: "override-uuid" },
      ],
    });
    expect(resolvePrintingLink(index, candidate({ finish: null, cardLinked: false }))).toBe(
      "override-uuid",
    );
  });

  it("scopes an override to its provider, with '' as the legacy wildcard", () => {
    // Regression (migration 253): two providers reusing the same external id
    // must not hijack each other's pins; pre-scoping rows keep applying to
    // every provider, and a provider-scoped row beats the wildcard.
    const index = makeIndex({
      linkOverrides: [
        { externalId: "ext-1", finish: "normal", provider: "", printingId: "wildcard-uuid" },
        {
          externalId: "ext-1",
          finish: "normal",
          provider: "test-provider",
          printingId: "scoped-uuid",
        },
      ],
    });
    expect(resolvePrintingLink(index, candidate())).toBe("scoped-uuid");
    expect(resolvePrintingLink(index, candidate({ provider: "other-provider" }))).toBe(
      "wildcard-uuid",
    );
  });

  it("ignores another provider's override and falls back to the key", () => {
    const index = makeIndex({
      linkOverrides: [
        {
          externalId: "ext-1",
          finish: "normal",
          provider: "other-provider",
          printingId: "override-uuid",
        },
      ],
    });
    expect(resolvePrintingLink(index, candidate())).toBe("printing-uuid");
  });
});
