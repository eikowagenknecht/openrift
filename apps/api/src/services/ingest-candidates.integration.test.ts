import { beforeAll, describe, expect, it } from "vitest";

import type { IngestCard, IngestPrinting } from "../routes/admin/card-sources/schemas.js";
import { createTestContext } from "../test/integration-context.js";
import { ingestCandidates } from "./ingest-candidates.js";

// Helpers — default external_id from short_code (cards) or short_code (printings)
// so every test object satisfies the NOT NULL constraint without repeating it.
type CardInput = Omit<IngestCard, "external_id" | "printings"> & {
  external_id?: string;
  printings?: PrintingInput[];
};
type PrintingInput = Omit<IngestPrinting, "external_id"> & { external_id?: string };

function card(input: CardInput): IngestCard {
  return {
    ...input,
    external_id: input.external_id ?? input.short_code ?? input.name,
    printings: (input.printings ?? []).map((p) => ({
      ...p,
      external_id: p.external_id ?? p.short_code,
    })),
  };
}

// ---------------------------------------------------------------------------
// Integration tests: ingestCandidates service
//
// Uses the shared integration database (same as price-refresh tests).
// Reuses user 0022 solely for the DB handle — this service has no user scope.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0022-4000-a000-000000000001";
const ctx = createTestContext(USER_ID);

// Unique source name to avoid collisions with seed data / other tests
const SOURCE = "ingest-test";

describe.skipIf(!ctx)("ingestCandidates integration", () => {
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
      .deleteFrom("candidatePrintings")
      .where(
        "candidateCardId",
        "in",
        db.selectFrom("candidateCards").select("id").where("provider", "=", SOURCE),
      )
      .execute();
    await db.deleteFrom("candidateCards").where("provider", "=", SOURCE).execute();

    // Also clean up the "ingest-test-batch" source used in the batch test
    await db
      .deleteFrom("candidatePrintings")
      .where(
        "candidateCardId",
        "in",
        db.selectFrom("candidateCards").select("id").where("provider", "=", "ingest-test-batch"),
      )
      .execute();
    await db.deleteFrom("candidateCards").where("provider", "=", "ingest-test-batch").execute();

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
        shortCode: "IGT-001",
        collectorNumber: 1,
        rarity: "Common",
        artVariant: "normal",
        isSigned: false,
        promoTypeId: null,
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
    await expect(ingestCandidates(db, "", [])).rejects.toThrow("provider name must not be empty");
    await expect(ingestCandidates(db, "   ", [])).rejects.toThrow(
      "provider name must not be empty",
    );
  });

  it("returns zeros for empty cards array", async () => {
    const result = await ingestCandidates(db, SOURCE, []);
    expect(result).toEqual({
      newCards: 0,
      updates: 0,
      unchanged: 0,
      errors: [],
      updatedCards: [],
    });
  });

  // ── Insert new card sources ─────────────────────────────────────────────

  it("inserts a new candidate_card with no printings", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "SOLO-001",
        printings: [],
      }),
    ]);

    expect(result.newCards).toBe(1);
    expect(result.updates).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify in DB
    const row = await db
      .selectFrom("candidateCards")
      .selectAll()
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "SOLO-001")
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row?.name).toBe("Solo Card");
    expect(row?.type).toBe("Unit");
    expect(row?.might).toBe(3);
  });

  it("inserts a new candidate_card with printings", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "CWP-001",
        printings: [
          {
            short_code: "CWP-001-P1",
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
      }),
    ]);

    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify candidate_printing was inserted
    const cs = await db
      .selectFrom("candidateCards")
      .selectAll()
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "CWP-001")
      .executeTakeFirstOrThrow();

    const ps = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .execute();
    expect(ps).toHaveLength(1);
    expect(ps[0].shortCode).toBe("CWP-001-P1");
    expect(ps[0].artist).toBe("Bob Ross");
    expect(ps[0].imageUrl).toBe("https://example.com/img.png");
  });

  // ── Update existing card source ─────────────────────────────────────────

  it("updates an existing candidate_card when fields change", async () => {
    // First ingest
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "EVO-001",
        printings: [],
      }),
    ]);

    // Second ingest with changed fields
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "EVO-001",
        printings: [],
      }),
    ]);

    expect(result.updates).toBe(1);
    expect(result.newCards).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.updatedCards).toHaveLength(1);
    expect(result.updatedCards[0].name).toBe("Evolving Card");
    expect(result.updatedCards[0].shortCode).toBe("EVO-001");

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

  it("returns unchanged when candidate_card has not changed", async () => {
    // First ingest
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "STABLE-001",
        printings: [],
      }),
    ]);

    // Second ingest with identical data
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "STABLE-001",
        printings: [],
      }),
    ]);

    expect(result.unchanged).toBe(1);
    expect(result.updates).toBe(0);
    expect(result.newCards).toBe(0);
  });

  // ── Validation errors ───────────────────────────────────────────────────

  it("records validation error for card with negative might", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "BAD-001",
        printings: [],
      }),
    ]);

    expect(result.newCards).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Bad Might Card");
    expect(result.errors[0]).toContain("might");
  });

  it("records validation error for card with empty name", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "BAD-002",
        printings: [],
      }),
    ]);

    expect(result.newCards).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("name");
  });

  it("records validation error for printing with empty short_code", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "BADPRINT-001",
        printings: [
          {
            short_code: "",
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
      }),
    ]);

    // The card itself is inserted successfully, but the printing fails validation
    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("short_code");
  });

  // ── Printing updates ────────────────────────────────────────────────────

  it("updates candidate_printing when fields change", async () => {
    // First ingest with a printing
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "PU-001",
        printings: [
          {
            short_code: "PU-001-P1",
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
      }),
    ]);

    // Get the initial candidate_printing
    const cs = await db
      .selectFrom("candidateCards")
      .select("id")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "PU-001")
      .executeTakeFirstOrThrow();
    const psBefore = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(psBefore.artist).toBe("Original Artist");

    // Second ingest with changed artist
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "PU-001",
        printings: [
          {
            short_code: "PU-001-P1",
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
      }),
    ]);

    const psAfter = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(psAfter.artist).toBe("New Artist");
    expect(psAfter.updatedAt.getTime()).toBeGreaterThan(psBefore.updatedAt.getTime());
  });

  it("does not update candidate_printing when nothing changed", async () => {
    // First ingest
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "PS-001",
        printings: [
          {
            short_code: "PS-001-P1",
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
      }),
    ]);

    const cs = await db
      .selectFrom("candidateCards")
      .select("id")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "PS-001")
      .executeTakeFirstOrThrow();
    const psBefore = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();

    // Second ingest with identical data
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "PS-001",
        printings: [
          {
            short_code: "PS-001-P1",
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
      }),
    ]);

    const psAfter = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();
    // updatedAt should NOT have changed (no write occurred)
    expect(psAfter.updatedAt.getTime()).toBe(psBefore.updatedAt.getTime());
  });

  // ── Card resolution ─────────────────────────────────────────────────────

  it("resolves card by normName and assigns printingId to candidate_printing", async () => {
    // "Ingest Alpha" normalizes to "ingestalpha" which matches our seed card
    // The printing slug "IGT-001:common:normal:" should match our seed printing
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "RESOLVE-001",
        printings: [
          {
            short_code: "IGT-001",
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
      }),
    ]);

    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(0);

    const cs = await db
      .selectFrom("candidateCards")
      .select("id")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "RESOLVE-001")
      .executeTakeFirstOrThrow();

    const ps = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();

    // The candidate_printing should have been linked to our seed printing
    expect(ps.printingId).toBe(seedPrintingId);
  });

  it("resolves card by alias when normName does not match directly", async () => {
    // "Ingest Beta Alias" normalizes to "ingestbetaalias" which matches the alias we seeded
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "ALIAS-001",
        printings: [],
      }),
    ]);

    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  // ── Lookup by short_code vs name ─────────────────────────────────────────

  it("finds existing candidate_card by short_code rather than name", async () => {
    // Insert with short_code
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "SID-LOOKUP",
        printings: [],
      }),
    ]);

    // Re-ingest same short_code but different name — should update, not insert
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "SID-LOOKUP",
        printings: [],
      }),
    ]);

    expect(result.newCards).toBe(0);
    expect(result.updates).toBe(1);
    expect(result.updatedCards[0].fields.some((f) => f.field === "name")).toBe(true);

    // Verify only one candidate_card exists for this short_code
    const rows = await db
      .selectFrom("candidateCards")
      .selectAll()
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "SID-LOOKUP")
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Name Two");
  });

  it("finds existing candidate_card by name when short_code is absent", async () => {
    // Insert without short_code
    await ingestCandidates(db, SOURCE, [
      card({
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
      }),
    ]);

    // Re-ingest same name — should be unchanged (not a new insert)
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
      }),
    ]);

    expect(result.unchanged).toBe(1);
    expect(result.newCards).toBe(0);
  });

  // ── jsonOrNull / extra_data handling ─────────────────────────────────────

  it("stores extra_data as null when given an empty object", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "EXTRA-001",
        extra_data: {},
        printings: [],
      }),
    ]);

    expect(result.newCards).toBe(1);

    const row = await db
      .selectFrom("candidateCards")
      .select("extraData")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "EXTRA-001")
      .executeTakeFirstOrThrow();
    expect(row.extraData).toBeNull();
  });

  it("stores non-empty extra_data as-is", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "EXTRA-002",
        extra_data: { foo: "bar", count: 42 },
        printings: [],
      }),
    ]);

    expect(result.newCards).toBe(1);

    const row = await db
      .selectFrom("candidateCards")
      .select("extraData")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "EXTRA-002")
      .executeTakeFirstOrThrow();
    expect(row.extraData).toEqual({ foo: "bar", count: 42 });
  });

  // ── Batch with mixed results ────────────────────────────────────────────

  it("handles a batch with mixed new, updated, unchanged, and errored cards", async () => {
    const batchSource = "ingest-test-batch";

    // Phase 1: insert two cards
    await ingestCandidates(db, batchSource, [
      card({
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
        short_code: "BATCH-001",
        printings: [],
      }),
      card({
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
        short_code: "BATCH-002",
        printings: [],
      }),
    ]);

    // Phase 2: mixed batch
    const result = await ingestCandidates(db, batchSource, [
      // Unchanged
      card({
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
        short_code: "BATCH-001",
        printings: [],
      }),
      // Updated (changed energy from 3 → 5; energy is a snake_case-matching field)
      card({
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
        short_code: "BATCH-002",
        printings: [],
      }),
      // New card
      card({
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
        short_code: "BATCH-003",
        printings: [],
      }),
      // Validation error (negative energy)
      card({
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
        short_code: "BATCH-004",
        printings: [],
      }),
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
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "NORM-001",
        printings: [],
      }),
    ]);

    // Re-ingest with rules_text = "" — emptyToNull converts to null, so should be unchanged
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "NORM-001",
        printings: [],
      }),
    ]);

    // rules_text "" is converted to null by emptyToNull, so the values match
    expect(result.unchanged).toBe(1);
    expect(result.updates).toBe(0);
  });

  // ── Printing: printingId is null when card cannot be resolved ─────────

  it("inserts candidate_printing with printingId=null when card name is unresolvable", async () => {
    // Card name "Totally Unknown Card" doesn't match any card normName or alias
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "UNKNOWN-001",
        printings: [
          {
            short_code: "UNK-001-P1",
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
      }),
    ]);

    const cs = await db
      .selectFrom("candidateCards")
      .select("id")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "UNKNOWN-001")
      .executeTakeFirstOrThrow();

    const ps = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();

    // Card can't be resolved → printingId stays null
    expect(ps.printingId).toBeNull();
  });

  // ── external_id and optional fields ────────────────────────────────

  it("stores external_id on candidate_card and candidate_printing", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "ENTITY-001",
        external_id: "entity-abc-123",
        printings: [
          {
            short_code: "ENTITY-001-P1",
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
            external_id: "entity-print-456",
          },
        ],
      }),
    ]);

    expect(result.newCards).toBe(1);

    const cs = await db
      .selectFrom("candidateCards")
      .selectAll()
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "ENTITY-001")
      .executeTakeFirstOrThrow();
    expect(cs.externalId).toBe("entity-abc-123");

    const ps = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(ps.externalId).toBe("entity-print-456");
  });

  // ── Printing with flavor_text and set_name ──────────────────────────────

  it("stores optional printing fields: flavor_text, set_name, image_url", async () => {
    await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "FULL-PRINT-001",
        printings: [
          {
            short_code: "FP-001-P1",
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
      }),
    ]);

    const cs = await db
      .selectFrom("candidateCards")
      .select("id")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "FULL-PRINT-001")
      .executeTakeFirstOrThrow();

    const ps = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();

    expect(ps.setName).toBe("Full Print Set");
    expect(ps.flavorText).toBe("A fiery blaze illuminates the night.");
    expect(ps.imageUrl).toBe("https://example.com/full.png");
    expect(ps.printedRulesText).toBe("Printed rules here.");
    expect(ps.printedEffectText).toBe("Printed effect here.");
    expect(ps.isSigned).toBe(true);
    expect(ps.promoTypeId).not.toBeNull();
    expect(ps.finish).toBe("foil");
    expect(ps.artVariant).toBe("altart");
  });

  // ── Validation: printing with collector_number=0 is caught by Zod ─────

  it("records printing validation error for collector_number=0", async () => {
    const result = await ingestCandidates(db, SOURCE, [
      card({
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
        short_code: "ZEROCOL-001",
        printings: [
          {
            short_code: "ZEROCOL-001-P1",
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
      }),
    ]);

    // Card is inserted, but printing fails Zod validation
    expect(result.newCards).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("ZEROCOL-001-P1");
    expect(result.errors[0]).toContain("collector_number");

    // Verify no candidate_printing was created
    const cs = await db
      .selectFrom("candidateCards")
      .select("id")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "ZEROCOL-001")
      .executeTakeFirstOrThrow();
    const ps = await db
      .selectFrom("candidatePrintings")
      .where("candidateCardId", "=", cs.id)
      .selectAll()
      .execute();
    expect(ps).toHaveLength(0);
  });
});
