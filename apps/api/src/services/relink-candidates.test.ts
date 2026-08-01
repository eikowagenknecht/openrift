/* oxlint-disable no-restricted-imports -- api has no @/ alias */
import { describe, expect, it, vi } from "vitest";

import { relinkCandidatePrintings } from "./relink-candidates.js";

function makeRepos({
  unlinked = [] as unknown[],
  cardNorms = [] as unknown[],
  aliases = [] as unknown[],
  printingKeys = [] as unknown[],
  overrides = [] as unknown[],
} = {}) {
  const linkCandidatePrintings = vi.fn().mockResolvedValue(undefined);
  return {
    repos: {
      ingest: {
        allUnlinkedCandidatePrintings: vi.fn().mockResolvedValue(unlinked),
        allCardNorms: vi.fn().mockResolvedValue(cardNorms),
        allCardNameAliases: vi.fn().mockResolvedValue(aliases),
        allPrintingKeys: vi.fn().mockResolvedValue(printingKeys),
        allPrintingLinkOverrides: vi.fn().mockResolvedValue(overrides),
      },
      candidateMutations: { linkCandidatePrintings },
    } as never,
    linkCandidatePrintings,
  };
}

function makeUnlinked(overrides: Record<string, unknown> = {}) {
  return {
    id: "cp-1",
    shortCode: "OGN-001",
    finish: "normal",
    markerSlugs: [],
    language: "EN",
    externalId: "ext-1",
    cardName: "Fireball",
    ...overrides,
  };
}

const fireballKey = {
  id: "printing-uuid",
  shortCode: "OGN-001",
  finish: "normal",
  markerSlugs: [],
  language: "EN",
};

describe("relinkCandidatePrintings", () => {
  it("returns zeros when nothing is unlinked", async () => {
    const { repos, linkCandidatePrintings } = makeRepos();
    expect(await relinkCandidatePrintings(repos)).toEqual({ examined: 0, linked: 0 });
    expect(linkCandidatePrintings).not.toHaveBeenCalled();
  });

  it("links a row whose composite key now matches an accepted printing", async () => {
    const { repos, linkCandidatePrintings } = makeRepos({
      unlinked: [makeUnlinked()],
      cardNorms: [{ id: "card-uuid", normName: "fireball" }],
      printingKeys: [fireballKey],
    });
    expect(await relinkCandidatePrintings(repos)).toEqual({ examined: 1, linked: 1 });
    expect(linkCandidatePrintings).toHaveBeenCalledWith(["cp-1"], "printing-uuid");
  });

  it("matches short codes case-insensitively and defaults language to EN", async () => {
    const { repos, linkCandidatePrintings } = makeRepos({
      unlinked: [makeUnlinked({ shortCode: "ogn-001", language: null })],
      cardNorms: [{ id: "card-uuid", normName: "fireball" }],
      printingKeys: [fireballKey],
    });
    expect(await relinkCandidatePrintings(repos)).toEqual({ examined: 1, linked: 1 });
    expect(linkCandidatePrintings).toHaveBeenCalledWith(["cp-1"], "printing-uuid");
  });

  it("resolves the card via alias when the direct norm does not match", async () => {
    const { repos } = makeRepos({
      unlinked: [makeUnlinked({ cardName: "Firbal" })],
      cardNorms: [{ id: "card-uuid", normName: "fireball" }],
      aliases: [{ cardId: "card-uuid", normName: "firbal" }],
      printingKeys: [fireballKey],
    });
    expect(await relinkCandidatePrintings(repos)).toEqual({ examined: 1, linked: 1 });
  });

  it("prefers a manual link override over key resolution", async () => {
    const { repos, linkCandidatePrintings } = makeRepos({
      unlinked: [makeUnlinked()],
      cardNorms: [{ id: "card-uuid", normName: "fireball" }],
      printingKeys: [fireballKey],
      overrides: [{ externalId: "ext-1", finish: "normal", printingId: "override-uuid" }],
    });
    await relinkCandidatePrintings(repos);
    expect(linkCandidatePrintings).toHaveBeenCalledWith(["cp-1"], "override-uuid");
  });

  it("applies an override even when the row has no finish", async () => {
    const { repos, linkCandidatePrintings } = makeRepos({
      unlinked: [makeUnlinked({ finish: null })],
      overrides: [{ externalId: "ext-1", finish: "", printingId: "override-uuid" }],
    });
    await relinkCandidatePrintings(repos);
    expect(linkCandidatePrintings).toHaveBeenCalledWith(["cp-1"], "override-uuid");
  });

  it("skips rows without finish, without a matching card, or with an empty norm", async () => {
    const { repos, linkCandidatePrintings } = makeRepos({
      unlinked: [
        makeUnlinked({ id: "cp-no-finish", finish: null }),
        makeUnlinked({ id: "cp-no-card", cardName: "Unknown Card" }),
        // A punctuation-only name normalizes to "" and must never resolve, even
        // when a card with an empty norm exists.
        makeUnlinked({ id: "cp-empty-norm", cardName: "!?!" }),
      ],
      cardNorms: [
        { id: "card-uuid", normName: "fireball" },
        { id: "empty-card-uuid", normName: "" },
      ],
      printingKeys: [fireballKey],
    });
    expect(await relinkCandidatePrintings(repos)).toEqual({ examined: 3, linked: 0 });
    expect(linkCandidatePrintings).not.toHaveBeenCalled();
  });

  it("bulk-links per target printing across rows", async () => {
    const { repos, linkCandidatePrintings } = makeRepos({
      unlinked: [
        makeUnlinked({ id: "cp-1" }),
        makeUnlinked({ id: "cp-2", externalId: "ext-2" }),
        makeUnlinked({ id: "cp-3", externalId: "ext-3", finish: "foil" }),
      ],
      cardNorms: [{ id: "card-uuid", normName: "fireball" }],
      printingKeys: [fireballKey, { ...fireballKey, id: "foil-uuid", finish: "foil" }],
    });
    expect(await relinkCandidatePrintings(repos)).toEqual({ examined: 3, linked: 3 });
    expect(linkCandidatePrintings).toHaveBeenCalledTimes(2);
    expect(linkCandidatePrintings).toHaveBeenCalledWith(["cp-1", "cp-2"], "printing-uuid");
    expect(linkCandidatePrintings).toHaveBeenCalledWith(["cp-3"], "foil-uuid");
  });

  it("sorts marker slugs before keying so order never blocks a match", async () => {
    const { repos, linkCandidatePrintings } = makeRepos({
      unlinked: [makeUnlinked({ markerSlugs: ["promo", "launch-exclusive"] })],
      cardNorms: [{ id: "card-uuid", normName: "fireball" }],
      printingKeys: [{ ...fireballKey, markerSlugs: ["launch-exclusive", "promo"] }],
    });
    expect(await relinkCandidatePrintings(repos)).toEqual({ examined: 1, linked: 1 });
    expect(linkCandidatePrintings).toHaveBeenCalledWith(["cp-1"], "printing-uuid");
  });
});
