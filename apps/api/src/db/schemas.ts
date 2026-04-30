import { z } from "zod";

/* oxlint-disable no-unused-vars -- imported for JSDoc @link cross-references */
import type {
  CandidateCardsTable,
  CandidatePrintingsTable,
  CardErrataTable,
  CardsTable,
  PrintingsTable,
  SetsTable,
} from "./tables.js";
/* oxlint-enable no-unused-vars */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Field rules — mirror DB constraints (FKs for ref-table-backed fields,
// CHECK constraints for everything else). Single source of truth.
// ---------------------------------------------------------------------------

// ── Card data ─────────────────────────────────────────────────────────────

/** Mirrors DB constraints on the `sets` table. @see {@link SetsTable} */
export const setFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0).nullable(),
  setType: z.enum(["main", "supplemental"]),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB constraints on the `cards` table. @see {@link CardsTable} */
export const cardFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  superTypes: z.array(z.string().min(1)),
  domains: z.array(z.string().min(1)).min(1),
  might: z.number().min(0).nullable(),
  energy: z.number().min(0).nullable(),
  power: z.number().min(0).nullable(),
  mightBonus: z.number().min(0).nullable(),
  tags: z.array(z.string()),
  comment: z.string().min(1).nullable(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB constraints on the `card_errata` table. @see {@link CardErrataTable} */
export const cardErrataFieldRules = {
  correctedRulesText: z.string().min(1).nullable(),
  correctedEffectText: z.string().min(1).nullable(),
  source: z.string().min(1),
  sourceUrl: z.string().min(1).nullable(),
  effectiveDate: z.string().nullable(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB constraints on the `printings` table. @see {@link PrintingsTable} */
export const printingFieldRules = {
  slug: z.string().min(1),
  shortCode: z.string().min(1),
  setId: z.string().min(1),
  rarity: z.string().min(1),
  artVariant: z.string().min(1),
  finish: z.string().min(1),
  artist: z.string().min(1),
  publicCode: z.string().min(1),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  comment: z.string().min(1).nullable(),
  printedYear: z.number().int().min(1900).max(2999).nullable(),
} satisfies Record<string, z.ZodType>;

// ── Candidate cards ──────────────────────────────────────────────────────

/** Mirrors DB CHECK constraints on the `candidate_cards` table. @see {@link CandidateCardsTable} */
export const candidateCardFieldRules = {
  provider: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1).nullable(),
  might: z.number().min(0).nullable(),
  energy: z.number().min(0).nullable(),
  power: z.number().min(0).nullable(),
  mightBonus: z.number().min(0).nullable(),
  rulesText: z.string().min(1).nullable(),
  effectText: z.string().min(1).nullable(),
  shortCode: z.string().min(1).nullable(),
  externalId: z.string().min(1),
  extraData: noEmptyJsonb,
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `candidate_printings` table. @see {@link CandidatePrintingsTable} */
export const candidatePrintingFieldRules = {
  shortCode: z.string().min(1),
  setId: z.string().min(1).nullable(),
  setName: z.string().min(1).nullable(),
  rarity: z.string().min(1).nullable(),
  artVariant: z.string().min(1).nullable(),
  finish: z.string().min(1).nullable(),
  artist: z.string().min(1).nullable(),
  publicCode: z.string().min(1).nullable(),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  imageUrl: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  externalId: z.string().min(1),
  extraData: noEmptyJsonb,
} satisfies Record<string, z.ZodType>;
