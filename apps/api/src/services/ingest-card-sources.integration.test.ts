import { beforeAll, describe, expect, it } from "bun:test";

import { createTestContext } from "../test/integration-context.js";
import { ingestCardSources } from "./ingest-card-sources.js";

// ---------------------------------------------------------------------------
// Integration tests: ingestCardSources service
//
// Uses the shared integration database (same as price-refresh tests).
// Reuses user 0022 solely for the DB handle — this service has no user scope.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0022-4000-a000-000000000001";
const ctx = createTestContext(USER_ID);

// Unique source name to avoid collisions with seed data / other tests
const SOURCE = "ingest-test";

describe.skipIf(!ctx)("ingestCardSources integration", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf; db is only used inside it() callbacks
  const db = ctx?.db ?? (null as any);

  // Seed data UUIDs populated by beforeAll
  let seedSetId: string;
  let seedCardId: string;
  let seedPrintingId: string;
  let aliasCardId: string;

  beforeAll(async () => {
    // Clean up any leftover data from previous runs
    await db
      .deleteFrom("printingSources")
      .where(
        "cardSourceId",
        "in",
        db.selectFrom("cardSources").select("id").where("source", "=", SOURCE),
      )
      .execute();
    await db.deleteFrom("cardSources").where("source", "=", SOURCE).execute();

    // Also clean up the "ingest-test-batch" source used in the batch test
    await db
      .deleteFrom("printingSources")
      .where(
        "cardSourceId",
        "in",
        db.selectFrom("cardSources").select("id").where("source", "=", "ingest-test-batch"),
      )
      .execute();
    await db.deleteFrom("cardSources").where("source", "=", "ingest-test-batch").execute();

    // Seed: set + card + printing for resolution tests
    const insertedSet = await db
      .insertInto("sets")
      .values({
        slug: "IGT",
        name: "Ingest Test Set",
        printedTotal: 10,
        sortOrder: 950,
      })
      .onConflict((oc) => oc.column("slug").doUpdateSet({ name: "Ingest Test Set" }))
      .returning("id")
      .executeTakeFirstOrThrow();
    seedSetId = insertedSet.id;

    const insertedCard = await db
      .insertInto("cards")
      .values({
        slug: "IGT-001",
        name: "Ingest Alpha",
        type: "Unit",
        superTypes: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: 1,
        mightBonus: null,
        keywords: [],
        rulesText: null,
        effectText: null,
        tags: [],
      })
      .onConflict((oc) => oc.column("slug").doUpdateSet({ name: "Ingest Alpha" }))
      .returning("id")
      .executeTakeFirstOrThrow();
    seedCardId = insertedCard.id;

    const insertedPrinting = await db
      .insertInto("printings")
      .values({
        slug: "IGT-001:common:normal:",
        cardId: seedCardId,
        setId: seedSetId,
        sourceId: "IGT-001",
        collectorNumber: 1,
        rarity: "Common",
        artVariant: "normal",
        isSigned: false,
        isPromo: false,
        finish: "normal",
        artist: "Test Artist",
        publicCode: "IGT-001/010",
        printedRulesText: null,
        printedEffectText: null,
        flavorText: null,
      })
      .onConflict((oc) => oc.column("slug").doUpdateSet({ artist: "Test Artist" }))
      .returning("id")
      .executeTakeFirstOrThrow();
    seedPrintingId = insertedPrinting.id;

    // Seed a second card only reachable via alias (normName won't match)
    const insertedAliasCard = await db
      .insertInto("cards")
      .values({
        slug: "IGT-002",
        name: "Ingest Beta Original",
        type: "Spell",
        superTypes: [],
        domains: ["Calm"],
        might: null,
        energy: 4,
        power: null,
        mightBonus: null,
        keywords: [],
        rulesText: "Deal 2 damage.",
        effectText: null,
        tags: [],
      })
      .onConflict((oc) => oc.column("slug").doUpdateSet({ name: "Ingest Beta Original" }))
      .returning("id")
      .executeTakeFirstOrThrow();
    aliasCardId = insertedAliasCard.id;

    // Create an alias so "ingestbetaalias" → aliasCardId
    await db
      .insertInto("cardNameAliases")
      .values({ normName: "ingestbetaalias", cardId: aliasCardId })
      .onConflict((oc) => oc.column("normName").doNothing())
      .execute();
  });

  // ── Basic validation ────────────────────────────────────────────────────

  it("throws on empty source name", async () => {
    await expect(ingestCardSources(db, "", [])).rejects.toThrow("source name must not be empty");
    await expect(ingestCardSources(db, "   ", [])).rejects.toThrow("source name must not be empty");
  });

  it("returns zeros for empty cards array", async () => {
    const result = await ingestCardSources(db, SOURCE, []);
    expect(result).toEqual({
      newCards: 0,
      updates: 0,
      unchanged: 0,
      errors: [],
      updatedCards: [],
    });
  });

  // ── Insert new card sources ─────────────────────────────────────────────

  it("inserts a new card_source with no printings", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Solo Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "SOLO-001",
        printings: [],
      },
    ]);

    expect(result.newCards).toBe(1);
    expect(result.updates).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify in DB
    const row = await db
      .selectFrom("cardSources")
      .selectAll()
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "SOLO-001")
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row?.name).toBe("Solo Card");
    expect(row?.type).toBe("Unit");
    expect(row?.might).toBe(3);
  });

  it("inserts a new card_source with printings", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Card With Printings",
        type: "Spell",
        super_types: [],
        domains: ["Mind"],
        might: null,
        energy: 5,
        power: null,
        might_bonus: null,
        rules_text: "Deal 3 damage.",
        effect_text: null,
        tags: ["burn"],
        source_id: "CWP-001",
        printings: [
          {
            source_id: "CWP-001-P1",
            set_id: "SET-A",
            collector_number: 1,
            rarity: "Common",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "normal",
            artist: "Bob Ross",
            public_code: "CWP-001/100",
            printed_rules_text: "Deal 3 damage.",
            printed_effect_text: null,
            image_url: "https://example.com/img.png",
          },
        ],
      },
    ]);

    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify printing_source was inserted
    const cs = await db
      .selectFrom("cardSources")
      .selectAll()
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "CWP-001")
      .executeTakeFirstOrThrow();

    const ps = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .execute();
    expect(ps).toHaveLength(1);
    expect(ps[0].sourceId).toBe("CWP-001-P1");
    expect(ps[0].artist).toBe("Bob Ross");
    expect(ps[0].imageUrl).toBe("https://example.com/img.png");
  });

  // ── Update existing card source ─────────────────────────────────────────

  it("updates an existing card_source when fields change", async () => {
    // First ingest
    await ingestCardSources(db, SOURCE, [
      {
        name: "Evolving Card",
        type: "Unit",
        super_types: [],
        domains: ["Body"],
        might: 2,
        energy: 3,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "EVO-001",
        printings: [],
      },
    ]);

    // Second ingest with changed fields
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Evolving Card",
        type: "Unit",
        super_types: ["Champion"],
        domains: ["Body"],
        might: 5,
        energy: 3,
        power: 2,
        might_bonus: null,
        rules_text: "New rules text.",
        effect_text: null,
        tags: ["elite"],
        source_id: "EVO-001",
        printings: [],
      },
    ]);

    expect(result.updates).toBe(1);
    expect(result.newCards).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.updatedCards).toHaveLength(1);
    expect(result.updatedCards[0].name).toBe("Evolving Card");
    expect(result.updatedCards[0].sourceId).toBe("EVO-001");

    // getChangedFields compares using CARD_FIELDS (camelCase) against the incoming
    // IngestCard object (snake_case). Only fields with matching keys are compared:
    // name, type, domains, might, energy, power, tags.
    // CamelCase-only fields (rulesText, superTypes, etc.) are skipped because they
    // don't exist as keys on the incoming object.
    const changedFieldNames = result.updatedCards[0].fields.map((f) => f.field);
    expect(changedFieldNames).toContain("might");
    expect(changedFieldNames).toContain("power");
    expect(changedFieldNames).toContain("tags");

    // Verify the might field diff
    const mightDiff = result.updatedCards[0].fields.find((f) => f.field === "might");
    expect(mightDiff?.from).toBe(2);
    expect(mightDiff?.to).toBe(5);
  });

  it("returns unchanged when card_source has not changed", async () => {
    // First ingest
    await ingestCardSources(db, SOURCE, [
      {
        name: "Stable Card",
        type: "Rune",
        super_types: [],
        domains: ["Order"],
        might: null,
        energy: 1,
        power: null,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "STABLE-001",
        printings: [],
      },
    ]);

    // Second ingest with identical data
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Stable Card",
        type: "Rune",
        super_types: [],
        domains: ["Order"],
        might: null,
        energy: 1,
        power: null,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "STABLE-001",
        printings: [],
      },
    ]);

    expect(result.unchanged).toBe(1);
    expect(result.updates).toBe(0);
    expect(result.newCards).toBe(0);
  });

  // ── Validation errors ───────────────────────────────────────────────────

  it("records validation error for card with negative might", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Bad Might Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: -1,
        energy: 2,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BAD-001",
        printings: [],
      },
    ]);

    expect(result.newCards).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Bad Might Card");
    expect(result.errors[0]).toContain("might");
  });

  it("records validation error for card with empty name", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 2,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BAD-002",
        printings: [],
      },
    ]);

    expect(result.newCards).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("name");
  });

  it("records validation error for printing with empty source_id", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Valid Card With Bad Printing",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 2,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BADPRINT-001",
        printings: [
          {
            source_id: "",
            set_id: "SET-X",
            collector_number: 1,
            rarity: "Common",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "normal",
            artist: "Test",
            public_code: "X-001/100",
            printed_rules_text: null,
            printed_effect_text: null,
          },
        ],
      },
    ]);

    // The card itself is inserted successfully, but the printing fails validation
    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("source_id");
  });

  // ── Printing updates ────────────────────────────────────────────────────

  it("updates printing_source when fields change", async () => {
    // First ingest with a printing
    await ingestCardSources(db, SOURCE, [
      {
        name: "Print Update Card",
        type: "Unit",
        super_types: [],
        domains: ["Chaos"],
        might: 4,
        energy: 3,
        power: 2,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "PU-001",
        printings: [
          {
            source_id: "PU-001-P1",
            set_id: "SET-PU",
            collector_number: 5,
            rarity: "Uncommon",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "normal",
            artist: "Original Artist",
            public_code: "PU-001/050",
            printed_rules_text: null,
            printed_effect_text: null,
          },
        ],
      },
    ]);

    // Get the initial printing_source
    const cs = await db
      .selectFrom("cardSources")
      .select("id")
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "PU-001")
      .executeTakeFirstOrThrow();
    const psBefore = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(psBefore.artist).toBe("Original Artist");

    // Second ingest with changed artist
    await ingestCardSources(db, SOURCE, [
      {
        name: "Print Update Card",
        type: "Unit",
        super_types: [],
        domains: ["Chaos"],
        might: 4,
        energy: 3,
        power: 2,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "PU-001",
        printings: [
          {
            source_id: "PU-001-P1",
            set_id: "SET-PU",
            collector_number: 5,
            rarity: "Uncommon",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "normal",
            artist: "New Artist",
            public_code: "PU-001/050",
            printed_rules_text: null,
            printed_effect_text: null,
          },
        ],
      },
    ]);

    const psAfter = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(psAfter.artist).toBe("New Artist");
    expect(psAfter.updatedAt.getTime()).toBeGreaterThan(psBefore.updatedAt.getTime());
  });

  it("does not update printing_source when nothing changed", async () => {
    // First ingest
    await ingestCardSources(db, SOURCE, [
      {
        name: "Print Stable Card",
        type: "Gear",
        super_types: [],
        domains: ["Order"],
        might: null,
        energy: 2,
        power: null,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "PS-001",
        printings: [
          {
            source_id: "PS-001-P1",
            set_id: "SET-PS",
            collector_number: 10,
            rarity: "Rare",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "foil",
            artist: "Steady Artist",
            public_code: "PS-001/100",
            printed_rules_text: null,
            printed_effect_text: null,
          },
        ],
      },
    ]);

    const cs = await db
      .selectFrom("cardSources")
      .select("id")
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "PS-001")
      .executeTakeFirstOrThrow();
    const psBefore = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .executeTakeFirstOrThrow();

    // Second ingest with identical data
    await ingestCardSources(db, SOURCE, [
      {
        name: "Print Stable Card",
        type: "Gear",
        super_types: [],
        domains: ["Order"],
        might: null,
        energy: 2,
        power: null,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "PS-001",
        printings: [
          {
            source_id: "PS-001-P1",
            set_id: "SET-PS",
            collector_number: 10,
            rarity: "Rare",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "foil",
            artist: "Steady Artist",
            public_code: "PS-001/100",
            printed_rules_text: null,
            printed_effect_text: null,
          },
        ],
      },
    ]);

    const psAfter = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .executeTakeFirstOrThrow();
    // updatedAt should NOT have changed (no write occurred)
    expect(psAfter.updatedAt.getTime()).toBe(psBefore.updatedAt.getTime());
  });

  // ── Card resolution ─────────────────────────────────────────────────────

  it("resolves card by normName and assigns printingId to printing_source", async () => {
    // "Ingest Alpha" normalizes to "ingestalpha" which matches our seed card
    // The printing slug "IGT-001:common:normal:" should match our seed printing
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Ingest Alpha",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "RESOLVE-001",
        printings: [
          {
            source_id: "IGT-001",
            set_id: "IGT",
            collector_number: 1,
            rarity: "Common",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "normal",
            artist: "Resolved Artist",
            public_code: "IGT-001/010",
            printed_rules_text: null,
            printed_effect_text: null,
          },
        ],
      },
    ]);

    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(0);

    const cs = await db
      .selectFrom("cardSources")
      .select("id")
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "RESOLVE-001")
      .executeTakeFirstOrThrow();

    const ps = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .executeTakeFirstOrThrow();

    // The printing_source should have been linked to our seed printing
    expect(ps.printingId).toBe(seedPrintingId);
  });

  it("resolves card by alias when normName does not match directly", async () => {
    // "Ingest Beta Alias" normalizes to "ingestbetaalias" which matches the alias we seeded
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Ingest Beta Alias",
        type: "Spell",
        super_types: [],
        domains: ["Calm"],
        might: null,
        energy: 4,
        power: null,
        might_bonus: null,
        rules_text: "Deal 2 damage.",
        effect_text: null,
        tags: [],
        source_id: "ALIAS-001",
        printings: [],
      },
    ]);

    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  // ── Lookup by source_id vs name ─────────────────────────────────────────

  it("finds existing card_source by source_id rather than name", async () => {
    // Insert with source_id
    await ingestCardSources(db, SOURCE, [
      {
        name: "Name One",
        type: "Unit",
        super_types: [],
        domains: ["Mind"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "SID-LOOKUP",
        printings: [],
      },
    ]);

    // Re-ingest same source_id but different name — should update, not insert
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Name Two",
        type: "Unit",
        super_types: [],
        domains: ["Mind"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "SID-LOOKUP",
        printings: [],
      },
    ]);

    expect(result.newCards).toBe(0);
    expect(result.updates).toBe(1);
    expect(result.updatedCards[0].fields.some((f) => f.field === "name")).toBe(true);

    // Verify only one card_source exists for this source_id
    const rows = await db
      .selectFrom("cardSources")
      .selectAll()
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "SID-LOOKUP")
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Name Two");
  });

  it("finds existing card_source by name when source_id is absent", async () => {
    // Insert without source_id
    await ingestCardSources(db, SOURCE, [
      {
        name: "Name Only Card",
        type: "Unit",
        super_types: [],
        domains: ["Chaos"],
        might: 2,
        energy: 2,
        power: 2,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        printings: [],
      },
    ]);

    // Re-ingest same name — should be unchanged (not a new insert)
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Name Only Card",
        type: "Unit",
        super_types: [],
        domains: ["Chaos"],
        might: 2,
        energy: 2,
        power: 2,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        printings: [],
      },
    ]);

    expect(result.unchanged).toBe(1);
    expect(result.newCards).toBe(0);
  });

  // ── jsonOrNull / extra_data handling ─────────────────────────────────────

  it("stores extra_data as null when given an empty object", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Extra Data Empty Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "EXTRA-001",
        extra_data: {},
        printings: [],
      },
    ]);

    expect(result.newCards).toBe(1);

    const row = await db
      .selectFrom("cardSources")
      .select("extraData")
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "EXTRA-001")
      .executeTakeFirstOrThrow();
    expect(row.extraData).toBeNull();
  });

  it("stores non-empty extra_data as-is", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Extra Data Real Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "EXTRA-002",
        extra_data: { foo: "bar", count: 42 },
        printings: [],
      },
    ]);

    expect(result.newCards).toBe(1);

    const row = await db
      .selectFrom("cardSources")
      .select("extraData")
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "EXTRA-002")
      .executeTakeFirstOrThrow();
    expect(row.extraData).toEqual({ foo: "bar", count: 42 });
  });

  // ── Batch with mixed results ────────────────────────────────────────────

  it("handles a batch with mixed new, updated, unchanged, and errored cards", async () => {
    const batchSource = "ingest-test-batch";

    // Phase 1: insert two cards
    await ingestCardSources(db, batchSource, [
      {
        name: "Batch Unchanged",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BATCH-001",
        printings: [],
      },
      {
        name: "Batch Will Update",
        type: "Spell",
        super_types: [],
        domains: ["Mind"],
        might: null,
        energy: 3,
        power: null,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BATCH-002",
        printings: [],
      },
    ]);

    // Phase 2: mixed batch
    const result = await ingestCardSources(db, batchSource, [
      // Unchanged
      {
        name: "Batch Unchanged",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BATCH-001",
        printings: [],
      },
      // Updated (changed energy from 3 → 5; energy is a snake_case-matching field)
      {
        name: "Batch Will Update",
        type: "Spell",
        super_types: [],
        domains: ["Mind"],
        might: null,
        energy: 5,
        power: null,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BATCH-002",
        printings: [],
      },
      // New card
      {
        name: "Batch New Card",
        type: "Gear",
        super_types: [],
        domains: ["Body"],
        might: null,
        energy: 1,
        power: null,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BATCH-003",
        printings: [],
      },
      // Validation error (negative energy)
      {
        name: "Batch Bad Card",
        type: "Unit",
        super_types: [],
        domains: ["Order"],
        might: -5,
        energy: 2,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "BATCH-004",
        printings: [],
      },
    ]);

    expect(result.unchanged).toBe(1);
    expect(result.updates).toBe(1);
    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Batch Bad Card");
  });

  // ── normalize() branch coverage (via getChangedFields) ──────────────────

  it("treats empty string as equivalent to null for card fields", async () => {
    // Insert with rules_text = null
    await ingestCardSources(db, SOURCE, [
      {
        name: "Normalize Test Card",
        type: "Unit",
        super_types: [],
        domains: ["Calm"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "NORM-001",
        printings: [],
      },
    ]);

    // Re-ingest with rules_text = "" — emptyToNull converts to null, so should be unchanged
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Normalize Test Card",
        type: "Unit",
        super_types: [],
        domains: ["Calm"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: "",
        effect_text: null,
        tags: [],
        source_id: "NORM-001",
        printings: [],
      },
    ]);

    // rules_text "" is converted to null by emptyToNull, so the values match
    expect(result.unchanged).toBe(1);
    expect(result.updates).toBe(0);
  });

  // ── Printing: printingId is null when card cannot be resolved ─────────

  it("inserts printing_source with printingId=null when card name is unresolvable", async () => {
    // Card name "Totally Unknown Card" doesn't match any card normName or alias
    await ingestCardSources(db, SOURCE, [
      {
        name: "Totally Unknown Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "UNKNOWN-001",
        printings: [
          {
            source_id: "UNK-001-P1",
            set_id: "SET-UNK",
            collector_number: 1,
            rarity: "Common",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "normal",
            artist: "Unknown Artist",
            public_code: "UNK-001/100",
            printed_rules_text: null,
            printed_effect_text: null,
          },
        ],
      },
    ]);

    const cs = await db
      .selectFrom("cardSources")
      .select("id")
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "UNKNOWN-001")
      .executeTakeFirstOrThrow();

    const ps = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .executeTakeFirstOrThrow();

    // Card can't be resolved → printingId stays null
    expect(ps.printingId).toBeNull();
  });

  // ── source_entity_id and optional fields ────────────────────────────────

  it("stores source_entity_id on card_source and printing_source", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Entity ID Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "ENTITY-001",
        source_entity_id: "entity-abc-123",
        printings: [
          {
            source_id: "ENTITY-001-P1",
            set_id: "SET-E",
            collector_number: 1,
            rarity: "Common",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "normal",
            artist: "Entity Artist",
            public_code: "E-001/100",
            printed_rules_text: null,
            printed_effect_text: null,
            source_entity_id: "entity-print-456",
          },
        ],
      },
    ]);

    expect(result.newCards).toBe(1);

    const cs = await db
      .selectFrom("cardSources")
      .selectAll()
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "ENTITY-001")
      .executeTakeFirstOrThrow();
    expect(cs.sourceEntityId).toBe("entity-abc-123");

    const ps = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(ps.sourceEntityId).toBe("entity-print-456");
  });

  // ── Printing with flavor_text and set_name ──────────────────────────────

  it("stores optional printing fields: flavor_text, set_name, image_url", async () => {
    await ingestCardSources(db, SOURCE, [
      {
        name: "Full Printing Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "FULL-PRINT-001",
        printings: [
          {
            source_id: "FP-001-P1",
            set_id: "SET-FP",
            set_name: "Full Print Set",
            collector_number: 7,
            rarity: "Rare",
            art_variant: "altart",
            is_signed: true,
            is_promo: true,
            finish: "foil",
            artist: "Full Print Artist",
            public_code: "FP-001/200",
            printed_rules_text: "Printed rules here.",
            printed_effect_text: "Printed effect here.",
            image_url: "https://example.com/full.png",
            flavor_text: "A fiery blaze illuminates the night.",
          },
        ],
      },
    ]);

    const cs = await db
      .selectFrom("cardSources")
      .select("id")
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "FULL-PRINT-001")
      .executeTakeFirstOrThrow();

    const ps = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "=", cs.id)
      .executeTakeFirstOrThrow();

    expect(ps.setName).toBe("Full Print Set");
    expect(ps.flavorText).toBe("A fiery blaze illuminates the night.");
    expect(ps.imageUrl).toBe("https://example.com/full.png");
    expect(ps.printedRulesText).toBe("Printed rules here.");
    expect(ps.printedEffectText).toBe("Printed effect here.");
    expect(ps.isSigned).toBe(true);
    expect(ps.isPromo).toBe(true);
    expect(ps.finish).toBe("foil");
    expect(ps.artVariant).toBe("altart");
  });

  // ── Validation: printing with collector_number=0 is caught by Zod ─────

  it("records printing validation error for collector_number=0", async () => {
    const result = await ingestCardSources(db, SOURCE, [
      {
        name: "Zero Collector Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        might_bonus: null,
        rules_text: null,
        effect_text: null,
        tags: [],
        source_id: "ZEROCOL-001",
        printings: [
          {
            source_id: "ZEROCOL-001-P1",
            set_id: "SET-ZC",
            collector_number: 0,
            rarity: "Common",
            art_variant: "normal",
            is_signed: false,
            is_promo: false,
            finish: "normal",
            artist: "ZC Artist",
            public_code: "ZC-001/100",
            printed_rules_text: null,
            printed_effect_text: null,
          },
        ],
      },
    ]);

    // Card is inserted, but printing fails Zod validation
    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("ZEROCOL-001-P1");
    expect(result.errors[0]).toContain("collector_number");

    // Verify no printing_source was created
    const cs = await db
      .selectFrom("cardSources")
      .select("id")
      .where("source", "=", SOURCE)
      .where("sourceId", "=", "ZEROCOL-001")
      .executeTakeFirstOrThrow();
    const ps = await db
      .selectFrom("printingSources")
      .where("cardSourceId", "=", cs.id)
      .selectAll()
      .execute();
    expect(ps).toHaveLength(0);
  });
});
