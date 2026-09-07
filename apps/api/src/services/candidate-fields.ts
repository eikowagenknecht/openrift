/**
 * Maps `IngestCard` / `IngestPrinting` to validator payloads and candidate DB
 * rows. Both ingest entry points map the same payload to the same columns, so
 * the mapping lives here once.
 */
import type { IngestCard, IngestPrinting } from "@openrift/shared/contracts/admin/card-mutations";
import { emptyToNull } from "@openrift/shared/utils";
import type { Insertable } from "kysely";
import { z } from "zod";

import type { CandidateCardsTable, CandidatePrintingsTable } from "../db/index.js";
import { candidateCardFieldRules, candidatePrintingFieldRules } from "../db/schemas.js";

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

/** Applies the same empty-to-null coercion as {@link buildCandidateCardFields}. */
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

/** Applies the same empty-to-null coercion as {@link buildCandidatePrintingFields}. */
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

/** Matches the `<> '{}' AND <> 'null'::jsonb` CHECK on both candidate tables. */
function jsonOrNull(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return null;
  }
  return value;
}

export type CandidateCardFields = Omit<Insertable<CandidateCardsTable>, "provider">;

export type CandidatePrintingFields = Omit<
  Insertable<CandidatePrintingsTable>,
  "candidateCardId" | "printingId"
>;

/** Callers add `provider` and, for user submissions, the submitter attribution. */
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

/** Marker slugs are sorted here so the stored order matches the one the link key is built from. */
export function buildCandidatePrintingFields(printing: IngestPrinting): CandidatePrintingFields {
  return {
    shortCode: printing.short_code,
    setId: printing.set_id,
    setName: printing.set_name,
    rarity: printing.rarity,
    artVariant: printing.art_variant,
    isSigned: printing.is_signed,
    isOvernumbered: printing.is_overnumbered,
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
    printedYear: printing.printed_year,
    externalId: printing.external_id,
    extraData: jsonOrNull(printing.extra_data),
  };
}
