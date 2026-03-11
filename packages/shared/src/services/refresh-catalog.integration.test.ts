import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/types.js";
import type { Logger } from "../logger.js";
import { setupTestDb } from "../test/integration-setup.js";
import * as fetchCatalogMod from "./fetch-catalog.js";
import { refreshCatalog } from "./refresh-catalog.js";

const DATABASE_URL = process.env.DATABASE_URL;

// ── Mock fetchCatalog ────────────────────────────────────────────────────────

interface MockCatalog {
  sets: { id: string; name: string; printedTotal: number }[];
  cards: Record<
    string,
    {
      name: string;
      type: string;
      superTypes: string[];
      domains: string[];
      stats: { might: number | null; energy: number | null; power: number | null };
      keywords: string[];
      mightBonus: number | null;
      rulesText: string;
      effectText: string;
      tags: string[];
    }
  >;
  printings: {
    sourceId: string;
    cardId: string;
    set: string;
    collectorNumber: number;
    rarity: string;
    artVariant: string;
    isSigned: boolean;
    isPromo: boolean;
    art: { imageURL: string; artist: string };
    publicCode: string;
    printedRulesText: string;
    printedEffectText: string;
  }[];
}

// oxlint-disable-next-line prefer-const -- reassigned per test to control mock return value
let mockCatalogData: MockCatalog;

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBasicCatalog(overrides?: {
  setName?: string;
  setPrintedTotal?: number;
  cardName?: string;
  cardRulesText?: string;
  cardDomains?: string[];
  imageUrl?: string;
}) {
  return {
    sets: [
      {
        id: "TST",
        name: overrides?.setName ?? "Test Set",
        printedTotal: overrides?.setPrintedTotal ?? 50,
      },
    ],
    cards: {
      "TST-001": {
        name: overrides?.cardName ?? "Test Knight",
        type: "Unit" as const,
        superTypes: [] as string[],
        domains: overrides?.cardDomains ?? ["Fury"],
        stats: { might: 2, energy: 3, power: 4 },
        keywords: ["Shield"],
        mightBonus: null,
        rulesText: overrides?.cardRulesText ?? "[Shield] Guard the line.",
        effectText: "",
        tags: [] as string[],
      },
      "TST-002": {
        name: "Test Blast",
        type: "Spell" as const,
        superTypes: [] as string[],
        domains: ["Mind"],
        stats: { might: null, energy: 2, power: null },
        keywords: [] as string[],
        mightBonus: null,
        rulesText: "Deal 3 damage.",
        effectText: "",
        tags: [] as string[],
      },
    },
    printings: [
      {
        sourceId: "TST-001",
        cardId: "TST-001",
        set: "TST",
        collectorNumber: 1,
        rarity: "Common" as const,
        artVariant: "normal",
        isSigned: false,
        isPromo: false,
        art: {
          imageURL: overrides?.imageUrl ?? "https://img.example.com/knight.jpg",
          artist: "Alice",
        },
        publicCode: "TST-001/50",
        printedRulesText: "[Shield] Guard the line.",
        printedEffectText: "",
      },
      {
        sourceId: "TST-002",
        cardId: "TST-002",
        set: "TST",
        collectorNumber: 2,
        rarity: "Rare" as const,
        artVariant: "normal",
        isSigned: false,
        isPromo: false,
        art: {
          imageURL: "https://img.example.com/blast.jpg",
          artist: "Bob",
        },
        publicCode: "TST-002/50",
        printedRulesText: "Deal 3 damage.",
        printedEffectText: "",
      },
    ],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(!DATABASE_URL)("refreshCatalog (integration)", () => {
  let db: Kysely<Database>;
  let log: Logger;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by describe.skipIf
    ({ db, log, teardown } = await setupTestDb(DATABASE_URL!));
  });

  afterAll(async () => {
    if (process.env.KEEP_TEST_DB) {
      return;
    }
    await teardown();
  });

  let fetchCatalogSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // oxlint-disable-next-line typescript/no-explicit-any -- test mock
    fetchCatalogSpy = spyOn(fetchCatalogMod, "fetchCatalog" as any).mockImplementation(
      async () => mockCatalogData,
    );
    await sql`TRUNCATE printing_images, printings, cards, sets CASCADE`.execute(db);
  });

  afterEach(() => {
    fetchCatalogSpy.mockRestore();
  });

  // ── Fresh insert ───────────────────────────────────────────────────────

  it("inserts all entities on a fresh DB and reports them as added", async () => {
    mockCatalogData = makeBasicCatalog();
    const result = await refreshCatalog(db, log);

    expect(result.sets.total).toBe(1);
    expect(result.cards.total).toBe(2);
    // Common → normal + foil, Rare → foil only = 3
    expect(result.printings.total).toBe(3);

    const added = result.changes.filter((c) => c.kind === "added");
    expect(added.filter((c) => c.entity === "set")).toHaveLength(1);
    expect(added.filter((c) => c.entity === "card")).toHaveLength(2);
    expect(added.filter((c) => c.entity === "printing")).toHaveLength(3);
    expect(added.filter((c) => c.entity === "image")).toHaveLength(3);
  });

  it("persists rows to the database", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);

    const sets = await db.selectFrom("sets").selectAll().execute();
    expect(sets).toHaveLength(1);
    expect(sets[0].name).toBe("Test Set");

    const cards = await db.selectFrom("cards").selectAll().execute();
    expect(cards).toHaveLength(2);

    const printings = await db.selectFrom("printings").selectAll().execute();
    expect(printings).toHaveLength(3);

    const images = await db.selectFrom("printing_images").selectAll().execute();
    expect(images).toHaveLength(3);
  });

  it("returns correct result shape", async () => {
    mockCatalogData = makeBasicCatalog();
    const result = await refreshCatalog(db, log);

    expect(result.sets).toEqual({ total: 1, names: ["Test Set"] });
    expect(result.cards).toEqual({ total: 2 });
    expect(result.printings).toEqual({ total: 3 });
    expect(result.images).toEqual({ total: 3, added: 3, updated: 0 });
  });

  // ── Idempotency ────────────────────────────────────────────────────────

  it("reports no changes on idempotent re-run", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);
    const result = await refreshCatalog(db, log);

    expect(result.changes).toHaveLength(0);
  });

  // ── Set change detection ───────────────────────────────────────────────

  it("detects updated set name", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);

    mockCatalogData = makeBasicCatalog({ setName: "Renamed Set" });
    const result = await refreshCatalog(db, log);

    const updated = result.changes.filter((c) => c.entity === "set" && c.kind === "updated");
    expect(updated).toHaveLength(1);
    expect(updated[0].fields).toContain("name");
    expect(updated[0].name).toBe("Renamed Set");
  });

  it("detects updated set printed_total", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);

    mockCatalogData = makeBasicCatalog({ setPrintedTotal: 100 });
    const result = await refreshCatalog(db, log);

    const updated = result.changes.filter((c) => c.entity === "set" && c.kind === "updated");
    expect(updated).toHaveLength(1);
    expect(updated[0].fields).toContain("printed_total");
  });

  // ── Card change detection ──────────────────────────────────────────────

  it("detects updated card rules_text", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);

    mockCatalogData = makeBasicCatalog({ cardRulesText: "New rules text." });
    const result = await refreshCatalog(db, log);

    const updated = result.changes.filter((c) => c.entity === "card" && c.kind === "updated");
    expect(updated).toHaveLength(1);
    expect(updated[0].fields).toContain("rules_text");
    expect(updated[0].name).toBe("Test Knight");
  });

  it("detects updated card domains", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);

    mockCatalogData = makeBasicCatalog({ cardDomains: ["Mind", "Order"] });
    const result = await refreshCatalog(db, log);

    const updated = result.changes.filter((c) => c.entity === "card" && c.kind === "updated");
    expect(updated).toHaveLength(1);
    expect(updated[0].fields).toContain("domains");
  });

  // ── Stale detection ────────────────────────────────────────────────────

  it("detects stale sets, cards, and printings", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);

    // Second run with empty catalog — everything in DB becomes stale
    mockCatalogData = { sets: [], cards: {}, printings: [] };
    const result = await refreshCatalog(db, log);

    const stale = result.changes.filter((c) => c.kind === "stale");
    expect(stale.filter((c) => c.entity === "set")).toHaveLength(1);
    expect(stale.filter((c) => c.entity === "card")).toHaveLength(2);
    expect(stale.filter((c) => c.entity === "printing")).toHaveLength(3);
  });

  it("includes name in stale set and card changes", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);

    mockCatalogData = { sets: [], cards: {}, printings: [] };
    const result = await refreshCatalog(db, log);

    const staleSet = result.changes.find((c) => c.entity === "set" && c.kind === "stale");
    expect(staleSet?.name).toBe("Test Set");

    const staleCard = result.changes.find(
      (c) => c.entity === "card" && c.kind === "stale" && c.id === "TST-001",
    );
    expect(staleCard?.name).toBe("Test Knight");
  });

  // ── Image change detection ─────────────────────────────────────────────

  it("detects updated image URL", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);

    mockCatalogData = makeBasicCatalog({ imageUrl: "https://img.example.com/knight-v2.jpg" });
    const result = await refreshCatalog(db, log);

    const updatedImages = result.changes.filter(
      (c) => c.entity === "image" && c.kind === "updated",
    );
    // Both normal and foil printings of TST-001 get the updated image
    expect(updatedImages).toHaveLength(2);
    expect(updatedImages[0].fields).toContain("original_url");
  });

  it("does not report image changes when URL is unchanged", async () => {
    mockCatalogData = makeBasicCatalog();
    await refreshCatalog(db, log);
    const result = await refreshCatalog(db, log);

    const imageChanges = result.changes.filter((c) => c.entity === "image");
    expect(imageChanges).toHaveLength(0);
  });

  // ── Dry run ────────────────────────────────────────────────────────────

  it("skips DB writes in dry-run mode but still reports changes", async () => {
    mockCatalogData = makeBasicCatalog();
    const result = await refreshCatalog(db, log, { dryRun: true });

    // Changes are reported
    const added = result.changes.filter((c) => c.kind === "added");
    expect(added.length).toBeGreaterThan(0);

    // But nothing was written
    const sets = await db.selectFrom("sets").selectAll().execute();
    expect(sets).toHaveLength(0);
  });
});
