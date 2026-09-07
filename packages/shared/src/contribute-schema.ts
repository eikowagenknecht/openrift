// Snake-case keys mirror the shape the /contribute form builds. Card/printing
// rules are sourced from db-field-rules.js so the two can't drift.
import { z } from "zod";

import { cardFieldRules, printingFieldRules } from "./db-field-rules.js";

export const COMMUNITY_ID_PATTERN = /^community:[A-Za-z0-9][A-Za-z0-9:_-]*$/u;
export const HTTPS_URL_PATTERN = /^https:\/\//u;

const communityId = z.string().regex(COMMUNITY_ID_PATTERN, {
  message: "Must start with 'community:' to namespace from official providers.",
});

const imageUrl = z
  .string()
  .regex(HTTPS_URL_PATTERN, { message: "Image URL must start with https://." })
  .nullable();

const languageCode = printingFieldRules.language.nullable();

export const contributionCardSchema = z
  .object({
    name: cardFieldRules.name,
    external_id: communityId,
    // Legacy single-type field; kept so existing contribution files stay valid.
    type: cardFieldRules.type.nullable().optional(),
    // Ordered card types; wins over `type` when both are present.
    types: cardFieldRules.types.optional(),
    super_types: cardFieldRules.superTypes.optional(),
    // Looser than DB: an empty domains array is accepted (the maintainer
    // fills in the right ones if the contributor isn't sure).
    domains: z.array(z.string().min(1)).optional(),
    might: cardFieldRules.might.optional(),
    energy: cardFieldRules.energy.optional(),
    power: cardFieldRules.power.optional(),
    might_bonus: cardFieldRules.mightBonus.optional(),
    tags: cardFieldRules.tags.optional(),
  })
  .strict();

export const contributionPrintingSchema = z
  .object({
    public_code: printingFieldRules.publicCode,
    external_id: communityId,
    set_id: z.string().min(1).nullable().optional(),
    set_name: z.string().min(1).nullable().optional(),
    rarity: printingFieldRules.rarity.nullable().optional(),
    art_variant: printingFieldRules.artVariant.nullable().optional(),
    is_signed: z.boolean().optional(),
    is_overnumbered: z.boolean().optional(),
    marker_slugs: z.array(z.string().min(1)).optional(),
    distribution_channel_slugs: z.array(z.string().min(1)).optional(),
    finish: printingFieldRules.finish.nullable().optional(),
    size: printingFieldRules.size.nullable().optional(),
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

export const contributionFileSchema = z
  .object({
    card: contributionCardSchema,
    printings: z.array(contributionPrintingSchema).min(1),
  })
  .strict();

export type ContributionFile = z.infer<typeof contributionFileSchema>;
export type ContributionFileCard = z.infer<typeof contributionCardSchema>;
export type ContributionFilePrinting = z.infer<typeof contributionPrintingSchema>;
