import { LOW_RARITIES, WellKnown } from "@openrift/shared/well-known";
import { sql } from "kysely";

export interface ScopeFilter {
  sets?: string[];
  languages?: string[];
  domains?: string[];
  types?: string[];
  rarities?: string[];
  finishes?: string[];
  artVariants?: string[];
  setsExclude?: string[];
  languagesExclude?: string[];
  domainsExclude?: string[];
  typesExclude?: string[];
  raritiesExclude?: string[];
  finishesExclude?: string[];
  artVariantsExclude?: string[];
  keywords?: string[];
  tags?: string[];
  customTags?: string[];
  cardSizes?: string[];
  keywordsExclude?: string[];
  tagsExclude?: string[];
  customTagsExclude?: string[];
  keywordsPresence?: "any" | "none";
  tagsPresence?: "any" | "none";
  customTagsPresence?: "any" | "none";
  promos?: "only" | "exclude";
  signed?: boolean;
  banned?: boolean;
  errata?: boolean;
  standard?: boolean;
}

export function customTagExists(slugs: string[]) {
  const vals = sql.join(slugs.map((slug) => sql`${slug}`));
  return sql`EXISTS (
    SELECT 1 FROM card_custom_tags cct
    JOIN custom_tags ct ON ct.id = cct.custom_tag_id
    WHERE cct.card_id = c.id AND ct.slug IN (${vals})
  )`;
}

// The "standard printing" rule as SQL. Restates `isStandardPrinting` from
// @openrift/shared — the two must be changed together.
const STANDARD_LOW_RARITIES = sql.join([...LOW_RARITIES].map((rarity) => sql`${rarity}`));

export const STANDARD = sql`(
  COALESCE(NULLIF(p.art_variant, ''), ${WellKnown.artVariant.NORMAL}) = ${WellKnown.artVariant.NORMAL}
  AND p.is_overnumbered = false
  AND p.is_signed = false
  AND cardinality(p.marker_slugs) = 0
  AND p.rarity <> ${WellKnown.rarity.SHOWCASE}
  AND p.size = ${WellKnown.cardSize.STANDARD}
  AND CASE
    WHEN p.rarity IN (${STANDARD_LOW_RARITIES}) THEN p.finish = ${WellKnown.finish.NORMAL}
    WHEN p.finish = ${WellKnown.finish.FOIL} THEN true
    ELSE p.finish = ${WellKnown.finish.NORMAL}
      AND NOT EXISTS (SELECT 1 FROM mv_printing_foil_twins t WHERE t.printing_id = p.id)
  END
)`;
