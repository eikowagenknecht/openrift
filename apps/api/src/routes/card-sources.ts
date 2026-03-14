// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { join } from "node:path";

import { zValidator } from "@hono/zod-validator";
import type { Database } from "@openrift/shared/db";
import { extractKeywords } from "@openrift/shared/keywords";
import type { CardType, Finish, Rarity } from "@openrift/shared/types";
import { RARITY_ORDER } from "@openrift/shared/types";
import { buildPrintingId, normalizeNameForMatching } from "@openrift/shared/utils";
import { Hono } from "hono";
import type { SqlBool, Transaction } from "kysely";
import { sql } from "kysely";
import { z } from "zod";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import {
  CARD_IMAGES_DIR,
  deleteRehostFiles,
  downloadImage,
  printingIdToFileBase,
  processAndSave,
  renameRehostFiles,
} from "../services/image-rehost.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { ingestCardSources } from "../services/ingest-card-sources.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

// Resolve card_id dynamically: direct card name match → alias match.
// card_sources no longer stores card_id — matching is always derived from the
// card name or a previously-created card_name_alias.
// Uses indexed norm_name columns for fast equality lookups.
const resolveCardId = (alias: string) =>
  sql`COALESCE(
    (SELECT c_res.id FROM cards c_res WHERE c_res.norm_name = ${sql.ref(`${alias}.norm_name`)} LIMIT 1),
    (SELECT cna_res.card_id FROM card_name_aliases cna_res WHERE cna_res.norm_name = ${sql.ref(`${alias}.norm_name`)} LIMIT 1),
    (SELECT p_res.card_id FROM printing_sources ps_res JOIN printings p_res ON p_res.source_id = ps_res.source_id JOIN card_sources cs_res ON cs_res.id = ps_res.card_source_id WHERE cs_res.norm_name = ${sql.ref(`${alias}.norm_name`)} LIMIT 1)
  )`;

// ── Helpers (inlined from packages/shared/src/services/card-source-helpers.ts) ─

/** Upsert a set by ID, inserting it with the next sort_order if it doesn't exist. */
async function upsertSet(
  trx: Transaction<Database>,
  setSlug: string,
  setName: string,
): Promise<void> {
  const existing = await trx
    .selectFrom("sets")
    .select("id")
    .where("slug", "=", setSlug)
    .executeTakeFirst();

  if (!existing) {
    const { max } = await trx
      .selectFrom("sets")
      .select((eb) => eb.fn.coalesce(eb.fn.max("sort_order"), eb.lit(0)).as("max"))
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("sets")
      .values({ slug: setSlug, name: setName, printed_total: 0, sort_order: max + 1 })
      .execute();
  }
}

/**
 * Insert an image record into printing_images.
 *
 * @param mode - `'main'`: deactivate current active image, insert/update as active.
 *               `'additional'`: insert as inactive.
 */
async function insertPrintingImage(
  trx: Transaction<Database>,
  printingId: string,
  imageUrl: string | null,
  source: string,
  mode: "main" | "additional" = "main",
): Promise<void> {
  if (!imageUrl) {
    return;
  }

  if (mode === "main") {
    // Deactivate current active front image
    await trx
      .updateTable("printing_images")
      .set({ is_active: false, updated_at: new Date() })
      .where("printing_id", "=", printingId)
      .where("face", "=", "front")
      .where("is_active", "=", true)
      .execute();

    // Insert or update as active
    await trx
      .insertInto("printing_images")
      .values({
        printing_id: printingId,
        face: "front",
        source,
        original_url: imageUrl,
        is_active: true,
      })
      .onConflict((oc) =>
        oc.columns(["printing_id", "face", "source"]).doUpdateSet({
          original_url: imageUrl,
          is_active: true,
          updated_at: new Date(),
        }),
      )
      .execute();
  } else {
    // Insert as inactive additional image
    await trx
      .insertInto("printing_images")
      .values({
        printing_id: printingId,
        face: "front",
        source,
        original_url: imageUrl,
        is_active: false,
      })
      .onConflict((oc) =>
        oc.columns(["printing_id", "face", "source"]).doUpdateSet({
          original_url: imageUrl,
          updated_at: new Date(),
        }),
      )
      .execute();
  }
}

/**
 * Create a new card from source data,
 * then link all card_sources with the given normalized name to the new card.
 * Printings are accepted separately via acceptNewPrintingFromSource.
 */
async function acceptNewCardFromSources(
  trx: Transaction<Database>,
  cardFields: {
    id: string;
    name: string;
    type: CardType;
    superTypes: string[];
    domains: string[];
    might: number | null;
    energy: number | null;
    power: number | null;
    mightBonus: number | null;
    rulesText: string | null;
    effectText: string | null;
    tags: string[];
  },
  normalizedName: string,
): Promise<void> {
  const keywords = [
    ...extractKeywords(cardFields.rulesText ?? ""),
    ...extractKeywords(cardFields.effectText ?? ""),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const { id: cardUuid } = await trx
    .insertInto("cards")
    .values({
      slug: cardFields.id,
      name: cardFields.name,
      type: cardFields.type,
      super_types: cardFields.superTypes,
      domains: cardFields.domains,
      might: cardFields.might,
      energy: cardFields.energy,
      power: cardFields.power,
      might_bonus: cardFields.mightBonus,
      keywords,
      rules_text: cardFields.rulesText,
      effect_text: cardFields.effectText,
      tags: cardFields.tags,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // Link all card_sources with matching normalized name to the new card
  await createNameAliases(trx, normalizedName, cardUuid);
}

/**
 * Create name aliases for every distinct spelling of the normalized name,
 * so that resolveCardId() can match card_sources to this card dynamically.
 */
async function createNameAliases(
  trx: Transaction<Database>,
  normalizedName: string,
  cardId: string,
): Promise<void> {
  await trx
    .insertInto("card_name_aliases")
    .values({ norm_name: normalizedName, card_id: cardId })
    .onConflict((oc) => oc.column("norm_name").doUpdateSet({ card_id: cardId }))
    .execute();
}

// ── Zod schemas for request validation ──────────────────────────────────────

const cardSourcesQuerySchema = z.object({
  filter: z.string().optional(),
  source: z.string().optional(),
});

const checkAllPrintingSourcesSchema = z.object({
  printingId: z.string(),
  extraIds: z.array(z.string()).optional(),
});

const patchPrintingSourceSchema = z.object({
  artVariant: z.string().optional(),
  isSigned: z.boolean().optional(),
  finish: z.string().optional(),
  collectorNumber: z.number().optional(),
  setId: z.string().optional(),
  sourceId: z.string().optional(),
  rarity: z.string().optional(),
});

const copyPrintingSourceSchema = z.object({
  printingId: z.string(),
});

const linkPrintingSourcesSchema = z.object({
  printingSourceIds: z.array(z.string()),
  printingId: z.string().nullable(),
});

const renameSchema = z.object({
  newId: z.string(),
});

const acceptFieldSchema = z.object({
  field: z.string(),
  value: z.unknown(),
});

const acceptNewCardSchema = z.object({
  cardFields: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]),
    superTypes: z.array(z.string()),
    domains: z.array(z.string()),
    might: z.number().nullable(),
    energy: z.number().nullable(),
    power: z.number().nullable(),
    mightBonus: z.number().nullable(),
    rulesText: z.string().nullable(),
    effectText: z.string().nullable(),
    tags: z.array(z.string()),
  }),
});

const linkUnmatchedSchema = z.object({
  cardId: z.string(),
});

const acceptPrintingSchema = z.object({
  printingFields: z.object({
    id: z.string().optional(),
    sourceId: z.string(),
    setId: z.string().optional(),
    setName: z.string().optional().nullable(),
    collectorNumber: z.number().optional(),
    rarity: z.string().optional().nullable(),
    artVariant: z.string().optional(),
    isSigned: z.boolean().optional(),
    isPromo: z.boolean().optional(),
    finish: z.string().optional(),
    artist: z.string().optional(),
    publicCode: z.string().optional(),
    printedRulesText: z.string().optional(),
    printedEffectText: z.string().optional().nullable(),
    flavorText: z.string().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
  }),
  printingSourceIds: z.array(z.string()),
});

const setImageSchema = z.object({
  mode: z.enum(["main", "additional"]),
});

const activateImageSchema = z.object({
  active: z.boolean(),
});

const addImageUrlSchema = z.object({
  url: z.string(),
  source: z.string().optional(),
  mode: z.enum(["main", "additional"]).optional(),
});

const uploadImageFormSchema = z.object({
  file: z.instanceof(File),
  source: z.string().optional(),
  mode: z.enum(["main", "additional"]).optional(),
});

const uploadCardSourcesSchema = z.object({
  source: z.string(),
  candidates: z.array(
    z.object({
      card: z.record(z.string(), z.unknown()),
      printings: z.array(z.record(z.string(), z.unknown())),
    }),
  ),
});

// ── GET /card-sources/all-cards ──────────────────────────────────────────────
// Lightweight list of all cards for client-side search (link combobox etc.)
export const cardSourcesRoute = new Hono<{ Variables: Variables }>()
  .get("/card-sources/all-cards", async (c) => {
    const rows = await db
      .selectFrom("cards")
      .select(["id", "slug", "name", "type"])
      .orderBy("name")
      .execute();

    return c.json(rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, type: r.type })));
  })

  // ── GET /card-sources/source-names ────────────────────────────────────────────
  // List distinct source names for the combobox on the upload page
  .get("/card-sources/source-names", async (c) => {
    const rows = await db
      .selectFrom("card_sources")
      .select("source")
      .distinct()
      .orderBy("source")
      .execute();

    return c.json(rows.map((r) => r.source));
  })

  // ── GET /card-sources/source-stats ─────────────────────────────────────────────
  // Per-source card and printing counts
  .get("/card-sources/source-stats", async (c) => {
    const rows = await db
      .selectFrom("card_sources as cs")
      .leftJoin("printing_sources as ps", "ps.card_source_id", "cs.id")
      .select((eb) => [
        "cs.source" as const,
        eb.fn.count<number>("cs.name").distinct().as("cardCount"),
        eb.fn.count<number>("ps.id").distinct().as("printingCount"),
        sql<string>`max(greatest(cs.updated_at, coalesce(ps.updated_at, cs.updated_at)))`.as(
          "lastUpdated",
        ),
      ])
      .groupBy("cs.source")
      .orderBy("cs.source")
      .execute();

    return c.json(
      rows.map((r) => ({
        source: r.source,
        cardCount: Number(r.cardCount),
        printingCount: Number(r.printingCount),
        lastUpdated: r.lastUpdated,
      })),
    );
  })

  // ── GET /card-sources ─────────────────────────────────────────────────────────
  // List all cards + unmatched groups with source/unchecked counts
  .get("/card-sources", zValidator("query", cardSourcesQuerySchema), async (c) => {
    const queryParams = c.req.valid("query");
    const filter = queryParams.filter ?? "all";
    const source = queryParams.source;

    // Get summaries grouped by resolved card_id (matched) or name (unmatched).
    // resolveCardId dynamically matches sources to cards by name/alias even when
    // card_sources.card_id is NULL, so re-uploaded sources auto-merge.
    const rcid = resolveCardId("cs");
    let query = db
      .selectFrom("card_sources as cs")
      .leftJoin("printing_sources as ps", "ps.card_source_id", "cs.id")
      .leftJoin("sets as s", "s.slug", "ps.set_id")
      .leftJoin("cards as c", (jb) => jb.on(sql`c.id = (${rcid})`))
      // raw sql: could use fn.count(eb.case()...).distinct() but the sql`` form is
      // much more readable for these multi-condition conditional aggregates
      .select([
        sql<string | null>`max((${rcid})::text)`.as("card_id"),
        sql<string | null>`max(c.slug)`.as("card_slug"),
        sql<string>`COALESCE(max(c.name), min(cs.name))`.as("name"),
        sql<string>`COALESCE((${rcid})::text, cs.norm_name)`.as("groupKey"),
        sql<number>`count(DISTINCT cs.source)`.as("sourceCount"),
        sql<number>`count(DISTINCT CASE WHEN cs.checked_at IS NULL THEN cs.id END)`.as(
          "uncheckedCardCount",
        ),
        sql<number>`count(DISTINCT CASE WHEN ps.checked_at IS NULL AND ps.id IS NOT NULL THEN ps.id END)`.as(
          "uncheckedPrintingCount",
        ),
        sql<boolean>`bool_or(cs.source = 'gallery')`.as("hasGallery"),
        // Sort tier detection: does this card have printings in a released/known/unknown set?
        sql<string | null>`min(s.released_at::text) FILTER (WHERE s.released_at IS NOT NULL)`.as(
          "minReleasedAt",
        ),
        sql<string | null>`min(s.slug) FILTER (WHERE s.released_at IS NOT NULL)`.as(
          "releasedSetSlug",
        ),
        sql<boolean>`bool_or(s.id IS NOT NULL AND s.released_at IS NULL)`.as("hasKnownSet"),
        sql<boolean>`bool_or(ps.id IS NOT NULL AND s.id IS NULL)`.as("hasUnknownSet"),
      ])
      .groupBy(sql`COALESCE((${rcid})::text, cs.norm_name)`);

    if (source) {
      // Only include cards that have at least one card_source from this source.
      // Uses resolved card_id so dynamically-matched sources group correctly.
      const rcid2 = resolveCardId("cs2");
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("card_sources as cs2")
            .select(sql.lit(1).as("x"))
            .where("cs2.source", "=", source)
            .where(
              sql<SqlBool>`COALESCE((${rcid2})::text, cs2.norm_name) = COALESCE((${rcid})::text, cs.norm_name)`,
            ),
        ),
      );
    }

    if (filter === "unchecked") {
      // raw sql: arithmetic on two conditional aggregates in HAVING — clearer as raw sql
      query = query.having(
        sql`count(DISTINCT CASE WHEN cs.checked_at IS NULL THEN cs.id END) +
          count(DISTINCT CASE WHEN ps.checked_at IS NULL AND ps.id IS NOT NULL THEN ps.id END)`,
        ">",
        0,
      );
    } else if (filter === "unmatched") {
      // Only show truly unmatched sources (no card match by name or alias either)
      query = query.where(sql<SqlBool>`(${rcid}) IS NULL`);
    }

    const rows = await query.execute();

    // Include cards that have no card_sources (unless filtering for unmatched/source)
    type ResultRow = (typeof rows)[number] & { _fromCard?: boolean };
    const allRows: ResultRow[] = [...rows];

    if (filter !== "unmatched" && !source) {
      const cardIdsWithSources = new Set(
        rows.filter((r) => r.card_id).map((r) => r.card_id as string),
      );
      let orphanQuery = db.selectFrom("cards as c").select(["c.id", "c.slug", "c.name"]);
      if (cardIdsWithSources.size > 0) {
        orphanQuery = orphanQuery.where("c.id", "not in", [...cardIdsWithSources]);
      }
      const orphanCards = await orphanQuery.execute();

      for (const oc of orphanCards) {
        allRows.push({
          card_id: oc.id,
          card_slug: oc.slug,
          name: oc.name,
          groupKey: oc.id,
          sourceCount: 0 as unknown as number,
          uncheckedCardCount: 0 as unknown as number,
          uncheckedPrintingCount: 0 as unknown as number,
          hasGallery: false as unknown as boolean,
          minReleasedAt: null as unknown as string | null,
          releasedSetSlug: null as unknown as string | null,
          hasKnownSet: false as unknown as boolean,
          hasUnknownSet: false as unknown as boolean,
          _fromCard: true,
        });
      }

      // Fetch set release info for orphan cards via their printings
      const orphanIds = orphanCards.map((oc) => oc.id);
      if (orphanIds.length > 0) {
        const orphanPrintings = await db
          .selectFrom("printings as p")
          .innerJoin("sets as s", "s.id", "p.set_id")
          .select(["p.card_id", "s.slug", "s.released_at"])
          .where("p.card_id", "in", orphanIds)
          .execute();
        for (const op of orphanPrintings) {
          const row = allRows.find((r) => r.card_id === op.card_id && r._fromCard);
          if (!row) {
            continue;
          }
          const relDate =
            (op.released_at as unknown) instanceof Date
              ? (op.released_at as unknown as Date).toISOString().slice(0, 10)
              : (op.released_at ?? null);
          if (relDate) {
            if (!row.minReleasedAt || relDate < row.minReleasedAt) {
              row.minReleasedAt = relDate as string | null;
              row.releasedSetSlug = op.slug as string | null;
            } else if (
              relDate === row.minReleasedAt &&
              (!row.releasedSetSlug || op.slug < row.releasedSetSlug)
            ) {
              row.releasedSetSlug = op.slug as string | null;
            }
          } else {
            row.hasKnownSet = true as unknown as boolean;
          }
        }
      }
    }

    // Compute dynamic match suggestions for unmatched groups
    const unmatchedNormNames = allRows.filter((r) => !r.card_id).map((r) => r.groupKey as string);

    const suggestionMap = new Map<string, { id: string; slug: string; name: string }>();
    if (unmatchedNormNames.length > 0) {
      const suggestions = await db
        .selectFrom("cards as c")
        .select(["c.id", "c.slug", "c.name", "c.norm_name as norm"])
        .where("c.norm_name", "in", unmatchedNormNames)
        .execute();
      for (const s of suggestions) {
        suggestionMap.set(s.norm as string, { id: s.id, slug: s.slug, name: s.name });
      }

      // Also check aliases for matches not covered by direct card name
      const missingNorms = unmatchedNormNames.filter((n) => !suggestionMap.has(n));
      if (missingNorms.length > 0) {
        const aliasSuggestions = await db
          .selectFrom("card_name_aliases as cna")
          .innerJoin("cards as c", "c.id", "cna.card_id")
          .select(["c.id", "c.slug", "c.name", "cna.norm_name as norm"])
          .where("cna.norm_name", "in", missingNorms)
          .execute();
        for (const s of aliasSuggestions) {
          if (!suggestionMap.has(s.norm as string)) {
            suggestionMap.set(s.norm as string, { id: s.id, slug: s.slug, name: s.name });
          }
        }
      }
    }

    // Load printing source IDs for matched cards (like marketplace shows OGN-042, OGN-042a)
    const matchedCardIds = allRows.filter((r) => r.card_id).map((r) => r.card_id as string);
    const printingSourceIdsMap = new Map<string, string[]>();
    if (matchedCardIds.length > 0) {
      const printingRows = await db
        .selectFrom("printings")
        .select(["card_id", "source_id"])
        .where("card_id", "in", matchedCardIds)
        .orderBy("source_id")
        .execute();
      for (const pr of printingRows) {
        const existing = printingSourceIdsMap.get(pr.card_id);
        if (existing) {
          existing.push(pr.source_id);
        } else {
          printingSourceIdsMap.set(pr.card_id, [pr.source_id]);
        }
      }
    }

    // Load candidate printing source IDs for matched cards (printing_sources with no printing_id yet)
    const candidateSourceIdsMap = new Map<string, string[]>();
    if (matchedCardIds.length > 0) {
      const matchedNormNames = allRows
        .filter((r) => r.card_id)
        .map((r) => normalizeNameForMatching(String(r.name)));
      const candidateRows = await db
        .selectFrom("printing_sources as ps")
        .innerJoin("card_sources as cs", "cs.id", "ps.card_source_id")
        .select([resolveCardId("cs").as("card_id"), "ps.source_id"])
        .where("cs.norm_name", "in", matchedNormNames)
        .where("ps.printing_id", "is", null)
        .orderBy("ps.source_id")
        .execute();
      for (const cr of candidateRows) {
        const cardId = cr.card_id as string | null;
        if (!cardId) {
          continue;
        }
        const existing = candidateSourceIdsMap.get(cardId);
        if (existing) {
          if (!existing.includes(cr.source_id)) {
            existing.push(cr.source_id);
          }
        } else {
          candidateSourceIdsMap.set(cardId, [cr.source_id]);
        }
      }
    }

    // Load printing source IDs for unmatched cards (from printing_sources via card_sources)
    const unmatchedGroupKeys = allRows.filter((r) => !r.card_id).map((r) => r.groupKey as string);
    const pendingSourceIdsMap = new Map<string, string[]>();
    if (unmatchedGroupKeys.length > 0) {
      const pendingRows = await db
        .selectFrom("printing_sources as ps")
        .innerJoin("card_sources as cs", "cs.id", "ps.card_source_id")
        .select(["cs.norm_name as norm", "ps.source_id"])
        .where("cs.norm_name", "in", unmatchedGroupKeys)
        .orderBy("ps.source_id")
        .execute();
      for (const pr of pendingRows) {
        const norm = pr.norm as string;
        const existing = pendingSourceIdsMap.get(norm);
        if (existing) {
          if (!existing.includes(pr.source_id)) {
            existing.push(pr.source_id);
          }
        } else {
          pendingSourceIdsMap.set(norm, [pr.source_id]);
        }
      }
    }

    // Sort by tier (released → known set → unknown set → no printings), then release date, then card slug
    // For candidates without a slug, derive a suggested ID from the first pending source ID
    const suggestedCardIdFor = (r: (typeof allRows)[number]): string | null => {
      if (r.card_slug) {
        return null;
      }
      const pending = pendingSourceIdsMap.get(r.groupKey as string);
      if (!pending || pending.length === 0) {
        return null;
      }
      return pending[0].replace(/(?<=\d)[a-z*]+$/, "");
    };

    allRows.sort((a, b) => {
      function tier(r: (typeof allRows)[number]): number {
        if (r.minReleasedAt) {
          return 0;
        }
        if (r.hasKnownSet) {
          return 1;
        }
        if (r.hasUnknownSet) {
          return 2;
        }
        return 3;
      }
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) {
        return ta - tb;
      }
      // Within the same tier, sort by release date, then set slug
      const dateA = a.minReleasedAt ?? "";
      const dateB = b.minReleasedAt ?? "";
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      const setA = a.releasedSetSlug ?? "";
      const setB = b.releasedSetSlug ?? "";
      if (setA !== setB) {
        return setA.localeCompare(setB);
      }
      // Cards with a slug first (by slug), then candidates (by suggested ID), then rest (by name)
      const keyA = a.card_slug ?? suggestedCardIdFor(a);
      const keyB = b.card_slug ?? suggestedCardIdFor(b);
      const hasKeyA = keyA ? 0 : 1;
      const hasKeyB = keyB ? 0 : 1;
      if (hasKeyA !== hasKeyB) {
        return hasKeyA - hasKeyB;
      }
      const nameA = keyA ?? String(a.name);
      const nameB = keyB ?? String(b.name);
      return nameA.localeCompare(nameB);
    });

    return c.json(
      allRows.map((r) => ({
        cardId: r.card_id ?? null,
        cardSlug: r.card_slug ?? null,
        name: r.name,
        normalizedName: r.card_id ? normalizeNameForMatching(String(r.name)) : r.groupKey,
        sourceIds: r.card_id ? (printingSourceIdsMap.get(r.card_id as string) ?? []) : [],
        pendingSourceIds: r.card_id ? [] : (pendingSourceIdsMap.get(r.groupKey as string) ?? []),
        candidateSourceIds: r.card_id ? (candidateSourceIdsMap.get(r.card_id as string) ?? []) : [],
        sourceCount: Number(r.sourceCount),
        uncheckedCardCount: Number(r.uncheckedCardCount),
        uncheckedPrintingCount: Number(r.uncheckedPrintingCount),
        hasGallery: Boolean(r.hasGallery),
        suggestedCard: r.card_id ? null : (suggestionMap.get(r.groupKey as string) ?? null),
      })),
    );
  })

  // ── GET /card-sources/export ──────────────────────────────────────────────────
  // Export all active cards + printings in the same JSON format the upload endpoint accepts
  .get("/card-sources/export", async (c) => {
    const cards = await db.selectFrom("cards").selectAll().orderBy("name").execute();

    const printings = await db
      .selectFrom("printings")
      .innerJoin("sets", "sets.id", "printings.set_id")
      .leftJoin("printing_images", (jb) =>
        jb
          .onRef("printing_images.printing_id", "=", "printings.id")
          .on("printing_images.face", "=", "front")
          .on("printing_images.is_active", "=", true),
      )
      .selectAll("printings")
      .select([
        "sets.slug as set_slug",
        "sets.name as set_name",
        "printing_images.rehosted_url",
        "printing_images.original_url",
      ])
      .orderBy("printings.set_id")
      .orderBy("printings.collector_number")
      .orderBy("printings.art_variant")
      .orderBy("printings.finish")
      .execute();

    const printingsByCardId = new Map<string, typeof printings>();
    for (const p of printings) {
      const list = printingsByCardId.get(p.card_id) ?? [];
      list.push(p);
      printingsByCardId.set(p.card_id, list);
    }

    const candidates = cards.map((card) => ({
      card: {
        name: card.name,
        type: card.type,
        super_types: card.super_types,
        domains: card.domains,
        might: card.might,
        energy: card.energy,
        power: card.power,
        might_bonus: card.might_bonus,
        rules_text: card.rules_text ?? "",
        effect_text: card.effect_text ?? "",
        tags: card.tags,
        source_id: card.slug,
        source_entity_id: card.id,
        extra_data: null,
      },
      printings: (printingsByCardId.get(card.id) ?? []).map((p) => ({
        source_id: p.source_id,
        set_id: p.set_slug,
        set_name: p.set_name,
        collector_number: p.collector_number,
        rarity: p.rarity,
        art_variant: p.art_variant,
        is_signed: p.is_signed,
        finish: p.finish,
        artist: p.artist,
        public_code: p.public_code,
        printed_rules_text: p.printed_rules_text,
        printed_effect_text: p.printed_effect_text,
        image_url: p.original_url ?? p.rehosted_url ?? null,
        flavor_text: p.flavor_text,
        source_entity_id: p.id,
        extra_data: null,
      })),
    }));

    return c.json(candidates);
  })

  // ── GET /card-sources/:cardId ────────────────────────────────────────────────
  // Detail: active card + all card_sources + printings + printing_sources
  .get("/card-sources/:cardId", async (c) => {
    const cardSlug = c.req.param("cardId");

    const card = await db
      .selectFrom("cards")
      .selectAll()
      .where("slug", "=", cardSlug)
      .executeTakeFirst();

    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Card not found");
    }

    // Find sources matched by card name or alias
    const cardNormName = normalizeNameForMatching(card.name);
    const aliasRows = await db
      .selectFrom("card_name_aliases")
      .select("norm_name")
      .where("card_id", "=", card.id)
      .execute();
    const nameVariants = [cardNormName, ...aliasRows.map((a) => a.norm_name)];
    const uniqueVariants = [...new Set(nameVariants)];

    // Find sources by name/alias OR by printing source_id match (same fallback as resolveCardId)
    const printingSourceIds = await db
      .selectFrom("printings")
      .select("source_id")
      .where("card_id", "=", card.id)
      .execute();
    const matchingSourceIds = printingSourceIds.map((p) => p.source_id);

    let sourcesQuery = db
      .selectFrom("card_sources")
      .selectAll()
      .where("card_sources.norm_name", "in", uniqueVariants);

    if (matchingSourceIds.length > 0) {
      sourcesQuery = db
        .selectFrom("card_sources")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("card_sources.norm_name", "in", uniqueVariants),
            eb.exists(
              eb
                .selectFrom("printing_sources as ps_match")
                .select(sql.lit(1).as("x"))
                .whereRef("ps_match.card_source_id", "=", "card_sources.id")
                .where("ps_match.source_id", "in", matchingSourceIds),
            ),
          ]),
        );
    }

    const sources = await sourcesQuery.orderBy("source").execute();

    const printings = await db
      .selectFrom("printings")
      .selectAll()
      .where("card_id", "=", card.id)
      .execute();

    const sourceIds = sources.map((s) => s.id);
    const printingSources =
      sourceIds.length > 0
        ? await db
            .selectFrom("printing_sources")
            .selectAll()
            .where("card_source_id", "in", sourceIds)
            .orderBy("set_id")
            .orderBy("finish")
            .orderBy("is_signed")
            .orderBy("source_id")
            .execute()
        : [];

    const printingIds = printings.map((p) => p.id);
    const printingImages =
      printingIds.length > 0
        ? await db
            .selectFrom("printing_images")
            .selectAll()
            .where("printing_id", "in", printingIds)
            .orderBy("created_at", "asc")
            .execute()
        : [];

    // Build set UUID → slug map for printings response
    const setIds = [...new Set(printings.map((p) => p.set_id))];
    const setSlugMap = new Map<string, string>();
    if (setIds.length > 0) {
      const setRows = await db
        .selectFrom("sets")
        .select(["id", "slug"])
        .where("id", "in", setIds)
        .execute();
      for (const s of setRows) {
        setSlugMap.set(s.id, s.slug);
      }
    }

    return c.json({
      card: {
        id: card.id,
        slug: card.slug,
        name: card.name,
        type: card.type,
        superTypes: card.super_types,
        domains: card.domains,
        might: card.might,
        energy: card.energy,
        power: card.power,
        mightBonus: card.might_bonus,
        keywords: card.keywords,
        rulesText: card.rules_text,
        effectText: card.effect_text,
        tags: card.tags,
      },
      sources: sources.map((s) => ({
        id: s.id,
        source: s.source,
        name: s.name,
        type: s.type,
        superTypes: s.super_types,
        domains: s.domains,
        might: s.might,
        energy: s.energy,
        power: s.power,
        mightBonus: s.might_bonus,
        keywords: [
          ...extractKeywords(s.rules_text ?? ""),
          ...extractKeywords(s.effect_text),
        ].filter((v, i, a) => a.indexOf(v) === i),
        rulesText: s.rules_text,
        effectText: s.effect_text,
        tags: s.tags,
        sourceId: s.source_id,
        sourceEntityId: s.source_entity_id,
        extraData: s.extra_data,
        checkedAt: s.checked_at?.toISOString() ?? null,
        createdAt: s.created_at.toISOString(),
        updatedAt: s.updated_at.toISOString(),
      })),
      printings: printings.map((p) => ({
        id: p.id,
        slug: p.slug,
        cardId: card.id,
        setId: setSlugMap.get(p.set_id) ?? p.set_id,
        sourceId: p.source_id,
        collectorNumber: p.collector_number,
        rarity: p.rarity,
        artVariant: p.art_variant,
        isSigned: p.is_signed,
        isPromo: p.is_promo,
        finish: p.finish,
        artist: p.artist,
        publicCode: p.public_code,
        printedRulesText: p.printed_rules_text,
        printedEffectText: p.printed_effect_text,
        flavorText: p.flavor_text,
        comment: p.comment,
      })),
      printingSources: printingSources.map((ps) => ({
        id: ps.id,
        cardSourceId: ps.card_source_id,
        printingId: ps.printing_id,
        sourceId: ps.source_id,
        setId: ps.set_id,
        setName: ps.set_name,
        collectorNumber: ps.collector_number,
        rarity: ps.rarity,
        artVariant: ps.art_variant,
        isSigned: ps.is_signed,
        isPromo: ps.is_promo,
        finish: ps.finish,
        artist: ps.artist,
        publicCode: ps.public_code,
        printedRulesText: ps.printed_rules_text,
        printedEffectText: ps.printed_effect_text,
        imageUrl: ps.image_url,
        flavorText: ps.flavor_text,
        sourceEntityId: ps.source_entity_id,
        extraData: ps.extra_data,
        checkedAt: ps.checked_at?.toISOString() ?? null,
        createdAt: ps.created_at.toISOString(),
        updatedAt: ps.updated_at.toISOString(),
      })),
      printingImages: printingImages.map((pi) => ({
        id: pi.id,
        printingId: pi.printing_id,
        face: pi.face,
        source: pi.source,
        originalUrl: pi.original_url,
        rehostedUrl: pi.rehosted_url,
        isActive: pi.is_active,
        createdAt: pi.created_at.toISOString(),
        updatedAt: pi.updated_at.toISOString(),
      })),
    });
  })

  // ── GET /card-sources/new/:name ──────────────────────────────────────────────
  // Unmatched detail: card_sources grouped by normalized name (no matching card)
  .get("/card-sources/new/:name", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));

    const sources = await db
      .selectFrom("card_sources")
      .selectAll()
      .where("card_sources.norm_name", "=", name)
      .orderBy("source")
      .execute();

    if (sources.length === 0) {
      throw new AppError(404, "NOT_FOUND", "No unmatched sources found for this name");
    }

    const sourceIds = sources.map((s) => s.id);
    const printingSources = await db
      .selectFrom("printing_sources")
      .selectAll()
      .where("card_source_id", "in", sourceIds)
      .orderBy("collector_number")
      .orderBy("source_id")
      .execute();

    // Use the shortest raw name from the group as the display name
    const displayName = sources.reduce(
      (best, s) => (s.name.length < best.length ? s.name : best),
      sources[0].name,
    );

    return c.json({
      name: displayName,
      sources: sources.map((s) => ({
        id: s.id,
        source: s.source,
        name: s.name,
        type: s.type,
        superTypes: s.super_types,
        domains: s.domains,
        might: s.might,
        energy: s.energy,
        power: s.power,
        mightBonus: s.might_bonus,
        keywords: [
          ...extractKeywords(s.rules_text ?? ""),
          ...extractKeywords(s.effect_text),
        ].filter((v, i, a) => a.indexOf(v) === i),
        rulesText: s.rules_text,
        effectText: s.effect_text,
        tags: s.tags,
        sourceId: s.source_id,
        sourceEntityId: s.source_entity_id,
        extraData: s.extra_data,
        checkedAt: s.checked_at?.toISOString() ?? null,
        createdAt: s.created_at.toISOString(),
        updatedAt: s.updated_at.toISOString(),
      })),
      printingSources: printingSources.map((ps) => ({
        id: ps.id,
        cardSourceId: ps.card_source_id,
        printingId: ps.printing_id,
        sourceId: ps.source_id,
        setId: ps.set_id,
        setName: ps.set_name,
        collectorNumber: ps.collector_number,
        rarity: ps.rarity,
        artVariant: ps.art_variant,
        isSigned: ps.is_signed,
        isPromo: ps.is_promo,
        finish: ps.finish,
        artist: ps.artist,
        publicCode: ps.public_code,
        printedRulesText: ps.printed_rules_text,
        printedEffectText: ps.printed_effect_text,
        imageUrl: ps.image_url,
        flavorText: ps.flavor_text,
        sourceEntityId: ps.source_entity_id,
        extraData: ps.extra_data,
        checkedAt: ps.checked_at?.toISOString() ?? null,
        createdAt: ps.created_at.toISOString(),
        updatedAt: ps.updated_at.toISOString(),
      })),
    });
  })

  // ── POST /card-sources/:cardSourceId/check ──────────────────────────────────
  .post("/card-sources/:cardSourceId/check", async (c) => {
    const { cardSourceId } = c.req.param();

    const result = await db
      .updateTable("card_sources")
      .set({ checked_at: new Date(), updated_at: new Date() })
      .where("id", "=", cardSourceId)
      .executeTakeFirst();

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Card source not found");
    }

    return c.json({ ok: true });
  })

  // ── POST /card-sources/printing-sources/check-all ───────────────────────────
  // Mark all printing_sources for a given printing as checked
  // NOTE: Must be registered before /card-sources/:cardId/check-all to avoid
  // the :cardId wildcard matching "printing-sources" as a card ID.
  .post(
    "/card-sources/printing-sources/check-all",
    zValidator("json", checkAllPrintingSourcesSchema),
    async (c) => {
      const { printingId, extraIds } = c.req.valid("json");

      const results = await db
        .updateTable("printing_sources")
        .set({ checked_at: new Date(), updated_at: new Date() })
        .where((eb) =>
          eb.or([
            eb("printing_id", "=", printingId),
            ...(extraIds?.length ? [eb("id", "in", extraIds)] : []),
          ]),
        )
        .where("checked_at", "is", null)
        .execute();

      const updated = results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
      return c.json({ ok: true, updated });
    },
  )

  // ── POST /card-sources/printing-sources/:id/check ───────────────────────────
  .post("/card-sources/printing-sources/:id/check", async (c) => {
    const { id } = c.req.param();

    const result = await db
      .updateTable("printing_sources")
      .set({ checked_at: new Date(), updated_at: new Date() })
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.json({ ok: true });
  })

  // ── POST /card-sources/:cardId/check-all ────────────────────────────────────
  // Mark all card_sources for a given card as checked
  .post("/card-sources/:cardId/check-all", async (c) => {
    const cardSlug = c.req.param("cardId");

    // Resolve slug → card, then find sources by name/alias
    const card = await db
      .selectFrom("cards")
      .select(["id", "name"])
      .where("slug", "=", cardSlug)
      .executeTakeFirst();
    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Card not found");
    }

    const cardNormName = normalizeNameForMatching(card.name);
    const aliasRows = await db
      .selectFrom("card_name_aliases")
      .select("norm_name")
      .where("card_id", "=", card.id)
      .execute();
    const uniqueVariants = [...new Set([cardNormName, ...aliasRows.map((a) => a.norm_name)])];

    const results = await db
      .updateTable("card_sources")
      .set({ checked_at: new Date(), updated_at: new Date() })
      .where("card_sources.norm_name", "in", uniqueVariants)
      .where("checked_at", "is", null)
      .execute();

    const updated = results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
    return c.json({ ok: true, updated });
  })

  // ── PATCH /card-sources/printing-sources/:id ─────────────────────────────────
  // Update differentiator fields on a printing_source (e.g. fix wrong art_variant)
  .patch(
    "/card-sources/printing-sources/:id",
    zValidator("json", patchPrintingSourceSchema),
    async (c) => {
      const { id } = c.req.param();
      const body = c.req.valid("json");

      const allowedFields: Record<string, string> = {
        artVariant: "art_variant",
        isSigned: "is_signed",
        isPromo: "is_promo",
        finish: "finish",
        collectorNumber: "collector_number",
        setId: "set_id",
        sourceId: "source_id",
        rarity: "rarity",
      };

      const updates: Record<string, unknown> = { updated_at: new Date() };
      const bodyRecord = body as Record<string, unknown>;
      for (const [camel, col] of Object.entries(allowedFields)) {
        if (camel in body) {
          updates[col] = bodyRecord[camel];
        }
      }

      if (Object.keys(updates).length === 1) {
        throw new AppError(400, "BAD_REQUEST", "No valid fields to update");
      }

      const result = await db
        .updateTable("printing_sources")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirst();

      if (!result || result.numUpdatedRows === 0n) {
        throw new AppError(404, "NOT_FOUND", "Printing source not found");
      }

      return c.json({ ok: true });
    },
  )

  // ── DELETE /card-sources/printing-sources/:id ─────────────────────────────────
  .delete("/card-sources/printing-sources/:id", async (c) => {
    const { id } = c.req.param();

    const result = await db.deleteFrom("printing_sources").where("id", "=", id).execute();

    if (Number(result[0].numDeletedRows) === 0) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.json({ ok: true });
  })

  // ── POST /card-sources/printing-sources/:id/copy ─────────────────────────────
  // Duplicate a printing_source and link the copy to a different printing
  .post(
    "/card-sources/printing-sources/:id/copy",
    zValidator("json", copyPrintingSourceSchema),
    async (c) => {
      const { id } = c.req.param();
      const { printingId } = c.req.valid("json");

      if (!printingId) {
        throw new AppError(400, "BAD_REQUEST", "printingId is required");
      }

      const ps = await db
        .selectFrom("printing_sources")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      if (!ps) {
        throw new AppError(404, "NOT_FOUND", "Printing source not found");
      }

      const target = await db
        .selectFrom("printings")
        .select(["id", "finish", "art_variant", "is_signed", "is_promo", "rarity"])
        .where("slug", "=", printingId)
        .executeTakeFirst();

      if (!target) {
        throw new AppError(404, "NOT_FOUND", "Target printing not found");
      }

      await db
        .insertInto("printing_sources")
        .values({
          card_source_id: ps.card_source_id,
          printing_id: target.id,
          source_id: ps.source_id,
          set_id: ps.set_id,
          set_name: ps.set_name,
          collector_number: ps.collector_number,
          rarity: target.rarity,
          art_variant: target.art_variant,
          is_signed: target.is_signed,
          is_promo: target.is_promo,
          finish: target.finish,
          artist: ps.artist,
          public_code: ps.public_code,
          printed_rules_text: ps.printed_rules_text,
          printed_effect_text: ps.printed_effect_text,
          image_url: ps.image_url,
          flavor_text: ps.flavor_text,
          source_entity_id: ps.source_entity_id,
          extra_data: ps.extra_data,
        })
        .execute();

      return c.json({ ok: true });
    },
  )

  // ── POST /card-sources/printing-sources/link ─────────────────────────────────
  // Bulk-link (or unlink) printing sources to a printing
  .post(
    "/card-sources/printing-sources/link",
    zValidator("json", linkPrintingSourcesSchema),
    async (c) => {
      const { printingSourceIds, printingId } = c.req.valid("json");

      if (!Array.isArray(printingSourceIds) || printingSourceIds.length === 0) {
        throw new AppError(400, "BAD_REQUEST", "printingSourceIds[] required");
      }

      // Resolve slug → uuid if linking (printingId is null when unlinking)
      let printingUuid: string | null = null;
      if (printingId) {
        const p = await db
          .selectFrom("printings")
          .select("id")
          .where("slug", "=", printingId)
          .executeTakeFirst();
        if (!p) {
          throw new AppError(404, "NOT_FOUND", "Target printing not found");
        }
        printingUuid = p.id;
      }

      await db
        .updateTable("printing_sources")
        .set({ printing_id: printingUuid, updated_at: new Date() })
        .where("id", "in", printingSourceIds)
        .execute();

      return c.json({ ok: true });
    },
  )

  // ── POST /card-sources/:cardId/rename ────────────────────────────────────────
  .post("/card-sources/:cardId/rename", zValidator("json", renameSchema), async (c) => {
    const cardSlug = c.req.param("cardId");
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "newId is required");
    }

    if (newId === cardSlug) {
      return c.json({ ok: true });
    }

    // UUID PK is immutable — only the slug changes
    await db
      .updateTable("cards")
      .set({ slug: newId.trim(), updated_at: new Date() })
      .where("slug", "=", cardSlug)
      .execute();

    return c.json({ ok: true });
  })

  // ── POST /card-sources/:cardId/accept-field ─────────────────────────────────
  .post("/card-sources/:cardId/accept-field", zValidator("json", acceptFieldSchema), async (c) => {
    const cardSlug = c.req.param("cardId");
    const { field, value } = c.req.valid("json");

    if (!field) {
      throw new AppError(400, "BAD_REQUEST", "field is required");
    }

    const allowedFields: Record<string, string> = {
      name: "name",
      type: "type",
      superTypes: "super_types",
      domains: "domains",
      might: "might",
      energy: "energy",
      power: "power",
      mightBonus: "might_bonus",
      rulesText: "rules_text",
      effectText: "effect_text",
      tags: "tags",
    };

    const dbField = allowedFields[field];
    if (!dbField) {
      throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
    }

    const updates: Record<string, unknown> = { [dbField]: value, updated_at: new Date() };

    // Recompute keywords when rules_text or effect_text changes
    if (dbField === "rules_text" || dbField === "effect_text") {
      const card = await db
        .selectFrom("cards")
        .select(["rules_text", "effect_text"])
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      const rulesText = dbField === "rules_text" ? (value as string) : card.rules_text;
      const effectText = dbField === "effect_text" ? (value as string) : card.effect_text;
      updates.keywords = [
        ...extractKeywords(rulesText ?? ""),
        ...extractKeywords(effectText ?? ""),
      ].filter((v, i, a) => a.indexOf(v) === i);
    }

    await db.updateTable("cards").set(updates).where("slug", "=", cardSlug).execute();

    return c.json({ ok: true });
  })

  // ── POST /card-sources/printing/:printingId/accept-field ────────────────────
  .post(
    "/card-sources/printing/:printingId/accept-field",
    zValidator("json", acceptFieldSchema),
    async (c) => {
      const printingSlug = c.req.param("printingId");
      const { field, value } = c.req.valid("json");

      if (!field) {
        throw new AppError(400, "BAD_REQUEST", "field is required");
      }

      const allowedFields: Record<string, string> = {
        sourceId: "source_id",
        setId: "set_id",
        collectorNumber: "collector_number",
        rarity: "rarity",
        artVariant: "art_variant",
        isSigned: "is_signed",
        isPromo: "is_promo",
        finish: "finish",
        artist: "artist",
        publicCode: "public_code",
        printedRulesText: "printed_rules_text",
        printedEffectText: "printed_effect_text",
        flavorText: "flavor_text",
        comment: "comment",
      };

      const dbField = allowedFields[field];
      if (!dbField) {
        throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
      }

      // Normalize enum fields that have DB check constraints
      let normalizedValue = value;
      if (field === "rarity" && typeof value === "string") {
        normalizedValue =
          RARITY_ORDER.find((r) => r.toLowerCase() === value.toLowerCase()) || value;
      }

      await db
        .updateTable("printings")
        .set({ [dbField]: normalizedValue, updated_at: new Date() })
        .where("slug", "=", printingSlug)
        .execute();

      return c.json({ ok: true });
    },
  )

  // ── POST /card-sources/printing/:printingId/rename ──────────────────────────
  .post(
    "/card-sources/printing/:printingId/rename",
    zValidator("json", renameSchema),
    async (c) => {
      const printingSlug = c.req.param("printingId");
      const { newId } = c.req.valid("json");

      if (!newId?.trim()) {
        throw new AppError(400, "BAD_REQUEST", "newId is required");
      }

      if (newId === printingSlug) {
        return c.json({ ok: true });
      }

      // UUID PK is immutable — only the slug changes
      await db
        .updateTable("printings")
        .set({ slug: newId.trim(), updated_at: new Date() })
        .where("slug", "=", printingSlug)
        .execute();

      return c.json({ ok: true });
    },
  )

  // ── POST /card-sources/new/:name/accept ─────────────────────────────────────
  // Create new card from source data and link card_sources
  .post("/card-sources/new/:name/accept", zValidator("json", acceptNewCardSchema), async (c) => {
    const normalizedName = decodeURIComponent(c.req.param("name"));
    const { cardFields } = c.req.valid("json");

    if (!cardFields) {
      throw new AppError(400, "BAD_REQUEST", "cardFields required");
    }

    await db.transaction().execute(async (trx) => {
      await acceptNewCardFromSources(trx, cardFields, normalizedName);
    });

    return c.json({ ok: true });
  })

  // ── POST /card-sources/new/:name/link ────────────────────────────────────────
  // Link unmatched sources to an existing card
  .post("/card-sources/new/:name/link", zValidator("json", linkUnmatchedSchema), async (c) => {
    const normalizedName = decodeURIComponent(c.req.param("name"));
    const { cardId: cardSlug } = c.req.valid("json");

    if (!cardSlug) {
      throw new AppError(400, "BAD_REQUEST", "cardId required");
    }

    const card = await db
      .selectFrom("cards")
      .select("id")
      .where("slug", "=", cardSlug)
      .executeTakeFirst();

    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Target card not found");
    }

    await db.transaction().execute(async (trx) => {
      await createNameAliases(trx, normalizedName, card.id);
    });

    return c.json({ ok: true });
  })

  // ── POST /card-sources/:cardId/accept-printing ──────────────────────────────
  // Create a new printing from admin-selected fields, link all sources in the group
  .post(
    "/card-sources/:cardId/accept-printing",
    zValidator("json", acceptPrintingSchema),
    async (c) => {
      const cardSlug = c.req.param("cardId");
      const { printingFields, printingSourceIds } = c.req.valid("json");

      if (printingSourceIds.length === 0) {
        throw new AppError(400, "BAD_REQUEST", "printingFields and printingSourceIds[] required");
      }

      // Verify card exists (resolve slug → uuid)
      const card = await db
        .selectFrom("cards")
        .select("id")
        .where("slug", "=", cardSlug)
        .executeTakeFirst();

      if (!card) {
        throw new AppError(404, "NOT_FOUND", "Card not found");
      }

      const printingId =
        printingFields.id ||
        buildPrintingId(
          printingFields.sourceId,
          printingFields.rarity ?? ("Common" satisfies Rarity),
          printingFields.isPromo ?? false,
          printingFields.finish ?? ("normal" satisfies Finish),
        );

      // Get source name from the first printing_source's card_source
      const firstPs = await db
        .selectFrom("printing_sources")
        .innerJoin("card_sources", "card_sources.id", "printing_sources.card_source_id")
        .select("card_sources.source")
        .where("printing_sources.id", "=", printingSourceIds[0])
        .executeTakeFirst();

      await db.transaction().execute(async (trx) => {
        if (printingFields.setId) {
          await upsertSet(
            trx,
            printingFields.setId,
            printingFields.setName ?? printingFields.setId,
          );
        }

        let setUuid = "";
        if (printingFields.setId) {
          const setRow = await trx
            .selectFrom("sets")
            .select("id")
            .where("slug", "=", printingFields.setId)
            .executeTakeFirst();
          setUuid = setRow?.id ?? "";
        }

        // Normalize rarity to title case (source data may be lowercase)
        const rawRarity = String(printingFields.rarity || ("Common" satisfies Rarity));
        const normalizedRarity =
          RARITY_ORDER.find((r) => r.toLowerCase() === rawRarity.toLowerCase()) ||
          ("Common" satisfies Rarity);

        const inserted = await trx
          .insertInto("printings")
          .values({
            slug: printingId,
            card_id: card.id,
            set_id: setUuid,
            source_id: printingFields.sourceId,
            collector_number: printingFields.collectorNumber ?? 0,
            rarity: normalizedRarity as Rarity,
            art_variant: printingFields.artVariant ?? "",
            is_signed: printingFields.isSigned ?? false,
            is_promo: printingFields.isPromo ?? false,
            finish: printingFields.finish ?? ("normal" satisfies Finish),
            artist: printingFields.artist ?? "",
            public_code: printingFields.publicCode ?? "",
            printed_rules_text: printingFields.printedRulesText ?? "",
            printed_effect_text: printingFields.printedEffectText ?? null,
            flavor_text: printingFields.flavorText ?? null,
          })
          .onConflict((oc) =>
            oc.column("slug").doUpdateSet((eb) => ({
              artist: eb.ref("excluded.artist"),
              public_code: eb.ref("excluded.public_code"),
              printed_rules_text: eb.ref("excluded.printed_rules_text"),
              printed_effect_text: eb.ref("excluded.printed_effect_text"),
              flavor_text: eb.ref("excluded.flavor_text"),
            })),
          )
          .returning("id")
          .executeTakeFirstOrThrow();

        // Insert image from the first source
        if (printingFields.imageUrl) {
          await insertPrintingImage(
            trx,
            inserted.id,
            printingFields.imageUrl,
            firstPs?.source ?? "import",
          );
        }

        // Link all printing_sources in the group
        await trx
          .updateTable("printing_sources")
          .set({ printing_id: inserted.id, checked_at: new Date(), updated_at: new Date() })
          .where("id", "in", printingSourceIds)
          .execute();
      });

      return c.json({ ok: true, printingId });
    },
  )

  // ── POST /card-sources/printing-sources/:id/accept-new ──────────────────────
  // Create a new printing from a printing_source row (legacy, single source)
  .post("/card-sources/printing-sources/:id/accept-new", async (c) => {
    const { id } = c.req.param();

    const ps = await db
      .selectFrom("printing_sources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    if (ps.printing_id) {
      throw new AppError(400, "BAD_REQUEST", "Printing source already linked to a printing");
    }

    // Get the parent card_source to resolve card dynamically
    const cs = await db
      .selectFrom("card_sources")
      .select(["name", "source"])
      .where("id", "=", ps.card_source_id)
      .executeTakeFirst();

    if (!cs) {
      throw new AppError(400, "BAD_REQUEST", "Card source not found");
    }

    // Resolve card by name or alias
    const normName = normalizeNameForMatching(cs.name);
    const resolvedCard = await db
      .selectFrom("cards")
      .select("id")
      .where("cards.norm_name", "=", normName)
      .executeTakeFirst();
    const aliasMatch = await db
      .selectFrom("card_name_aliases")
      .select("card_id")
      .where("card_name_aliases.norm_name", "=", normName)
      .executeTakeFirst();
    const cardId = resolvedCard?.id ?? aliasMatch?.card_id;

    if (!cardId) {
      throw new AppError(400, "BAD_REQUEST", "Card source does not match any card");
    }

    const printingId = buildPrintingId(ps.source_id, ps.rarity, ps.is_promo, ps.finish);

    await db.transaction().execute(async (trx) => {
      if (ps.set_id) {
        await upsertSet(trx, ps.set_id, ps.set_name ?? ps.set_id);
      }

      let setUuid = "";
      if (ps.set_id) {
        const setRow = await trx
          .selectFrom("sets")
          .select("id")
          .where("slug", "=", ps.set_id)
          .executeTakeFirst();
        setUuid = setRow?.id ?? "";
      }

      const inserted = await trx
        .insertInto("printings")
        .values({
          slug: printingId,
          card_id: cardId,
          set_id: setUuid,
          source_id: ps.source_id,
          collector_number: ps.collector_number,
          rarity: ps.rarity as Rarity,
          art_variant: ps.art_variant ?? "",
          is_signed: ps.is_signed,
          is_promo: ps.is_promo,
          finish: ps.finish,
          artist: ps.artist ?? "",
          public_code: ps.public_code,
          printed_rules_text: ps.printed_rules_text ?? "",
          printed_effect_text: ps.printed_effect_text,
          flavor_text: ps.flavor_text,
        })
        .onConflict((oc) =>
          oc.column("slug").doUpdateSet((eb) => ({
            artist: eb.ref("excluded.artist"),
            public_code: eb.ref("excluded.public_code"),
            printed_rules_text: eb.ref("excluded.printed_rules_text"),
            printed_effect_text: eb.ref("excluded.printed_effect_text"),
            flavor_text: eb.ref("excluded.flavor_text"),
          })),
        )
        .returning("id")
        .executeTakeFirstOrThrow();

      await insertPrintingImage(trx, inserted.id, ps.image_url, cs.source);

      await trx
        .updateTable("printing_sources")
        .set({ printing_id: inserted.id, checked_at: new Date(), updated_at: new Date() })
        .where("id", "=", id)
        .execute();
    });

    return c.json({ ok: true, printingId });
  })

  // ── POST /card-sources/printing-sources/:id/set-image ───────────────────────
  .post(
    "/card-sources/printing-sources/:id/set-image",
    zValidator("json", setImageSchema),
    async (c) => {
      const { id } = c.req.param();
      const { mode } = c.req.valid("json");

      const ps = await db
        .selectFrom("printing_sources")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      if (!ps) {
        throw new AppError(404, "NOT_FOUND", "Printing source not found");
      }

      if (!ps.printing_id) {
        throw new AppError(400, "BAD_REQUEST", "Printing source not linked to a printing");
      }

      if (!ps.image_url) {
        throw new AppError(400, "BAD_REQUEST", "Printing source has no image URL");
      }

      const cs = await db
        .selectFrom("card_sources")
        .select("source")
        .where("id", "=", ps.card_source_id)
        .executeTakeFirst();

      await db.transaction().execute(async (trx) => {
        await insertPrintingImage(
          trx,
          ps.printing_id as string,
          ps.image_url,
          cs?.source ?? "import",
          mode,
        );
      });

      return c.json({ ok: true });
    },
  )

  // ── DELETE /card-sources/printing-images/:imageId ────────────────────────────
  .delete("/card-sources/printing-images/:imageId", async (c) => {
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printing_images")
      .select(["id", "rehosted_url"])
      .where("id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    await db.deleteFrom("printing_images").where("id", "=", imageId).execute();

    if (image.rehosted_url) {
      await deleteRehostFiles(image.rehosted_url);
    }

    return c.json({ ok: true });
  })

  // ── POST /card-sources/printing-images/:imageId/activate ────────────────────
  .post(
    "/card-sources/printing-images/:imageId/activate",
    zValidator("json", activateImageSchema),
    async (c) => {
      const { imageId } = c.req.param();
      const { active } = c.req.valid("json");

      const image = await db
        .selectFrom("printing_images")
        .innerJoin("printings", "printings.id", "printing_images.printing_id")
        .innerJoin("sets", "sets.id", "printings.set_id")
        .select([
          "printing_images.id",
          "printing_images.printing_id",
          "printing_images.face",
          "printing_images.rehosted_url",
          "printings.slug as printing_slug",
          "sets.slug as set_slug",
        ])
        .where("printing_images.id", "=", imageId)
        .executeTakeFirst();

      if (!image) {
        throw new AppError(404, "NOT_FOUND", "Printing image not found");
      }

      const baseFileBase = printingIdToFileBase(image.printing_slug);
      const mainPath = `/card-images/${image.set_slug}/${baseFileBase}`;

      // Find the currently active image (if any) for file rename purposes
      const currentActive = active
        ? await db
            .selectFrom("printing_images")
            .select(["id", "rehosted_url"])
            .where("printing_id", "=", image.printing_id)
            .where("face", "=", image.face)
            .where("is_active", "=", true)
            .executeTakeFirst()
        : null;

      await db.transaction().execute(async (trx) => {
        if (active && currentActive) {
          // Deactivate the current active image
          await trx
            .updateTable("printing_images")
            .set({ is_active: false, updated_at: new Date() })
            .where("id", "=", currentActive.id)
            .execute();

          // Rename current active's files: main path → ID-suffixed path
          if (currentActive.rehosted_url) {
            const demotedPath = `${mainPath}-${currentActive.id}`;
            await renameRehostFiles(currentActive.rehosted_url, demotedPath);
            await trx
              .updateTable("printing_images")
              .set({ rehosted_url: demotedPath, updated_at: new Date() })
              .where("id", "=", currentActive.id)
              .execute();
          }
        }

        await trx
          .updateTable("printing_images")
          .set({ is_active: active, updated_at: new Date() })
          .where("id", "=", imageId)
          .execute();

        if (active && image.rehosted_url) {
          // Rename newly active image's files: ID-suffixed path → main path
          await renameRehostFiles(image.rehosted_url, mainPath);
          await trx
            .updateTable("printing_images")
            .set({ rehosted_url: mainPath, updated_at: new Date() })
            .where("id", "=", imageId)
            .execute();
        } else if (!active && image.rehosted_url) {
          // Demoting: rename from main path → ID-suffixed path
          const demotedPath = `${mainPath}-${image.id}`;
          await renameRehostFiles(image.rehosted_url, demotedPath);
          await trx
            .updateTable("printing_images")
            .set({ rehosted_url: demotedPath, updated_at: new Date() })
            .where("id", "=", imageId)
            .execute();
        }
      });

      return c.json({ ok: true });
    },
  )

  // ── POST /card-sources/printing-images/:imageId/unrehost ─────────────────────
  .post("/card-sources/printing-images/:imageId/unrehost", async (c) => {
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printing_images")
      .select(["id", "rehosted_url", "original_url"])
      .where("id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    if (!image.rehosted_url) {
      throw new AppError(400, "BAD_REQUEST", "Image is not rehosted");
    }

    await deleteRehostFiles(image.rehosted_url);

    await db
      .updateTable("printing_images")
      .set({ rehosted_url: null, updated_at: new Date() })
      .where("id", "=", imageId)
      .execute();

    return c.json({ ok: true });
  })

  // ── POST /card-sources/printing-images/:imageId/rehost ──────────────────────
  .post("/card-sources/printing-images/:imageId/rehost", async (c) => {
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printing_images")
      .innerJoin("printings", "printings.id", "printing_images.printing_id")
      .innerJoin("sets", "sets.id", "printings.set_id")
      .select([
        "printing_images.id",
        "printing_images.printing_id",
        "printing_images.original_url",
        "printing_images.is_active",
        "printings.slug as printing_slug",
        "sets.slug as set_slug",
      ])
      .where("printing_images.id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    if (!image.original_url) {
      throw new AppError(400, "BAD_REQUEST", "Image has no original URL to rehost");
    }

    const { buffer, ext } = await downloadImage(image.original_url);
    const baseFileBase = printingIdToFileBase(image.printing_slug);
    const fileBase = image.is_active ? baseFileBase : `${baseFileBase}-${image.id}`;
    const outputDir = join(CARD_IMAGES_DIR, image.set_slug);

    await processAndSave(buffer, ext, outputDir, fileBase);

    const rehostedUrl = `/card-images/${image.set_slug}/${fileBase}`;

    await db
      .updateTable("printing_images")
      .set({ rehosted_url: rehostedUrl, updated_at: new Date() })
      .where("id", "=", imageId)
      .execute();

    return c.json({ ok: true, rehostedUrl });
  })

  // ── POST /card-sources/printing/:printingId/add-image-url ───────────────────
  .post(
    "/card-sources/printing/:printingId/add-image-url",
    zValidator("json", addImageUrlSchema),
    async (c) => {
      const printingSlug = c.req.param("printingId");
      const body = c.req.valid("json");

      if (!body.url?.trim()) {
        throw new AppError(400, "BAD_REQUEST", "url is required");
      }

      const printing = await db
        .selectFrom("printings")
        .select("id")
        .where("slug", "=", printingSlug)
        .executeTakeFirst();
      if (!printing) {
        throw new AppError(404, "NOT_FOUND", "Printing not found");
      }

      const mode = body.mode ?? "main";
      const source = body.source?.trim() || "manual";

      await db.transaction().execute(async (trx) => {
        await insertPrintingImage(trx, printing.id, body.url.trim(), source, mode);
      });

      return c.json({ ok: true });
    },
  )

  // ── POST /card-sources/printing/:printingId/upload-image ────────────────────
  .post(
    "/card-sources/printing/:printingId/upload-image",
    zValidator("form", uploadImageFormSchema),
    async (c) => {
      const printingSlug = c.req.param("printingId");

      const printing = await db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.set_id")
        .select(["printings.id", "sets.slug as set_slug"])
        .where("printings.slug", "=", printingSlug)
        .executeTakeFirst();

      if (!printing) {
        throw new AppError(404, "NOT_FOUND", "Printing not found");
      }

      const body = c.req.valid("form");
      const file = body.file;
      const mode = body.mode === "additional" ? ("additional" as const) : ("main" as const);
      const source = body.source?.trim() || "upload";

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase() ?? "png"}` : ".png";
      const baseFileBase = printingIdToFileBase(printingSlug);
      const outputDir = join(CARD_IMAGES_DIR, printing.set_slug);

      // Insert the DB row first so we have the ID for non-main file paths
      const imageRow = await db.transaction().execute(async (trx) => {
        if (mode === "main") {
          await trx
            .updateTable("printing_images")
            .set({ is_active: false, updated_at: new Date() })
            .where("printing_id", "=", printing.id)
            .where("face", "=", "front")
            .where("is_active", "=", true)
            .execute();
        }

        return trx
          .insertInto("printing_images")
          .values({
            printing_id: printing.id,
            face: "front",
            source,
            is_active: mode === "main",
          })
          .onConflict((oc) =>
            oc.columns(["printing_id", "face", "source"]).doUpdateSet({
              is_active: mode === "main",
              updated_at: new Date(),
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();
      });

      const fileBase = mode === "main" ? baseFileBase : `${baseFileBase}-${imageRow.id}`;
      await processAndSave(buffer, ext, outputDir, fileBase);

      const rehostedUrl = `/card-images/${printing.set_slug}/${fileBase}`;

      await db
        .updateTable("printing_images")
        .set({ rehosted_url: rehostedUrl, updated_at: new Date() })
        .where("id", "=", imageRow.id)
        .execute();

      return c.json({ ok: true, rehostedUrl });
    },
  )

  // ── POST /card-sources/upload ───────────────────────────────────────────────
  .post("/card-sources/upload", zValidator("json", uploadCardSourcesSchema), async (c) => {
    const { source, candidates } = c.req.valid("json");

    if (!source || typeof source !== "string" || source.trim() === "") {
      throw new AppError(400, "BAD_REQUEST", "Non-empty source name is required");
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "Non-empty candidates array is required");
    }

    // Transform candidates to the ingestion format
    const cards = candidates.map(
      (candidate: { card: Record<string, unknown>; printings: Record<string, unknown>[] }) => ({
        name: candidate.card.name as string,
        type: candidate.card.type as string,
        super_types: (candidate.card.super_types as string[]) ?? [],
        domains: (candidate.card.domains as string[]) ?? [],
        might: candidate.card.might as number | null,
        energy: candidate.card.energy as number | null,
        power: candidate.card.power as number | null,
        might_bonus: (candidate.card.might_bonus as number | null) ?? null,
        rules_text: candidate.card.rules_text as string,
        effect_text: (candidate.card.effect_text as string) ?? "",
        tags: (candidate.card.tags as string[]) ?? [],
        source_id: (candidate.card.source_id as string) ?? null,
        source_entity_id: (candidate.card.source_entity_id as string) ?? null,
        extra_data: (candidate.card.extra_data as Record<string, unknown>) ?? null,
        printings: candidate.printings as {
          source_id: string;
          set_id: string;
          set_name?: string | null;
          collector_number: number;
          rarity: string;
          art_variant: string;
          is_signed: boolean;
          is_promo: boolean;
          finish: string;
          artist: string;
          public_code: string;
          printed_rules_text: string;
          printed_effect_text: string;
          image_url?: string | null;
          flavor_text?: string;
          extra_data?: unknown | null;
        }[],
      }),
    );

    const result = await ingestCardSources(db, source.trim(), cards);

    return c.json({
      newCards: result.newCards,
      updates: result.updates,
      unchanged: result.unchanged,
      errors: result.errors,
      updatedCards: result.updatedCards,
    });
  })

  // ── DELETE /card-sources/by-source/:source ────────────────────────────────────
  // Delete all card_sources (and cascaded printing_sources) for a given source name
  .delete("/card-sources/by-source/:source", async (c) => {
    const source = decodeURIComponent(c.req.param("source"));
    if (!source.trim()) {
      throw new AppError(400, "BAD_REQUEST", "Source name is required");
    }

    const result = await db
      .deleteFrom("card_sources")
      .where("source", "=", source.trim())
      .execute();

    const deleted = Number(result[0].numDeletedRows);
    return c.json({ status: "ok", source, deleted });
  });
