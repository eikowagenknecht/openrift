import { beforeAll, describe, expect, it } from "vitest";

import { createTransact } from "../deps.js";
import type { IngestCard, IngestPrinting } from "../routes/admin/cards/schemas.js";
import { createTestContext, syncCardCardTypes } from "../test/integration-context.js";
import { ingestCandidates } from "./ingest-candidates.js";

// A test spells only the fields it asserts on; these helpers fill the rest
// with the same defaults `ingestCardFieldsSchema` / `ingestPrintingSchema`
// apply, including the external_id every candidate row needs (NOT NULL).
type CardInput = Partial<Omit<IngestCard, "printings">> &
  Pick<IngestCard, "name"> & { printings?: readonly PrintingInput[] };
type PrintingInput = Partial<IngestPrinting> & Pick<IngestPrinting, "short_code">;

function card(input: CardInput): IngestCard {
  return {
    types: [],
    super_types: [],
    domains: [],
    might: null,
    energy: null,
    power: null,
    might_bonus: null,
    rules_text: null,
    effect_text: null,
    tags: [],
    short_code: null,
    extra_data: null,
    ...input,
    external_id: input.external_id ?? input.short_code ?? input.name,
    printings: (input.printings ?? []).map((p) => printing(p)),
  };
}

function printing(input: PrintingInput): IngestPrinting {
  return {
    set_id: null,
    set_name: null,
    rarity: null,
    art_variant: null,
    is_signed: false,
    marker_slugs: [],
    distribution_channel_slugs: [],
    finish: null,
    size: null,
    artist: null,
    public_code: null,
    printed_rules_text: null,
    printed_effect_text: null,
    image_url: null,
    flavor_text: null,
    extra_data: null,
    language: null,
    printed_name: null,
    printed_year: null,
    ...input,
    external_id: input.external_id ?? input.short_code,
  };
}

// Reuses user 0022 solely for the DB handle — this service has no user scope.
const USER_ID = "a0000000-0022-4000-a000-000000000001";
const ctx = createTestContext(USER_ID);

// Unique source name to avoid collisions with seed data / other tests
const SOURCE = "ingest-test";

describe.skipIf(!ctx)("ingestCandidates integration", () => {
  const { db } = ctx!;
  const transact = createTransact(db);

  let seedSetId: string;
  let seedCardId: string;
  let seedPrintingId: string;
  let aliasCardId: string;

  beforeAll(async () => {
    await db
      .deleteFrom("candidatePrintings")
      .where(
        "candidateCardId",
        "in",
        db.selectFrom("candidateCards").select("id").where("provider", "=", SOURCE),
      )
      .execute();
    await db.deleteFrom("candidateCards").where("provider", "=", SOURCE).execute();

    await db
      .deleteFrom("candidatePrintings")
      .where(
        "candidateCardId",
        "in",
        db.selectFrom("candidateCards").select("id").where("provider", "=", "ingest-test-batch"),
      )
      .execute();
    await db.deleteFrom("candidateCards").where("provider", "=", "ingest-test-batch").execute();

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
        type: "unit",
        might: 3,
        energy: 2,
        power: 1,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .onConflict((oc) => oc.column("slug").doUpdateSet({ name: "Ingest Alpha" }))
      .returning("id")
      .executeTakeFirstOrThrow();
    seedCardId = insertedCard.id;

    await db
      .insertInto("cardDomains")
      .values({ cardId: seedCardId, domainSlug: "fury", ordinal: 0 })
      .onConflict((oc) => oc.columns(["cardId", "domainSlug"]).doNothing())
      .execute();
    await syncCardCardTypes(db);

    // uq_printings_identity is DEFERRABLE and so cannot be used as an
    // ON CONFLICT arbiter; do a select-or-insert dance instead.
    const existingPrinting = await db
      .selectFrom("printings")
      .select("id")
      .where("cardId", "=", seedCardId)
      .where("shortCode", "=", "IGT-001")
      .where("finish", "=", "normal")
      .where("language", "=", "EN")
      .executeTakeFirst();
    if (existingPrinting) {
      seedPrintingId = existingPrinting.id;
    } else {
      const insertedPrinting = await db
        .insertInto("printings")
        .values({
          cardId: seedCardId,
          setId: seedSetId,
          shortCode: "IGT-001",
          rarity: "common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          size: "standard",
          language: "EN",
          artist: "Test Artist",
          publicCode: "IGT-001/010",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      seedPrintingId = insertedPrinting.id;
    }

    // Seed a second card only reachable via alias (normName won't match)
    const insertedAliasCard = await db
      .insertInto("cards")
      .values({
        slug: "IGT-002",
        name: "Ingest Beta Original",
        type: "spell",
        might: null,
        energy: 4,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .onConflict((oc) => oc.column("slug").doUpdateSet({ name: "Ingest Beta Original" }))
      .returning("id")
      .executeTakeFirstOrThrow();
    aliasCardId = insertedAliasCard.id;

    await db
      .insertInto("cardDomains")
      .values({ cardId: aliasCardId, domainSlug: "mind", ordinal: 0 })
      .onConflict((oc) => oc.columns(["cardId", "domainSlug"]).doNothing())
      .execute();
    await syncCardCardTypes(db);

    await db
      .insertInto("cardNameAliases")
      .values({ normName: "ingestbetaalias", cardId: aliasCardId })
      .onConflict((oc) => oc.column("normName").doNothing())
      .execute();
  });

  it("throws on empty source name", async () => {
    await expect(ingestCandidates(transact, "", [])).rejects.toThrow(
      "provider name must not be empty",
    );
    await expect(ingestCandidates(transact, "   ", [])).rejects.toThrow(
      "provider name must not be empty",
    );
  });

  it("returns zeros for empty cards array", async () => {
    const result = await ingestCandidates(transact, SOURCE, []);
    expect(result).toEqual({
      provider: SOURCE,
      newCards: 0,
      removedCards: 0,
      updates: 0,
      unchanged: 0,
      newPrintings: 0,
      removedPrintings: 0,
      printingUpdates: 0,
      printingsUnchanged: 0,
      errors: [],
      updatedCards: [],
      updatedPrintings: [],
      newCardDetails: [],
      newPrintingDetails: [],
      removedCardDetails: [],
      removedPrintingDetails: [],
    });
  });

  it("inserts a new candidate_card with no printings", async () => {
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Solo Card",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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

    const row = await db
      .selectFrom("candidateCards")
      .selectAll()
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "SOLO-001")
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row?.name).toBe("Solo Card");
    expect(row?.types).toEqual(["unit"]);
    expect(row?.might).toBe(3);
  });

  it("inserts a new candidate_card with printings", async () => {
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Card With Printings",
        types: ["spell"],
        super_types: [],
        domains: ["mind"],
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
            rarity: "common",
            art_variant: "normal",
            is_signed: false,
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

  it("updates an existing candidate_card when fields change", async () => {
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Evolving Card",
        types: ["unit"],
        super_types: [],
        domains: ["body"],
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

    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Evolving Card",
        types: ["unit"],
        super_types: ["champion"],
        domains: ["body"],
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

    const mightDiff = result.updatedCards[0].fields.find((f) => f.field === "might");
    expect(mightDiff?.from).toBe(2);
    expect(mightDiff?.to).toBe(5);
  });

  it("serializes non-scalar (extra_data) field diffs to a JSON string", async () => {
    // extra_data is an arbitrary JSON object, but the response contract's
    // diffValueSchema only accepts scalars / scalar[]. Emitting the raw object
    // makes the upload endpoint fail output validation with a 500, so the diff
    // value must be coerced to a serializable scalar.
    const base = {
      name: "Extra Card",
      types: ["unit"],
      super_types: [] as string[],
      domains: ["mind"],
      might: 1,
      energy: 1,
      power: 1,
      might_bonus: null,
      rules_text: null,
      effect_text: null,
      tags: [] as string[],
      short_code: "EXT-001",
    };

    await ingestCandidates(transact, SOURCE, [card({ ...base, extra_data: { rank: "gold" } })]);
    const result = await ingestCandidates(transact, SOURCE, [
      card({ ...base, extra_data: { rank: "platinum" } }),
    ]);

    expect(result.updates).toBe(1);
    const extraDiff = result.updatedCards[0].fields.find((f) => f.field === "extraData");
    expect(extraDiff).toBeDefined();
    // Coerced to a scalar string, not the raw object.
    expect(typeof extraDiff?.from).toBe("string");
    expect(typeof extraDiff?.to).toBe("string");
    expect(JSON.parse(extraDiff?.to as string)).toEqual({ rank: "platinum" });
  });

  it("returns unchanged when candidate_card has not changed", async () => {
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Stable Card",
        types: ["rune"],
        super_types: [],
        domains: ["order"],
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

    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Stable Card",
        types: ["rune"],
        super_types: [],
        domains: ["order"],
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

  it("records validation error for card with negative might", async () => {
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Bad Might Card",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Valid Card With Bad Printing",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
            rarity: "common",
            art_variant: "normal",
            is_signed: false,
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

  it("updates candidate_printing when fields change", async () => {
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Print Update Card",
        types: ["unit"],
        super_types: [],
        domains: ["chaos"],
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
            rarity: "uncommon",
            art_variant: "normal",
            is_signed: false,
            finish: "normal",
            artist: "Original Artist",
            public_code: "PU-001/050",
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
      .where("shortCode", "=", "PU-001")
      .executeTakeFirstOrThrow();
    const psBefore = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(psBefore.artist).toBe("Original Artist");

    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Print Update Card",
        types: ["unit"],
        super_types: [],
        domains: ["chaos"],
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
            rarity: "uncommon",
            art_variant: "normal",
            is_signed: false,
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
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Print Stable Card",
        types: ["gear"],
        super_types: [],
        domains: ["order"],
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
            rarity: "rare",
            art_variant: "normal",
            is_signed: false,
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

    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Print Stable Card",
        types: ["gear"],
        super_types: [],
        domains: ["order"],
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
            rarity: "rare",
            art_variant: "normal",
            is_signed: false,
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

  it("resolves card by normName and assigns printingId to candidate_printing", async () => {
    // "Ingest Alpha" normalizes to "ingestalpha" which matches our seed card
    // The printing key "IGT-001:normal:" should match our seed printing
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Ingest Alpha",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
            rarity: "common",
            art_variant: "normal",
            is_signed: false,
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

    expect(ps.printingId).toBe(seedPrintingId);
  });

  it("resolves card by alias when normName does not match directly", async () => {
    // "Ingest Beta Alias" normalizes to "ingestbetaalias" which matches the alias we seeded
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Ingest Beta Alias",
        types: ["spell"],
        super_types: [],
        domains: ["calm"],
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

  it("finds existing candidate_card by short_code rather than name", async () => {
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Name One",
        types: ["unit"],
        super_types: [],
        domains: ["mind"],
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
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Name Two",
        types: ["unit"],
        super_types: [],
        domains: ["mind"],
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
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Name Only Card",
        types: ["unit"],
        super_types: [],
        domains: ["chaos"],
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
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Name Only Card",
        types: ["unit"],
        super_types: [],
        domains: ["chaos"],
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

  it("stores extra_data as null when given an empty object", async () => {
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Extra Data Empty Card",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Extra Data Real Card",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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

  it("handles a batch with mixed new, updated, unchanged, and errored cards", async () => {
    const batchSource = "ingest-test-batch";

    await ingestCandidates(transact, batchSource, [
      card({
        name: "Batch Unchanged",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
        types: ["spell"],
        super_types: [],
        domains: ["mind"],
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

    const result = await ingestCandidates(transact, batchSource, [
      // Unchanged
      card({
        name: "Batch Unchanged",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
        types: ["spell"],
        super_types: [],
        domains: ["mind"],
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
        types: ["gear"],
        super_types: [],
        domains: ["body"],
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
        types: ["unit"],
        super_types: [],
        domains: ["order"],
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

  it("treats empty string as equivalent to null for card fields", async () => {
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Normalize Test Card",
        types: ["unit"],
        super_types: [],
        domains: ["calm"],
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
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Normalize Test Card",
        types: ["unit"],
        super_types: [],
        domains: ["calm"],
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

    expect(result.unchanged).toBe(1);
    expect(result.updates).toBe(0);
  });

  it("inserts candidate_printing with printingId=null when card name is unresolvable", async () => {
    // Card name "Totally Unknown Card" doesn't match any card normName or alias
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Totally Unknown Card",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
            rarity: "common",
            art_variant: "normal",
            is_signed: false,
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

    expect(ps.printingId).toBeNull();
  });

  it("stores external_id on candidate_card and candidate_printing", async () => {
    const result = await ingestCandidates(transact, SOURCE, [
      card({
        name: "Entity ID Card",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
            rarity: "common",
            art_variant: "normal",
            is_signed: false,
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

  it("stores optional printing fields: flavor_text, set_name, image_url", async () => {
    await ingestCandidates(transact, SOURCE, [
      card({
        name: "Full Printing Card",
        types: ["unit"],
        super_types: [],
        domains: ["fury"],
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
            rarity: "rare",
            art_variant: "altart",
            is_signed: true,
            marker_slugs: ["promo"],
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
    expect(ps.markerSlugs).toEqual(["promo"]);
    expect(ps.finish).toBe("foil");
    expect(ps.artVariant).toBe("altart");
  });

  it("stores printed_year and reports it in the diff when a re-upload changes it", async () => {
    const upload = (printedYear: number | null) =>
      ingestCandidates(transact, SOURCE, [
        card({
          name: "Printed Year Card",
          types: ["unit"],
          domains: ["fury"],
          short_code: "PY-001",
          printings: [
            {
              short_code: "PY-001-P1",
              set_id: "SET-PY",
              rarity: "rare",
              finish: "normal",
              artist: "Printed Year Artist",
              public_code: "PY-001/100",
              printed_year: printedYear,
            },
          ],
        }),
      ]);

    await upload(2024);

    const cs = await db
      .selectFrom("candidateCards")
      .select("id")
      .where("provider", "=", SOURCE)
      .where("shortCode", "=", "PY-001")
      .executeTakeFirstOrThrow();
    const before = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(before.printedYear).toBe(2024);

    // A re-upload that changes only printed_year must be detected as an update
    // (it goes through the same per-field diff as every other printing column).
    const result = await upload(2025);
    expect(result.printingUpdates).toBe(1);
    expect(result.updatedPrintings[0].fields).toEqual([
      { field: "printedYear", from: 2024, to: 2025 },
    ]);

    const after = await db
      .selectFrom("candidatePrintings")
      .selectAll()
      .where("candidateCardId", "=", cs.id)
      .executeTakeFirstOrThrow();
    expect(after.printedYear).toBe(2025);
  });
});
