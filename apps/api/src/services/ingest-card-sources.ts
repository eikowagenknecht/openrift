import { buildPrintingId, emptyToNull, normalizeNameForMatching } from "@openrift/shared/utils";
import type { Kysely } from "kysely";
import { z } from "zod";

import type { Database } from "../db/index.js";
import { cardSourceFieldRules, printingSourceFieldRules } from "../db/schemas.js";

interface IngestCard {
  name: string;
  type: string;
  super_types: string[];
  domains: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  might_bonus: number | null;
  rules_text: string | null;
  effect_text: string | null;
  tags: string[];
  source_id?: string | null;
  source_entity_id?: string | null;
  extra_data?: unknown | null;
  printings: IngestPrinting[];
}

interface IngestPrinting {
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
  printed_rules_text: string | null;
  printed_effect_text: string | null;
  image_url?: string | null;
  flavor_text?: string;
  source_entity_id?: string | null;
  extra_data?: unknown | null;
}

interface UpdatedCardDetail {
  name: string;
  sourceId: string | null;
  fields: { field: string; from: unknown; to: unknown }[];
}

interface IngestResult {
  newCards: number;
  updates: number;
  unchanged: number;
  errors: string[];
  updatedCards: UpdatedCardDetail[];
}

function jsonOrNull(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return null;
  }
  return value;
}

const CARD_FIELDS = [
  "name",
  "type",
  "super_types",
  "domains",
  "might",
  "energy",
  "power",
  "might_bonus",
  "rules_text",
  "effect_text",
  "tags",
  "source_id",
  "source_entity_id",
  "extra_data",
] as const;

function normalize(value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  ) {
    return null;
  }
  return value;
}

// Validation schemas built from DB field rules — validates values as they'll be written
const cardSourceValidator = z.object({
  name: cardSourceFieldRules.name,
  type: cardSourceFieldRules.type,
  might: cardSourceFieldRules.might,
  energy: cardSourceFieldRules.energy,
  power: cardSourceFieldRules.power,
  might_bonus: cardSourceFieldRules.mightBonus,
  rules_text: cardSourceFieldRules.rulesText,
  effect_text: cardSourceFieldRules.effectText,
  source_id: cardSourceFieldRules.sourceId,
  source_entity_id: cardSourceFieldRules.sourceEntityId,
});

const printingSourceValidator = z.object({
  source_id: printingSourceFieldRules.sourceId,
  set_id: printingSourceFieldRules.setId,
  set_name: printingSourceFieldRules.setName,
  collector_number: printingSourceFieldRules.collectorNumber,
  rarity: printingSourceFieldRules.rarity,
  art_variant: printingSourceFieldRules.artVariant,
  finish: printingSourceFieldRules.finish,
  artist: printingSourceFieldRules.artist,
  public_code: printingSourceFieldRules.publicCode,
  printed_rules_text: printingSourceFieldRules.printedRulesText,
  printed_effect_text: printingSourceFieldRules.printedEffectText,
  image_url: printingSourceFieldRules.imageUrl,
  flavor_text: printingSourceFieldRules.flavorText,
  source_entity_id: printingSourceFieldRules.sourceEntityId,
});

function getChangedFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  fields: readonly string[],
): { field: string; from: unknown; to: unknown }[] {
  const diffs: { field: string; from: unknown; to: unknown }[] = [];
  for (const f of fields) {
    if (!(f in incoming)) {
      continue;
    }
    const a = normalize(existing[f]);
    const b = normalize(incoming[f]);
    if (!Bun.deepEquals(a, b)) {
      diffs.push({ field: f, from: a, to: b });
    }
  }
  return diffs;
}

/**
 * Ingest card data from a named source into card_sources / printing_sources.
 *
 * Card matching is done dynamically via card name / card_name_aliases — there
 * is no stored card_id on card_sources.
 *
 * The entire import runs in a single transaction so that a failure in any card
 * rolls back the whole batch (all-or-nothing).
 *
 * Performance: bulk-fetches all existing data before the loop so the hot path
 * only does writes (~5 bulk SELECTs up front instead of ~7 queries per card).
 *
 * @returns Counts of new, updated, unchanged cards and any errors.
 */
export async function ingestCardSources(
  db: Kysely<Database>,
  source: string,
  cards: IngestCard[],
): Promise<IngestResult> {
  if (!source.trim()) {
    throw new Error("source name must not be empty");
  }

  let newCards = 0;
  let updates = 0;
  let unchanged = 0;
  const errors: string[] = [];
  const updatedCards: UpdatedCardDetail[] = [];

  await db.transaction().execute(async (trx) => {
    // ── Phase 1: Bulk-fetch all existing data ──────────────────────────────

    // 1a. All existing card_sources for this source (keyed by source_id or name)
    const existingCSRows = await trx
      .selectFrom("card_sources")
      .selectAll()
      .where("source", "=", source)
      .execute();

    // Index by (source_id) and by (name where source_id is null)
    const csBySid = new Map<string, (typeof existingCSRows)[number]>();
    const csByName = new Map<string, (typeof existingCSRows)[number]>();
    for (const row of existingCSRows) {
      if (row.source_id) {
        csBySid.set(row.source_id, row);
      } else {
        csByName.set(row.name, row);
      }
    }

    // 1b. All cards (for norm_name → id resolution)
    const allCards = await trx.selectFrom("cards").select(["id", "norm_name"]).execute();
    const cardByNorm = new Map<string, string>();
    for (const c of allCards) {
      cardByNorm.set(c.norm_name, c.id);
    }

    // 1c. All card_name_aliases (for norm_name → card_id fallback)
    const allAliases = await trx
      .selectFrom("card_name_aliases")
      .select(["norm_name", "card_id"])
      .execute();
    const aliasByNorm = new Map<string, string>();
    for (const a of allAliases) {
      aliasByNorm.set(a.norm_name, a.card_id);
    }

    // 1d. All printings (for slug → id resolution)
    const allPrintings = await trx.selectFrom("printings").select(["id", "slug"]).execute();
    const printingBySlug = new Map<string, string>();
    for (const p of allPrintings) {
      printingBySlug.set(p.slug, p.id);
    }

    // 1e. All existing printing_sources for card_sources owned by this source.
    // We need the card_source_ids first, so collect from the existing rows.
    const existingCSIds = new Set(existingCSRows.map((r) => r.id));
    let existingPSRows: Awaited<
      ReturnType<
        ReturnType<ReturnType<typeof trx.selectFrom<"printing_sources">>["selectAll"]>["execute"]
      >
    > = [];
    if (existingCSIds.size > 0) {
      existingPSRows = await trx
        .selectFrom("printing_sources")
        .selectAll()
        .where("card_source_id", "in", [...existingCSIds])
        .execute();
    }

    // Index printing_sources two ways:
    // - by (card_source_id, printing_id) for rows with a printing_id
    // - by (card_source_id, source_id, finish) for rows without
    const psByPrintingId = new Map<string, (typeof existingPSRows)[number]>();
    const psBySourceFinish = new Map<string, (typeof existingPSRows)[number]>();
    for (const ps of existingPSRows) {
      if (ps.printing_id) {
        psByPrintingId.set(`${ps.card_source_id}:${ps.printing_id}`, ps);
      }
      psBySourceFinish.set(`${ps.card_source_id}:${ps.source_id}:${ps.finish}`, ps);
    }

    // ── Phase 2: Process each card (writes only) ───────────────────────────

    for (const card of cards) {
      // Validate card data against DB CHECK constraints (using normalized values)
      const cardValidation = cardSourceValidator.safeParse({
        name: card.name,
        type: card.type,
        might: card.might,
        energy: card.energy,
        power: card.power,
        might_bonus: card.might_bonus,
        rules_text: emptyToNull(card.rules_text),
        effect_text: emptyToNull(card.effect_text),
        source_id: card.source_id ?? null,
        source_entity_id: card.source_entity_id ?? null,
      });
      if (!cardValidation.success) {
        errors.push(
          `Card "${card.name}": ${cardValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
        continue;
      }

      // Look up existing card_source from pre-fetched data
      const existingCardSource = card.source_id
        ? csBySid.get(card.source_id)
        : csByName.get(card.name);

      let cardSourceId: string;

      if (existingCardSource) {
        const changedFields = getChangedFields(
          existingCardSource as unknown as Record<string, unknown>,
          card as unknown as Record<string, unknown>,
          CARD_FIELDS,
        );

        if (changedFields.length > 0) {
          updatedCards.push({
            name: card.name,
            sourceId: card.source_id ?? null,
            fields: changedFields,
          });
          await trx
            .updateTable("card_sources")
            .set({
              name: card.name,
              type: card.type,
              super_types: card.super_types,
              domains: card.domains,
              might: card.might,
              energy: card.energy,
              power: card.power,
              might_bonus: card.might_bonus,
              rules_text: emptyToNull(card.rules_text),
              effect_text: emptyToNull(card.effect_text),
              tags: card.tags,
              ...(card.source_id !== undefined && { source_id: card.source_id ?? null }),
              ...(card.source_entity_id !== undefined && {
                source_entity_id: card.source_entity_id ?? null,
              }),
              ...(card.extra_data !== undefined && { extra_data: jsonOrNull(card.extra_data) }),
              checked_at: null,
              updated_at: new Date(),
            })
            .where("id", "=", existingCardSource.id)
            .execute();
          updates++;
        } else {
          unchanged++;
        }
        cardSourceId = existingCardSource.id;
      } else {
        const [inserted] = await trx
          .insertInto("card_sources")
          .values({
            source,
            name: card.name,
            type: card.type,
            super_types: card.super_types,
            domains: card.domains,
            might: card.might,
            energy: card.energy,
            power: card.power,
            might_bonus: card.might_bonus,
            rules_text: emptyToNull(card.rules_text),
            effect_text: emptyToNull(card.effect_text),
            tags: card.tags,
            ...(card.source_id !== undefined && { source_id: card.source_id ?? null }),
            ...(card.source_entity_id !== undefined && {
              source_entity_id: card.source_entity_id ?? null,
            }),
            ...(card.extra_data !== undefined && { extra_data: jsonOrNull(card.extra_data) }),
          })
          .returning("id")
          .execute();
        cardSourceId = inserted.id;
        newCards++;
      }

      // Resolve card by norm_name from pre-fetched maps
      const normName = normalizeNameForMatching(card.name);
      const effectiveCardId = cardByNorm.get(normName) ?? aliasByNorm.get(normName) ?? null;

      for (const p of card.printings) {
        // Validate printing data against DB CHECK constraints (using normalized values)
        const printingValidation = printingSourceValidator.safeParse({
          source_id: p.source_id,
          set_id: p.set_id,
          set_name: p.set_name ?? null,
          collector_number: p.collector_number,
          rarity: p.rarity,
          art_variant: p.art_variant,
          finish: p.finish,
          artist: p.artist,
          public_code: p.public_code,
          printed_rules_text: emptyToNull(p.printed_rules_text),
          printed_effect_text: emptyToNull(p.printed_effect_text),
          image_url: p.image_url ?? null,
          flavor_text: p.flavor_text ?? null,
          source_entity_id: p.source_entity_id ?? null,
        });
        if (!printingValidation.success) {
          errors.push(
            `Printing "${p.source_id}" for card "${card.name}": ${printingValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
          );
          continue;
        }

        const printingSlug = effectiveCardId
          ? buildPrintingId(p.source_id, p.rarity, p.is_promo, p.finish)
          : null;
        const resolvedPrintingId = printingSlug ? (printingBySlug.get(printingSlug) ?? null) : null;

        // Look up existing printing_source from pre-fetched maps
        const existingPS = resolvedPrintingId
          ? psByPrintingId.get(`${cardSourceId}:${resolvedPrintingId}`)
          : psBySourceFinish.get(`${cardSourceId}:${p.source_id}:${p.finish}`);

        const printingFields = {
          source_id: p.source_id,
          set_id: p.set_id,
          set_name: p.set_name ?? null,
          collector_number: p.collector_number,
          rarity: p.rarity,
          art_variant: p.art_variant,
          is_signed: p.is_signed,
          is_promo: p.is_promo,
          finish: p.finish,
          artist: p.artist,
          public_code: p.public_code,
          printed_rules_text: emptyToNull(p.printed_rules_text),
          printed_effect_text: emptyToNull(p.printed_effect_text),
          image_url: p.image_url ?? null,
          flavor_text: p.flavor_text ?? null,
          ...(p.source_entity_id !== undefined && {
            source_entity_id: p.source_entity_id ?? null,
          }),
          extra_data: jsonOrNull(p.extra_data),
        };

        if (existingPS) {
          const pChangedFields = getChangedFields(
            existingPS as unknown as Record<string, unknown>,
            printingFields as unknown as Record<string, unknown>,
            Object.keys(printingFields),
          );

          if (pChangedFields.length > 0) {
            await trx
              .updateTable("printing_sources")
              .set({
                ...printingFields,
                // Preserve manually-assigned printing_id; only auto-assign if unset
                ...(!existingPS.printing_id && resolvedPrintingId
                  ? { printing_id: resolvedPrintingId }
                  : {}),
                checked_at: null,
                updated_at: new Date(),
              })
              .where("id", "=", existingPS.id)
              .execute();
          } else if (resolvedPrintingId && !existingPS.printing_id) {
            await trx
              .updateTable("printing_sources")
              .set({ printing_id: resolvedPrintingId, updated_at: new Date() })
              .where("id", "=", existingPS.id)
              .execute();
          }
        } else {
          await trx
            .insertInto("printing_sources")
            .values({
              card_source_id: cardSourceId,
              printing_id: resolvedPrintingId,
              ...printingFields,
            })
            .execute();
        }
      }
    }
  });

  return { newCards, updates, unchanged, errors, updatedCards };
}
