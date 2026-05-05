/**
 * Zod schema for a single `data/cards/*.json` contribution file in the
 * openrift-data repo. Snake-case keys mirror the JSON written to disk; the
 * shape matches `openrift-data/schemas/card.schema.json` byte-for-byte.
 *
 * Used by:
 *   - the web app's contribute form for client-side validation before
 *     opening the prefilled GitHub URL,
 *   - a dev script that runs `zod-to-json-schema` against this schema and
 *     emits `card.schema.json`, which is then copied into openrift-data.
 *
 * Keep the openrift-data JSON Schema and this module in lockstep — anything
 * declared as required here MUST be required there, and vice versa.
 */
import { z } from "zod";

import { cardFieldRules, printingFieldRules } from "./db-field-rules.js";

/** Pattern for `external_id` on community contributions. */
export const COMMUNITY_ID_PATTERN = /^community:[A-Za-z0-9][A-Za-z0-9:_-]*$/;
/** Pattern for printing `image_url` (allow https only). */
export const HTTPS_URL_PATTERN = /^https:\/\//;
/** Pattern for printing `language` codes (ISO 2-letter uppercase). */
export const LANGUAGE_CODE_PATTERN = /^[A-Z]{2}$/;

const communityId = z.string().regex(COMMUNITY_ID_PATTERN, {
  message: "Must start with 'community:' to namespace from official providers.",
});

const imageUrl = z
  .string()
  .regex(HTTPS_URL_PATTERN, { message: "Image URL must start with https://." })
  .nullable();

const languageCode = z
  .string()
  .max(2)
  .regex(LANGUAGE_CODE_PATTERN, {
    message: "Language must be a 2-letter uppercase code (e.g. EN, ZH).",
  })
  .nullable();

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export const contributionCardSchema = z
  .object({
    name: cardFieldRules.name,
    external_id: communityId,
    type: cardFieldRules.type.nullable().optional(),
    super_types: cardFieldRules.superTypes.optional(),
    // Looser than DB: openrift-data accepts an empty domains array (the
    // maintainer fills in the right ones if the contributor isn't sure).
    domains: z.array(z.string().min(1)).optional(),
    might: cardFieldRules.might.optional(),
    energy: cardFieldRules.energy.optional(),
    power: cardFieldRules.power.optional(),
    might_bonus: cardFieldRules.mightBonus.optional(),
    tags: cardFieldRules.tags.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

export const contributionPrintingSchema = z
  .object({
    public_code: printingFieldRules.publicCode,
    external_id: communityId,
    set_id: z.string().min(1).nullable().optional(),
    set_name: z.string().min(1).nullable().optional(),
    rarity: printingFieldRules.rarity.nullable().optional(),
    art_variant: printingFieldRules.artVariant.nullable().optional(),
    is_signed: z.boolean().optional(),
    marker_slugs: z.array(z.string().min(1)).optional(),
    distribution_channel_slugs: z.array(z.string().min(1)).optional(),
    finish: printingFieldRules.finish.nullable().optional(),
    artist: printingFieldRules.artist.nullable().optional(),
    printed_rules_text: printingFieldRules.printedRulesText.optional(),
    printed_effect_text: printingFieldRules.printedEffectText.optional(),
    image_url: imageUrl.optional(),
    flavor_text: printingFieldRules.flavorText.optional(),
    language: languageCode.optional(),
    printed_name: z.string().min(1).nullable().optional(),
    printed_year: printingFieldRules.printedYear.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

export const contributionFileSchema = z
  .object({
    $schema: z.string().optional(),
    card: contributionCardSchema,
    printings: z.array(contributionPrintingSchema).min(1),
  })
  .strict();

export type ContributionFile = z.infer<typeof contributionFileSchema>;
export type ContributionFileCard = z.infer<typeof contributionCardSchema>;
export type ContributionFilePrinting = z.infer<typeof contributionPrintingSchema>;
