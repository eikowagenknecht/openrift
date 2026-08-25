import type { DiffValue } from "@openrift/shared/response-schemas";
import type { Insertable, Updateable } from "kysely";

import type { CandidateCardsTable, CandidatePrintingsTable } from "../db/index.js";
import type { Transact } from "../deps.js";
import type { IngestCard } from "../routes/admin/cards/schemas.js";
import {
  buildCandidateCardFields,
  buildCandidatePrintingFields,
  candidateCardValidator,
  candidateCardValidatorInput,
  candidatePrintingValidator,
  candidatePrintingValidatorInput,
} from "./candidate-fields.js";
import {
  loadCandidateLinkIndex,
  resolveCardIdByName,
  resolvePrintingLink,
} from "./candidate-links.js";

interface ItemDetail {
  name: string;
  shortCode: string | null;
}

interface UpdatedCardDetail extends ItemDetail {
  fields: { field: string; from: DiffValue; to: DiffValue }[];
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

/** Maps camelCase DB column names to snake_case IngestCard field names. */
const CARD_FIELD_MAP: Record<string, string> = {
  name: "name",
  types: "types",
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
    const camel = k.replaceAll(/_(?<letter>[a-z])/gu, (_, letter: string) => letter.toUpperCase());
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

const isDiffScalar = (v: unknown): v is string | number | boolean | null =>
  v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/**
 * Coerces a normalized field value into the serializable {@link DiffValue} the
 * response contract exposes (scalar or scalar[]). Non-scalar values — notably
 * `extra_data`, an arbitrary JSON object — are JSON-stringified so the diff stays
 * human-readable without widening `diffValueSchema` to a recursive JSON type
 * (which breaks openapi/hc/tanstack — see response-schemas.ts). Change detection
 * still runs on the raw normalized values, so this only affects display.
 */
function toDiffValue(value: unknown): DiffValue {
  if (isDiffScalar(value)) {
    return value;
  }
  if (Array.isArray(value) && value.every((v) => isDiffScalar(v))) {
    return value;
  }
  return JSON.stringify(value);
}

function getChangedFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  fields: readonly string[],
  fieldMap?: Record<string, string>,
): { field: string; from: DiffValue; to: DiffValue }[] {
  const diffs: { field: string; from: DiffValue; to: DiffValue }[] = [];
  for (const f of fields) {
    const incomingKey = fieldMap?.[f] ?? f;
    if (!(incomingKey in incoming)) {
      continue;
    }
    const a = normalize(existing[f]);
    const b = normalize(incoming[incomingKey]);
    if (!Bun.deepEquals(a, b)) {
      diffs.push({ field: f, from: toDiffValue(a), to: toDiffValue(b) });
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
 */
export async function ingestCandidates(
  transact: Transact,
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

  // Defense-in-depth: a provider payload must never carry two cards or two
  // printings that share an external_id. If it does, the per-external_id upsert
  // below resolves the same DB row twice and the stored values depend on which
  // duplicate happened to be processed — or fetched — last: a silent,
  // order-dependent flip on every re-upload. Drop later duplicates
  // deterministically (first occurrence wins) and surface each dropped id.
  const seenCardExternalIds = new Set<string>();
  const seenPrintingExternalIds = new Set<string>();
  const dedupedCards: IngestCard[] = [];
  for (const card of cards) {
    if (seenCardExternalIds.has(card.external_id)) {
      errors.push(
        `Duplicate card external_id "${card.external_id}" (card "${card.name}") — dropped duplicate, keeping first occurrence`,
      );
      continue;
    }
    seenCardExternalIds.add(card.external_id);

    const printings: IngestCard["printings"] = [];
    for (const p of card.printings) {
      if (seenPrintingExternalIds.has(p.external_id)) {
        errors.push(
          `Duplicate printing external_id "${p.external_id}" (card "${card.name}") — dropped duplicate, keeping first occurrence`,
        );
        continue;
      }
      seenPrintingExternalIds.add(p.external_id);
      printings.push(p);
    }
    dedupedCards.push({ ...card, printings });
  }

  await transact(async (trxRepos) => {
    const repo = trxRepos.ingest;

    const existingCCRows = await repo.allCandidateCardsForProvider(provider);

    const ccByExternalId = new Map<string, (typeof existingCCRows)[number]>();
    for (const row of existingCCRows) {
      ccByExternalId.set(row.externalId, row);
    }

    // Shared index behind card and printing link resolution (see candidate-links.ts).
    const linkIndex = await loadCandidateLinkIndex(repo);

    const existingCCIds = new Set(existingCCRows.map((r) => r.id));
    let existingCPRows: Awaited<ReturnType<typeof repo.candidatePrintingsByCandidateCardIds>> = [];
    if (existingCCIds.size > 0) {
      existingCPRows = await repo.candidatePrintingsByCandidateCardIds([...existingCCIds]);
    }

    const cpByExternalId = new Map<string, (typeof existingCPRows)[number]>();
    for (const cp of existingCPRows) {
      if (cp.externalId) {
        cpByExternalId.set(cp.externalId, cp);
      }
    }

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

    const seenCCIds = new Set<string>();
    const seenCPIds = new Set<string>();

    for (const card of dedupedCards) {
      const cardValidation = candidateCardValidator.safeParse(candidateCardValidatorInput(card));
      if (!cardValidation.success) {
        errors.push(
          `Card "${card.name}": ${cardValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
        continue;
      }

      if (ignoredCards.has(card.external_id)) {
        continue;
      }

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
          // Same column mapping as the insert branch below (buildCandidateCardFields),
          // plus checkedAt: an update means the upload disagreed with what a
          // human already reviewed, so it goes back into the review queue.
          const cardUpdate: Updateable<CandidateCardsTable> = {
            ...buildCandidateCardFields(card),
            checkedAt: null,
          };
          await repo.updateCandidateCard(existingCandidateCard.id, cardUpdate);
          updates++;
        } else {
          unchanged++;
        }
        candidateCardId = existingCandidateCard.id;
        seenCCIds.add(candidateCardId);
      } else {
        const cardInsert: Insertable<CandidateCardsTable> = {
          provider,
          ...buildCandidateCardFields(card),
        };
        candidateCardId = await repo.insertCandidateCard(cardInsert);
        seenCCIds.add(candidateCardId);
        newCardDetails.push({ name: card.name, shortCode: card.short_code ?? null });
        newCards++;
      }

      // Whether this candidate's card resolves to a live one — the gate on
      // printing link resolution below.
      const cardLinked = resolveCardIdByName(linkIndex, card.name) !== null;

      for (const p of card.printings) {
        const printingValidation = candidatePrintingValidator.safeParse(
          candidatePrintingValidatorInput(p),
        );
        if (!printingValidation.success) {
          errors.push(
            `Printing "${p.short_code}" for card "${card.name}": ${printingValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
          );
          continue;
        }

        if (
          ignoredPrintings.has(p.external_id) ||
          ignoredPrintings.has(`${p.external_id}:${p.finish}`)
        ) {
          continue;
        }

        const resolvedPrintingId = resolvePrintingLink(linkIndex, {
          provider,
          externalId: p.external_id,
          shortCode: p.short_code,
          finish: p.finish,
          markerSlugs: p.marker_slugs,
          language: p.language,
          cardLinked,
        });

        const existingCP = cpByExternalId.get(p.external_id);

        const printingFields = buildCandidatePrintingFields(p);

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
            const cpUpdate: Updateable<CandidatePrintingsTable> = {
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
