import { buildPrintingId, emptyToNull, normalizeNameForMatching } from "@openrift/shared/utils";
import type { Kysely } from "kysely";
import { z } from "zod";

import type { Database } from "../db/index.js";
import { cardSourceFieldRules, printingSourceFieldRules } from "../db/schemas.js";
import { ingestRepo } from "../repositories/ingest.js";
import type { IngestCard } from "../routes/admin/card-sources/schemas.js";

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

/** Maps camelCase DB column names to snake_case IngestCard field names. */
const CARD_FIELD_MAP: Record<string, string> = {
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
  sourceId: "source_id",
  sourceEntityId: "source_entity_id",
  extraData: "extra_data",
};

const CARD_FIELDS = Object.keys(CARD_FIELD_MAP);

function camelCaseKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replaceAll(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length === 0) {
      return null;
    }
    return camelCaseKeys(obj);
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
  fieldMap?: Record<string, string>,
): { field: string; from: unknown; to: unknown }[] {
  const diffs: { field: string; from: unknown; to: unknown }[] = [];
  for (const f of fields) {
    const incomingKey = fieldMap?.[f] ?? f;
    if (!(incomingKey in incoming)) {
      continue;
    }
    const a = normalize(existing[f]);
    const b = normalize(incoming[incomingKey]);
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
    const repo = ingestRepo(trx);

    // ── Phase 1: Bulk-fetch all existing data ──────────────────────────────

    // 1a. All existing card_sources for this source (keyed by source_id or name)
    const existingCSRows = await repo.allCardSourcesForSource(source);

    // Index by (sourceId) and by (name where sourceId is null)
    const csBySid = new Map<string, (typeof existingCSRows)[number]>();
    const csByName = new Map<string, (typeof existingCSRows)[number]>();
    for (const row of existingCSRows) {
      if (row.sourceId) {
        csBySid.set(row.sourceId, row);
      } else {
        csByName.set(row.name, row);
      }
    }

    // 1b. All cards (for normName → id resolution)
    const allCards = await repo.allCardNorms();
    const cardByNorm = new Map<string, string>();
    for (const c of allCards) {
      cardByNorm.set(c.normName, c.id);
    }

    // 1c. All card_name_aliases (for normName → cardId fallback)
    const allAliases = await repo.allCardNameAliases();
    const aliasByNorm = new Map<string, string>();
    for (const a of allAliases) {
      aliasByNorm.set(a.normName, a.cardId);
    }

    // 1d. All printings (for slug → id resolution)
    const allPrintings = await repo.allPrintingSlugs();
    const printingBySlug = new Map<string, string>();
    for (const p of allPrintings) {
      printingBySlug.set(p.slug, p.id);
    }

    // 1e. All existing printing_sources for card_sources owned by this source.
    // We need the card_source_ids first, so collect from the existing rows.
    const existingCSIds = new Set(existingCSRows.map((r) => r.id));
    let existingPSRows: Awaited<ReturnType<typeof repo.printingSourcesByCardSourceIds>> = [];
    if (existingCSIds.size > 0) {
      existingPSRows = await repo.printingSourcesByCardSourceIds([...existingCSIds]);
    }

    // Index printing_sources two ways:
    // - by (cardSourceId, printingId) for rows with a printingId
    // - by (cardSourceId, sourceId, finish) for rows without
    const psByPrintingId = new Map<string, (typeof existingPSRows)[number]>();
    const psBySourceFinish = new Map<string, (typeof existingPSRows)[number]>();
    for (const ps of existingPSRows) {
      if (ps.printingId) {
        psByPrintingId.set(`${ps.cardSourceId}:${ps.printingId}`, ps);
      }
      psBySourceFinish.set(`${ps.cardSourceId}:${ps.sourceId}:${ps.finish}`, ps);
    }

    // 1f. Ignored sources — load once and build lookup sets
    const ignoredCardRows = await repo.ignoredCardSources(source);
    const ignoredCards = new Set(ignoredCardRows.map((r) => r.sourceEntityId));

    const ignoredPrintingRows = await repo.ignoredPrintingSources(source);
    // Key: "entityId" for all-finish ignores, "entityId:finish" for specific finish
    const ignoredPrintings = new Set<string>();
    for (const r of ignoredPrintingRows) {
      if (r.finish === null) {
        ignoredPrintings.add(r.sourceEntityId);
      } else {
        ignoredPrintings.add(`${r.sourceEntityId}:${r.finish}`);
      }
    }

    // 1g. Printing link overrides (manual links that survive re-uploads)
    const overrideRows = await repo.allPrintingLinkOverrides();
    // Key: "entityId:finish" → printing slug
    const linkOverrides = new Map<string, string>();
    for (const r of overrideRows) {
      linkOverrides.set(`${r.sourceEntityId}:${r.finish}`, r.printingSlug);
    }

    // 1h. Default promo type ID (for is_promo=true in upload data)
    const defaultPromoType = await trx
      .selectFrom("promoTypes")
      .select("id")
      .where("slug", "=", "promo")
      .executeTakeFirst();
    const defaultPromoTypeId = defaultPromoType?.id ?? null;

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
        source_entity_id: card.source_entity_id,
      });
      if (!cardValidation.success) {
        errors.push(
          `Card "${card.name}": ${cardValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
        continue;
      }

      // Skip ignored card sources
      if (ignoredCards.has(card.source_entity_id)) {
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
          CARD_FIELD_MAP,
        );

        if (changedFields.length > 0) {
          updatedCards.push({
            name: card.name,
            sourceId: card.source_id ?? null,
            fields: changedFields,
          });
          const cardUpdate: Record<string, unknown> = {
            name: card.name,
            type: card.type,
            superTypes: card.super_types,
            domains: card.domains,
            might: card.might,
            energy: card.energy,
            power: card.power,
            mightBonus: card.might_bonus,
            rulesText: emptyToNull(card.rules_text),
            effectText: emptyToNull(card.effect_text),
            tags: card.tags,
            sourceEntityId: card.source_entity_id,
            checkedAt: null,
          };
          if (card.source_id !== undefined) {
            cardUpdate.sourceId = card.source_id ?? null;
          }
          if (card.extra_data !== undefined) {
            cardUpdate.extraData = jsonOrNull(card.extra_data);
          }
          await repo.updateCardSource(existingCardSource.id, cardUpdate);
          updates++;
        } else {
          unchanged++;
        }
        cardSourceId = existingCardSource.id;
      } else {
        const cardInsert: Record<string, unknown> = {
          source,
          name: card.name,
          type: card.type,
          superTypes: card.super_types,
          domains: card.domains,
          might: card.might,
          energy: card.energy,
          power: card.power,
          mightBonus: card.might_bonus,
          rulesText: emptyToNull(card.rules_text),
          effectText: emptyToNull(card.effect_text),
          tags: card.tags,
          sourceEntityId: card.source_entity_id,
        };
        if (card.source_id !== undefined) {
          cardInsert.sourceId = card.source_id ?? null;
        }
        if (card.extra_data !== undefined) {
          cardInsert.extraData = jsonOrNull(card.extra_data);
        }
        cardSourceId = await repo.insertCardSource(cardInsert);
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
          source_entity_id: p.source_entity_id,
        });
        if (!printingValidation.success) {
          errors.push(
            `Printing "${p.source_id}" for card "${card.name}": ${printingValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
          );
          continue;
        }

        // Skip ignored printing sources (check all-finish ignore, then specific finish)
        if (
          ignoredPrintings.has(p.source_entity_id) ||
          ignoredPrintings.has(`${p.source_entity_id}:${p.finish}`)
        ) {
          continue;
        }

        const printingSlug =
          effectiveCardId && p.rarity && p.finish
            ? buildPrintingId(p.source_id, p.rarity, p.is_promo ? "promo" : null, p.finish)
            : null;

        // Check for a manual link override (survives delete + re-upload)
        const overrideSlug = linkOverrides.get(`${p.source_entity_id}:${p.finish ?? ""}`);
        const resolvedPrintingId = overrideSlug
          ? (printingBySlug.get(overrideSlug) ?? null)
          : printingSlug
            ? (printingBySlug.get(printingSlug) ?? null)
            : null;

        // Look up existing printing_source from pre-fetched maps
        const existingPS = resolvedPrintingId
          ? psByPrintingId.get(`${cardSourceId}:${resolvedPrintingId}`)
          : psBySourceFinish.get(`${cardSourceId}:${p.source_id}:${p.finish}`);

        const printingFields = {
          sourceId: p.source_id,
          setId: p.set_id,
          setName: p.set_name ?? null,
          collectorNumber: p.collector_number,
          rarity: p.rarity,
          artVariant: p.art_variant,
          isSigned: p.is_signed,
          promoTypeId: p.is_promo ? defaultPromoTypeId : null,
          finish: p.finish,
          artist: p.artist,
          publicCode: p.public_code,
          printedRulesText: emptyToNull(p.printed_rules_text),
          printedEffectText: emptyToNull(p.printed_effect_text),
          imageUrl: p.image_url ?? null,
          flavorText: p.flavor_text ?? null,
          sourceEntityId: p.source_entity_id,
          extraData: jsonOrNull(p.extra_data),
        };

        if (existingPS) {
          const pChangedFields = getChangedFields(
            existingPS as unknown as Record<string, unknown>,
            printingFields as unknown as Record<string, unknown>,
            Object.keys(printingFields),
          );

          if (pChangedFields.length > 0) {
            const psUpdate: Record<string, unknown> = {
              ...printingFields,
              checkedAt: null,
            };
            if (!existingPS.printingId && resolvedPrintingId) {
              psUpdate.printingId = resolvedPrintingId;
            }
            await repo.updatePrintingSource(existingPS.id, psUpdate);
          } else if (resolvedPrintingId && !existingPS.printingId) {
            await repo.updatePrintingSource(existingPS.id, {
              printingId: resolvedPrintingId,
            });
          }
        } else {
          await repo.insertPrintingSource({
            cardSourceId,
            printingId: resolvedPrintingId,
            ...printingFields,
          });
        }
      }
    }
  });

  return { newCards, updates, unchanged, errors, updatedCards };
}
