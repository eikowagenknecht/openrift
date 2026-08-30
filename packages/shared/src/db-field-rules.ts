/**
 * Field-level Zod rules that mirror the database CHECK / FK constraints. Single
 * source of truth — anything that builds a Zod object schema for cards,
 * printings or sets (admin endpoints, candidate ingest, contribute form)
 * reuses these.
 *
 * Lives in `@openrift/shared` so both `apps/api` and `apps/web` can import.
 */
import { z } from "zod";

import { WellKnown } from "./well-known.js";

/**
 * Printing `language` codes: 2-letter uppercase, matching the codes Riot prints
 * on the cards rather than ISO 639-1. The two mostly agree, but not always —
 * Simplified Chinese is `SC` here and `zh` in ISO. This only constrains the
 * shape; the `languages` table is the source of truth for which codes exist.
 */
const LANGUAGE_CODE_PATTERN = /^[A-Z]{2}$/u;

/** DB rejects '{}' and 'null'::jsonb but allows SQL NULL. */
const noEmptyJsonb = z
  .unknown()
  .nullable()
  .refine(
    (v) =>
      v === null ||
      v === undefined ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0),
    "Must be null or a non-empty object",
  );

/** Mirrors DB constraints on the `cards` table. */
export const cardFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  /** Ordered card types (ADR-037); at least one, first entry mirrors `cards.type`. */
  types: z.array(z.string().min(1)).min(1),
  superTypes: z.array(z.string().min(1)),
  domains: z.array(z.string().min(1)).min(1),
  might: z.number().int().min(0).nullable(),
  energy: z.number().int().min(0).nullable(),
  power: z.number().int().min(0).nullable(),
  mightBonus: z.number().int().min(0).nullable(),
  tags: z.array(z.string().min(1)),
  maxCopiesOverride: z.number().int().min(0).nullable(),
  comment: z.string().min(1).nullable(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB constraints on the `printings` table. */
export const printingFieldRules = {
  slug: z.string().min(1),
  shortCode: z.string().min(1),
  setId: z.string().min(1),
  rarity: z.string().min(1),
  artVariant: z.string().min(1),
  finish: z.string().min(1),
  size: z.string().min(1),
  artist: z.string().min(1),
  publicCode: z.string().min(1),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  comment: z.string().min(1).nullable(),
  printedYear: z.number().int().min(1900).max(2999).nullable(),
  /**
   * FK → `languages.code`. The regex already pins the length, so callers add
   * only `.nullable()` / `.optional()`. An un-normalized code (`"en"`) would
   * otherwise pass a bare length check and fail later as an opaque FK violation
   * at insert.
   */
  language: z.string().regex(LANGUAGE_CODE_PATTERN, {
    message: "Language must be a 2-letter uppercase code (e.g. EN, SC).",
  }),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB constraints on the `card_errata` table. */
export const cardErrataFieldRules = {
  correctedRulesText: z.string().min(1).nullable(),
  correctedEffectText: z.string().min(1).nullable(),
  source: z.string().min(1),
  sourceUrl: z.string().min(1).nullable(),
  effectiveDate: z.string().nullable(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `candidate_cards` table. */
export const candidateCardFieldRules = {
  provider: z.string().min(1),
  name: z.string().min(1),
  /** Ordered card types (ADR-037); empty when the source didn't provide one. */
  types: z.array(z.string().min(1)),
  might: z.number().int().min(0).nullable(),
  energy: z.number().int().min(0).nullable(),
  power: z.number().int().min(0).nullable(),
  mightBonus: z.number().int().min(0).nullable(),
  rulesText: z.string().min(1).nullable(),
  effectText: z.string().min(1).nullable(),
  shortCode: z.string().min(1).nullable(),
  externalId: z.string().min(1),
  extraData: noEmptyJsonb,
  // ADR-036: contributor's free-text note on an in-app submission (DB CHECK <> '').
  submissionNote: z.string().min(1).nullable(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `candidate_printings` table. */
export const candidatePrintingFieldRules = {
  shortCode: z.string().min(1),
  setId: z.string().min(1).nullable(),
  setName: z.string().min(1).nullable(),
  rarity: z.string().min(1).nullable(),
  artVariant: z.string().min(1).nullable(),
  finish: z.string().min(1).nullable(),
  size: z.string().min(1).nullable(),
  artist: z.string().min(1).nullable(),
  publicCode: z.string().min(1).nullable(),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  imageUrl: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  externalId: z.string().min(1),
  extraData: noEmptyJsonb,
} satisfies Record<string, z.ZodType>;

/** Mirrors DB constraints on the `sets` table. */
export const setFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0).nullable(),
  setType: z.enum([WellKnown.setType.MAIN, WellKnown.setType.SUPPLEMENTAL]),
} satisfies Record<string, z.ZodType>;
