import { buildPrintingId, emptyToNull, normalizeNameForMatching } from "@openrift/shared/utils";
import type { Kysely } from "kysely";
import { z } from "zod";

import type { Database } from "../db/index.js";
import { candidateCardFieldRules, candidatePrintingFieldRules } from "../db/schemas.js";
import { ingestRepo } from "../repositories/ingest.js";
import { promoTypesRepo } from "../repositories/promo-types.js";
import type { IngestCard } from "../routes/admin/candidates/schemas.js";

interface ItemDetail {
  name: string;
  shortCode: string | null;
}

interface UpdatedCardDetail extends ItemDetail {
  fields: { field: string; from: unknown; to: unknown }[];
}

interface IngestResult {
  provider: string;
  newCards: number;
  removedCards: number;
  updates: number;
  unchanged: number;
  newPrintings: number;
  removedPrintings: number;
  printingUpdates: number;
  printingsUnchanged: number;
  errors: string[];
  newCardDetails: ItemDetail[];
  removedCardDetails: ItemDetail[];
  updatedCards: UpdatedCardDetail[];
  newPrintingDetails: ItemDetail[];
  removedPrintingDetails: ItemDetail[];
  updatedPrintings: UpdatedCardDetail[];
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
  shortCode: "short_code",
  externalId: "external_id",
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
const candidateCardValidator = z.object({
  name: candidateCardFieldRules.name,
  type: candidateCardFieldRules.type,
  might: candidateCardFieldRules.might,
  energy: candidateCardFieldRules.energy,
  power: candidateCardFieldRules.power,
  might_bonus: candidateCardFieldRules.mightBonus,
  rules_text: candidateCardFieldRules.rulesText,
  effect_text: candidateCardFieldRules.effectText,
  short_code: candidateCardFieldRules.shortCode,
  external_id: candidateCardFieldRules.externalId,
});

const candidatePrintingValidator = z.object({
  short_code: candidatePrintingFieldRules.shortCode,
  set_id: candidatePrintingFieldRules.setId,
  set_name: candidatePrintingFieldRules.setName,
  collector_number: candidatePrintingFieldRules.collectorNumber,
  rarity: candidatePrintingFieldRules.rarity,
  art_variant: candidatePrintingFieldRules.artVariant,
  finish: candidatePrintingFieldRules.finish,
  artist: candidatePrintingFieldRules.artist,
  public_code: candidatePrintingFieldRules.publicCode,
  printed_rules_text: candidatePrintingFieldRules.printedRulesText,
  printed_effect_text: candidatePrintingFieldRules.printedEffectText,
  image_url: candidatePrintingFieldRules.imageUrl,
  flavor_text: candidatePrintingFieldRules.flavorText,
  external_id: candidatePrintingFieldRules.externalId,
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
 * Ingest card data from a named provider into candidate_cards / candidate_printings.
 *
 * Card matching is done dynamically via card name / card_name_aliases — there
 * is no stored card_id on candidate_cards.
 *
 * The entire import runs in a single transaction so that a failure in any card
 * rolls back the whole batch (all-or-nothing).
 *
 * Performance: bulk-fetches all existing data before the loop so the hot path
 * only does writes (~5 bulk SELECTs up front instead of ~7 queries per card).
 *
 * @returns Counts of new, updated, unchanged cards and any errors.
 */
export async function ingestCandidates(
  db: Kysely<Database>,
  provider: string,
  cards: IngestCard[],
): Promise<IngestResult> {
  if (!provider.trim()) {
    throw new Error("provider name must not be empty");
  }

  let newCards = 0;
  let removedCards = 0;
  let updates = 0;
  let unchanged = 0;
  let newPrintings = 0;
  let removedPrintings = 0;
  let printingUpdates = 0;
  let printingsUnchanged = 0;
  const errors: string[] = [];
  const newCardDetails: ItemDetail[] = [];
  const removedCardDetails: ItemDetail[] = [];
  const updatedCards: UpdatedCardDetail[] = [];
  const newPrintingDetails: ItemDetail[] = [];
  const removedPrintingDetails: ItemDetail[] = [];
  const updatedPrintings: UpdatedCardDetail[] = [];

  await db.transaction().execute(async (trx) => {
    const repo = ingestRepo(trx);

    // ── Phase 1: Bulk-fetch all existing data ──────────────────────────────

    // 1a. All existing candidate_cards for this provider (keyed by short_code or name)
    const existingCCRows = await repo.allCandidateCardsForProvider(provider);

    // Index by externalId (the provider's stable identifier for each card)
    const ccByExternalId = new Map<string, (typeof existingCCRows)[number]>();
    for (const row of existingCCRows) {
      ccByExternalId.set(row.externalId, row);
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

    // 1e. All existing candidate_printings for candidate_cards owned by this provider.
    // We need the candidate_card_ids first, so collect from the existing rows.
    const existingCCIds = new Set(existingCCRows.map((r) => r.id));
    let existingCPRows: Awaited<ReturnType<typeof repo.candidatePrintingsByCandidateCardIds>> = [];
    if (existingCCIds.size > 0) {
      existingCPRows = await repo.candidatePrintingsByCandidateCardIds([...existingCCIds]);
    }

    // Index candidate_printings by externalId (the provider's stable identifier)
    const cpByExternalId = new Map<string, (typeof existingCPRows)[number]>();
    for (const cp of existingCPRows) {
      if (cp.externalId) {
        cpByExternalId.set(cp.externalId, cp);
      }
    }

    // 1f. Ignored candidates — load once and build lookup sets
    const ignoredCardRows = await repo.ignoredCandidateCards(provider);
    const ignoredCards = new Set(ignoredCardRows.map((r) => r.externalId));

    const ignoredPrintingRows = await repo.ignoredCandidatePrintings(provider);
    // Key: "entityId" for all-finish ignores, "entityId:finish" for specific finish
    const ignoredPrintings = new Set<string>();
    for (const r of ignoredPrintingRows) {
      if (r.finish === null) {
        ignoredPrintings.add(r.externalId);
      } else {
        ignoredPrintings.add(`${r.externalId}:${r.finish}`);
      }
    }

    // 1g. Printing link overrides (manual links that survive re-uploads)
    const overrideRows = await repo.allPrintingLinkOverrides();
    // Key: "entityId:finish" → printing slug
    const linkOverrides = new Map<string, string>();
    for (const r of overrideRows) {
      linkOverrides.set(`${r.externalId}:${r.finish}`, r.printingSlug);
    }

    // 1h. Default promo type ID (for is_promo=true in upload data)
    const defaultPromoType = await promoTypesRepo(trx).getBySlug("promo");
    const defaultPromoTypeId = defaultPromoType?.id ?? null;

    // ── Phase 2: Process each card (writes only) ───────────────────────────

    const seenCCIds = new Set<string>();
    const seenCPIds = new Set<string>();

    for (const card of cards) {
      // Validate card data against DB CHECK constraints (using normalized values)
      const cardValidation = candidateCardValidator.safeParse({
        name: card.name,
        type: card.type,
        might: card.might,
        energy: card.energy,
        power: card.power,
        might_bonus: card.might_bonus,
        rules_text: emptyToNull(card.rules_text),
        effect_text: emptyToNull(card.effect_text),
        short_code: card.short_code ?? null,
        external_id: card.external_id,
      });
      if (!cardValidation.success) {
        errors.push(
          `Card "${card.name}": ${cardValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
        continue;
      }

      // Skip ignored candidate cards
      if (ignoredCards.has(card.external_id)) {
        continue;
      }

      // Look up existing candidate_card by externalId (provider's stable key)
      const existingCandidateCard = ccByExternalId.get(card.external_id);

      let candidateCardId: string;

      if (existingCandidateCard) {
        const changedFields = getChangedFields(
          existingCandidateCard as unknown as Record<string, unknown>,
          card as unknown as Record<string, unknown>,
          CARD_FIELDS,
          CARD_FIELD_MAP,
        );

        if (changedFields.length > 0) {
          updatedCards.push({
            name: card.name,
            shortCode: card.short_code ?? null,
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
            externalId: card.external_id,
            checkedAt: null,
          };
          if (card.short_code !== undefined) {
            cardUpdate.shortCode = card.short_code ?? null;
          }
          if (card.extra_data !== undefined) {
            cardUpdate.extraData = jsonOrNull(card.extra_data);
          }
          await repo.updateCandidateCard(existingCandidateCard.id, cardUpdate);
          updates++;
        } else {
          unchanged++;
        }
        candidateCardId = existingCandidateCard.id;
        seenCCIds.add(candidateCardId);
      } else {
        const cardInsert: Record<string, unknown> = {
          provider,
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
          externalId: card.external_id,
        };
        if (card.short_code !== undefined) {
          cardInsert.shortCode = card.short_code ?? null;
        }
        if (card.extra_data !== undefined) {
          cardInsert.extraData = jsonOrNull(card.extra_data);
        }
        candidateCardId = await repo.insertCandidateCard(cardInsert);
        seenCCIds.add(candidateCardId);
        newCardDetails.push({ name: card.name, shortCode: card.short_code ?? null });
        newCards++;
      }

      // Resolve card by norm_name from pre-fetched maps
      const normName = normalizeNameForMatching(card.name);
      const effectiveCardId = cardByNorm.get(normName) ?? aliasByNorm.get(normName) ?? null;

      for (const p of card.printings) {
        // Validate printing data against DB CHECK constraints (using normalized values)
        const printingValidation = candidatePrintingValidator.safeParse({
          short_code: p.short_code,
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
          external_id: p.external_id,
        });
        if (!printingValidation.success) {
          errors.push(
            `Printing "${p.short_code}" for card "${card.name}": ${printingValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
          );
          continue;
        }

        // Skip ignored candidate printings (check all-finish ignore, then specific finish)
        if (
          ignoredPrintings.has(p.external_id) ||
          ignoredPrintings.has(`${p.external_id}:${p.finish}`)
        ) {
          continue;
        }

        const printingSlug =
          effectiveCardId && p.rarity && p.finish
            ? buildPrintingId(p.short_code, p.is_promo ? "promo" : null, p.finish)
            : null;

        // Check for a manual link override (survives delete + re-upload)
        const overrideSlug = linkOverrides.get(`${p.external_id}:${p.finish ?? ""}`);
        const resolvedPrintingId = overrideSlug
          ? (printingBySlug.get(overrideSlug) ?? null)
          : printingSlug
            ? (printingBySlug.get(printingSlug) ?? null)
            : null;

        // Look up existing candidate_printing by external_id (provider's stable key)
        const existingCP = cpByExternalId.get(p.external_id);

        const printingFields = {
          shortCode: p.short_code,
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
          externalId: p.external_id,
          extraData: jsonOrNull(p.extra_data),
        };

        if (existingCP) {
          seenCPIds.add(existingCP.id);
          const pChangedFields = getChangedFields(
            existingCP as unknown as Record<string, unknown>,
            printingFields as unknown as Record<string, unknown>,
            Object.keys(printingFields),
          );

          if (pChangedFields.length > 0) {
            updatedPrintings.push({
              name: card.name,
              shortCode: p.short_code,
              fields: pChangedFields,
            });
            printingUpdates++;
            const cpUpdate: Record<string, unknown> = {
              ...printingFields,
              checkedAt: null,
            };
            if (!existingCP.printingId && resolvedPrintingId) {
              cpUpdate.printingId = resolvedPrintingId;
            }
            await repo.updateCandidatePrinting(existingCP.id, cpUpdate);
          } else if (resolvedPrintingId && !existingCP.printingId) {
            await repo.updateCandidatePrinting(existingCP.id, {
              printingId: resolvedPrintingId,
            });
            printingsUnchanged++;
          } else {
            printingsUnchanged++;
          }
        } else {
          await repo.insertCandidatePrinting({
            candidateCardId,
            printingId: resolvedPrintingId,
            ...printingFields,
          });
          newPrintingDetails.push({ name: card.name, shortCode: p.short_code });
          newPrintings++;
        }
      }
    }

    // ── Phase 3: Remove cards/printings no longer in the upload ────────────

    // Build card-name lookup for removed printings
    const ccIdToName = new Map(existingCCRows.map((cc) => [cc.id, cc.name]));

    const cpsToRemove = existingCPRows.filter((cp) => !seenCPIds.has(cp.id));
    if (cpsToRemove.length > 0) {
      await repo.deleteCandidatePrintings(cpsToRemove.map((cp) => cp.id));
      removedPrintings = cpsToRemove.length;
      for (const cp of cpsToRemove) {
        removedPrintingDetails.push({
          name: ccIdToName.get(cp.candidateCardId) ?? "unknown",
          shortCode: cp.shortCode ?? null,
        });
      }
    }

    const ccsToRemove = existingCCRows.filter((cc) => !seenCCIds.has(cc.id));
    if (ccsToRemove.length > 0) {
      await repo.deleteCandidateCards(ccsToRemove.map((cc) => cc.id));
      removedCards = ccsToRemove.length;
      for (const cc of ccsToRemove) {
        removedCardDetails.push({ name: cc.name, shortCode: cc.shortCode ?? null });
      }
    }
  });

  return {
    provider,
    newCards,
    removedCards,
    updates,
    unchanged,
    newPrintings,
    removedPrintings,
    printingUpdates,
    printingsUnchanged,
    errors,
    newCardDetails,
    removedCardDetails,
    updatedCards,
    newPrintingDetails,
    removedPrintingDetails,
    updatedPrintings,
  };
}
