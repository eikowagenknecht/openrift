/**
 * How an `IngestCard` / `IngestPrinting` becomes a validator payload and a
 * candidate DB row.
 *
 * Both ingest entry points — the batch provider upload (`ingest-candidates.ts`)
 * and the in-app user submission (`ingest-user-submission.ts`, ADR-036) — map
 * the same payload to the same columns, so the mapping lives here once rather
 * than being spelled out per service.
 */
import { emptyToNull } from "@openrift/shared/utils";
import type { Insertable } from "kysely";
import { z } from "zod";

import type { CandidateCardsTable, CandidatePrintingsTable } from "../db/index.js";
import { candidateCardFieldRules, candidatePrintingFieldRules } from "../db/schemas.js";
import type { IngestCard, IngestPrinting } from "../routes/admin/cards/schemas.js";

// ── Validation ───────────────────────────────────────────────────────────────
// Built from the DB field rules, so they validate values exactly as they'll be
// written. Both ingest paths validate against these; only the way they report
// the issues differs (an admin batch report vs. a per-field user error list).

export const candidateCardValidator = z.object({
  name: candidateCardFieldRules.name,
  types: candidateCardFieldRules.types,
  might: candidateCardFieldRules.might,
  energy: candidateCardFieldRules.energy,
  power: candidateCardFieldRules.power,
  might_bonus: candidateCardFieldRules.mightBonus,
  rules_text: candidateCardFieldRules.rulesText,
  effect_text: candidateCardFieldRules.effectText,
  short_code: candidateCardFieldRules.shortCode,
  external_id: candidateCardFieldRules.externalId,
});

export const candidatePrintingValidator = z.object({
  short_code: candidatePrintingFieldRules.shortCode,
  set_id: candidatePrintingFieldRules.setId,
  set_name: candidatePrintingFieldRules.setName,
  rarity: candidatePrintingFieldRules.rarity,
  art_variant: candidatePrintingFieldRules.artVariant,
  finish: candidatePrintingFieldRules.finish,
  size: candidatePrintingFieldRules.size,
  artist: candidatePrintingFieldRules.artist,
  public_code: candidatePrintingFieldRules.publicCode,
  printed_rules_text: candidatePrintingFieldRules.printedRulesText,
  printed_effect_text: candidatePrintingFieldRules.printedEffectText,
  image_url: candidatePrintingFieldRules.imageUrl,
  flavor_text: candidatePrintingFieldRules.flavorText,
  external_id: candidatePrintingFieldRules.externalId,
});

/**
 * The subset of an ingest card {@link candidateCardValidator} checks, with the
 * same empty-to-null coercion the insert applies.
 * @param card The ingest card.
 * @returns The payload to `safeParse`.
 */
export function candidateCardValidatorInput(card: IngestCard): Record<string, unknown> {
  return {
    name: card.name,
    types: card.types,
    might: card.might,
    energy: card.energy,
    power: card.power,
    might_bonus: card.might_bonus,
    rules_text: emptyToNull(card.rules_text),
    effect_text: emptyToNull(card.effect_text),
    short_code: card.short_code ?? null,
    external_id: card.external_id,
  };
}

/**
 * The subset of an ingest printing {@link candidatePrintingValidator} checks,
 * with the same empty-to-null coercion the insert applies.
 * @param printing The ingest printing.
 * @returns The payload to `safeParse`.
 */
export function candidatePrintingValidatorInput(printing: IngestPrinting): Record<string, unknown> {
  return {
    short_code: printing.short_code,
    set_id: printing.set_id,
    set_name: printing.set_name,
    rarity: printing.rarity,
    art_variant: printing.art_variant,
    finish: printing.finish,
    size: printing.size,
    artist: printing.artist,
    public_code: printing.public_code,
    printed_rules_text: emptyToNull(printing.printed_rules_text),
    printed_effect_text: emptyToNull(printing.printed_effect_text),
    image_url: printing.image_url,
    flavor_text: printing.flavor_text,
    external_id: printing.external_id,
  };
}

// ── Row shapes ───────────────────────────────────────────────────────────────

/**
 * Normalizes a jsonb payload to null when it carries nothing, matching the
 * `<> '{}' AND <> 'null'::jsonb` CHECK on both candidate tables.
 * @param value The raw `extra_data` from the payload.
 * @returns The value, or null when absent or an empty object.
 */
function jsonOrNull(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return null;
  }
  return value;
}

/** The candidate-card columns derived from the payload, without `provider`. */
export type CandidateCardFields = Omit<Insertable<CandidateCardsTable>, "provider">;

/** The candidate-printing columns derived from the payload, without the links. */
export type CandidatePrintingFields = Omit<
  Insertable<CandidatePrintingsTable>,
  "candidateCardId" | "printingId"
>;

/**
 * Map an ingest card onto its candidate_cards columns. Callers add `provider`
 * and, for user submissions, the submitter attribution.
 * @param card The ingest card.
 * @returns The column values.
 */
export function buildCandidateCardFields(card: IngestCard): CandidateCardFields {
  return {
    name: card.name,
    types: card.types,
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
    shortCode: card.short_code ?? null,
    extraData: jsonOrNull(card.extra_data),
  };
}

/**
 * Map an ingest printing onto its candidate_printings columns. Marker slugs are
 * sorted here so the stored order matches the one the link key is built from.
 * @param printing The ingest printing.
 * @returns The column values.
 */
export function buildCandidatePrintingFields(printing: IngestPrinting): CandidatePrintingFields {
  return {
    shortCode: printing.short_code,
    setId: printing.set_id,
    setName: printing.set_name,
    rarity: printing.rarity,
    artVariant: printing.art_variant,
    isSigned: printing.is_signed,
    markerSlugs: [...printing.marker_slugs].toSorted(),
    distributionChannelSlugs: printing.distribution_channel_slugs,
    finish: printing.finish,
    size: printing.size,
    artist: printing.artist,
    publicCode: printing.public_code,
    printedRulesText: emptyToNull(printing.printed_rules_text),
    printedEffectText: emptyToNull(printing.printed_effect_text),
    imageUrl: printing.image_url,
    flavorText: printing.flavor_text,
    language: printing.language,
    printedName: printing.printed_name,
    externalId: printing.external_id,
    extraData: jsonOrNull(printing.extra_data),
  };
}
