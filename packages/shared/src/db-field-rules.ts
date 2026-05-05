/**
 * Field-level Zod rules that mirror the database CHECK / FK constraints. Single
 * source of truth — anything that builds a Zod object schema for cards or
 * printings (admin endpoints, candidate ingest, contribute form, generated
 * JSON Schema for openrift-data) reuses these.
 *
 * Lives in `@openrift/shared` so both `apps/api` and `apps/web` can import.
 * Set / errata rules stay in `apps/api/src/db/schemas.ts` since only the API
 * touches those tables.
 */
import { z } from "zod";

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
  superTypes: z.array(z.string().min(1)),
  domains: z.array(z.string().min(1)).min(1),
  might: z.number().int().min(0).nullable(),
  energy: z.number().int().min(0).nullable(),
  power: z.number().int().min(0).nullable(),
  mightBonus: z.number().int().min(0).nullable(),
  tags: z.array(z.string().min(1)),
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
  artist: z.string().min(1),
  publicCode: z.string().min(1),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  comment: z.string().min(1).nullable(),
  printedYear: z.number().int().min(1900).max(2999).nullable(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `candidate_cards` table. */
export const candidateCardFieldRules = {
  provider: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1).nullable(),
  might: z.number().int().min(0).nullable(),
  energy: z.number().int().min(0).nullable(),
  power: z.number().int().min(0).nullable(),
  mightBonus: z.number().int().min(0).nullable(),
  rulesText: z.string().min(1).nullable(),
  effectText: z.string().min(1).nullable(),
  shortCode: z.string().min(1).nullable(),
  externalId: z.string().min(1),
  extraData: noEmptyJsonb,
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `candidate_printings` table. */
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
