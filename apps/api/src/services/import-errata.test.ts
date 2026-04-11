/* oxlint-disable
   no-restricted-imports
   -- test file: api has no @/ alias */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import type { UploadErrataEntry } from "../routes/admin/cards/schemas.js";
import { importErrata } from "./import-errata.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTransact(trxRepos: Repos): Transact {
  return (fn) => fn(trxRepos) as any;
}

interface CardRow {
  id: string;
  slug: string;
  name: string;
}

interface ErrataRow {
  cardId: string;
  correctedRulesText: string | null;
  correctedEffectText: string | null;
  source: string;
  sourceUrl: string | null;
  effectiveDate: Date | string | null;
}

interface PrintingTextRow {
  cardId: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
}

function createMockMut(overrides: {
  cards?: CardRow[];
  errata?: ErrataRow[];
  printingTexts?: PrintingTextRow[];
}) {
  return {
    getCardsBySlugs: vi.fn().mockResolvedValue(overrides.cards ?? []),
    getErrataByCardIds: vi.fn().mockResolvedValue(overrides.errata ?? []),
    getPrintingTextsByCardIds: vi.fn().mockResolvedValue(overrides.printingTexts ?? []),
    upsertCardErrata: vi.fn().mockResolvedValue(undefined),
    updateCardById: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRepos(mut: ReturnType<typeof createMockMut>): Repos {
  return { candidateMutations: mut } as unknown as Repos;
}

function makeEntry(overrides: Partial<UploadErrataEntry> = {}): UploadErrataEntry {
  return {
    cardSlug: "jinx-rebel",
    correctedRulesText: "Deal 4 damage.",
    correctedEffectText: null,
    source: "Riftbound Origins Errata",
    sourceUrl: "https://example.com/errata",
    effectiveDate: "2025-10-21",
    ...overrides,
  } as UploadErrataEntry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("importErrata", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Empty input ─────────────────────────────────────────────────────────

  it("returns zero counts and no writes when entries are empty", async () => {
    const mut = createMockMut({});
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, { entries: [], dryRun: false });

    expect(result.newCount).toBe(0);
    expect(result.updatedCount).toBe(0);
    expect(result.unchangedCount).toBe(0);
    expect(result.matchesPrintedCount).toBe(0);
    expect(result.errors).toEqual([]);
    expect(mut.getCardsBySlugs).not.toHaveBeenCalled();
    expect(mut.upsertCardErrata).not.toHaveBeenCalled();
  });

  // ── Unknown slug ────────────────────────────────────────────────────────

  it("records an error for an unknown slug and does not write", async () => {
    const mut = createMockMut({ cards: [] });
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, {
      entries: [makeEntry({ cardSlug: "does-not-exist" })],
      dryRun: false,
    });

    expect(result.errors).toEqual(['Unknown card slug: "does-not-exist"']);
    expect(result.newCount).toBe(0);
    expect(mut.upsertCardErrata).not.toHaveBeenCalled();
    expect(mut.updateCardById).not.toHaveBeenCalled();
  });

  // ── New entry ───────────────────────────────────────────────────────────

  it("classifies a never-before-seen entry as new and upserts it on apply", async () => {
    const mut = createMockMut({
      cards: [{ id: "card-1", slug: "jinx-rebel", name: "Jinx, Rebel" }],
      errata: [],
      printingTexts: [
        { cardId: "card-1", printedRulesText: "Deal 3 damage.", printedEffectText: null },
      ],
    });
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, { entries: [makeEntry()], dryRun: false });

    expect(result.newCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    expect(result.newEntries).toEqual([{ cardSlug: "jinx-rebel", cardName: "Jinx, Rebel" }]);
    expect(mut.upsertCardErrata).toHaveBeenCalledTimes(1);
    expect(mut.upsertCardErrata).toHaveBeenCalledWith("card-1", {
      correctedRulesText: "Deal 4 damage.",
      correctedEffectText: null,
      source: "Riftbound Origins Errata",
      sourceUrl: "https://example.com/errata",
      effectiveDate: "2025-10-21",
    });
    expect(mut.updateCardById).toHaveBeenCalledTimes(1);
  });

  // ── Updated entry ───────────────────────────────────────────────────────

  it("classifies a changed entry as updated and reports a diff", async () => {
    const mut = createMockMut({
      cards: [{ id: "card-1", slug: "jinx-rebel", name: "Jinx, Rebel" }],
      errata: [
        {
          cardId: "card-1",
          correctedRulesText: "Deal 3 damage.",
          correctedEffectText: null,
          source: "Old source",
          sourceUrl: null,
          effectiveDate: null,
        },
      ],
      printingTexts: [
        { cardId: "card-1", printedRulesText: "Original text.", printedEffectText: null },
      ],
    });
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, { entries: [makeEntry()], dryRun: false });

    expect(result.updatedCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.updatedEntries).toHaveLength(1);
    const fields = result.updatedEntries[0].fields.map((f) => f.field).sort();
    expect(fields).toEqual(["correctedRulesText", "effectiveDate", "source", "sourceUrl"]);
    expect(mut.upsertCardErrata).toHaveBeenCalledTimes(1);
  });

  // ── Unchanged entry ─────────────────────────────────────────────────────

  it("classifies an identical entry as unchanged and still writes on apply (idempotent)", async () => {
    const existingDate = new Date("2025-10-21T00:00:00Z");
    const mut = createMockMut({
      cards: [{ id: "card-1", slug: "jinx-rebel", name: "Jinx, Rebel" }],
      errata: [
        {
          cardId: "card-1",
          correctedRulesText: "Deal 4 damage.",
          correctedEffectText: null,
          source: "Riftbound Origins Errata",
          sourceUrl: "https://example.com/errata",
          effectiveDate: existingDate,
        },
      ],
      printingTexts: [
        { cardId: "card-1", printedRulesText: "Deal 3 damage.", printedEffectText: null },
      ],
    });
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, { entries: [makeEntry()], dryRun: false });

    expect(result.unchangedCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.updatedCount).toBe(0);
    // Unchanged entries are skipped — no write.
    expect(mut.upsertCardErrata).not.toHaveBeenCalled();
  });

  // ── Matches printed text ────────────────────────────────────────────────

  it("flags entries whose corrected text matches every printing, and skips them on apply", async () => {
    const mut = createMockMut({
      cards: [{ id: "card-1", slug: "jinx-rebel", name: "Jinx, Rebel" }],
      errata: [],
      printingTexts: [
        { cardId: "card-1", printedRulesText: "Deal 4 damage.", printedEffectText: null },
        { cardId: "card-1", printedRulesText: "Deal 4 damage.", printedEffectText: null },
      ],
    });
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, { entries: [makeEntry()], dryRun: false });

    expect(result.matchesPrintedCount).toBe(1);
    expect(result.skippedMatchesPrinted).toEqual([
      { cardSlug: "jinx-rebel", cardName: "Jinx, Rebel" },
    ]);
    expect(result.newCount).toBe(0);
    expect(mut.upsertCardErrata).not.toHaveBeenCalled();
  });

  it("does NOT flag as matches-printed when any printing still has old text", async () => {
    const mut = createMockMut({
      cards: [{ id: "card-1", slug: "jinx-rebel", name: "Jinx, Rebel" }],
      errata: [],
      printingTexts: [
        { cardId: "card-1", printedRulesText: "Deal 4 damage.", printedEffectText: null },
        { cardId: "card-1", printedRulesText: "Deal 3 damage.", printedEffectText: null },
      ],
    });
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, { entries: [makeEntry()], dryRun: false });

    expect(result.matchesPrintedCount).toBe(0);
    expect(result.newCount).toBe(1);
    expect(mut.upsertCardErrata).toHaveBeenCalledTimes(1);
  });

  // ── Dry run ─────────────────────────────────────────────────────────────

  it("does not write anything when dryRun is true", async () => {
    const mut = createMockMut({
      cards: [{ id: "card-1", slug: "jinx-rebel", name: "Jinx, Rebel" }],
      errata: [],
      printingTexts: [
        { cardId: "card-1", printedRulesText: "Deal 3 damage.", printedEffectText: null },
      ],
    });
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, { entries: [makeEntry()], dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.newCount).toBe(1);
    expect(mut.upsertCardErrata).not.toHaveBeenCalled();
    expect(mut.updateCardById).not.toHaveBeenCalled();
  });

  it("reports the same preview classification on dry run as on apply", async () => {
    const mut = createMockMut({
      cards: [
        { id: "card-1", slug: "jinx-rebel", name: "Jinx, Rebel" },
        { id: "card-2", slug: "garen-strike", name: "Garen Strike" },
      ],
      errata: [
        {
          cardId: "card-2",
          correctedRulesText: "Old rules.",
          correctedEffectText: null,
          source: "Old source",
          sourceUrl: null,
          effectiveDate: null,
        },
      ],
      printingTexts: [
        { cardId: "card-1", printedRulesText: "Deal 3 damage.", printedEffectText: null },
        { cardId: "card-2", printedRulesText: "Old rules.", printedEffectText: null },
      ],
    });
    const transact = mockTransact(createMockRepos(mut));

    const result = await importErrata(transact, {
      entries: [
        makeEntry({ cardSlug: "jinx-rebel" }),
        makeEntry({ cardSlug: "garen-strike", correctedRulesText: "New rules." }),
        makeEntry({ cardSlug: "unknown-card" }),
      ],
      dryRun: true,
    });

    expect(result.newCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.errors).toEqual(['Unknown card slug: "unknown-card"']);
  });

  // ── Keyword recomputation ───────────────────────────────────────────────

  it("recomputes keywords from errata + printed texts when applying", async () => {
    const mut = createMockMut({
      cards: [{ id: "card-1", slug: "jinx-rebel", name: "Jinx, Rebel" }],
      errata: [],
      printingTexts: [
        { cardId: "card-1", printedRulesText: "Deal 3 damage.", printedEffectText: null },
      ],
    });
    const transact = mockTransact(createMockRepos(mut));

    await importErrata(transact, { entries: [makeEntry()], dryRun: false });

    expect(mut.updateCardById).toHaveBeenCalledWith("card-1", {
      keywords: expect.any(Array),
    });
  });
});
