import type { CustomTag, DistributionChannel } from "../catalog.js";
import type { KeywordEntry } from "./keyword.js";

interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
}

interface ColoredEnumRow extends EnumRow {
  color: string | null;
}

interface DescribedEnumRow extends EnumRow {
  description: string | null;
}

export interface InitResponse {
  enums: {
    cardTypes: EnumRow[];
    rarities: ColoredEnumRow[];
    domains: ColoredEnumRow[];
    superTypes: EnumRow[];
    finishes: EnumRow[];
    artVariants: EnumRow[];
    cardSizes: EnumRow[];
    deckFormats: EnumRow[];
    deckZones: EnumRow[];
    languages: EnumRow[];
    markers: DescribedEnumRow[];
  };
  keywords: Record<string, KeywordEntry>;
  /**
   * Full distribution-channel registry, including parents that no printing
   * links to directly. Lives on /init so the filter UI on /cards (and any
   * non-/promos consumer) can render breadcrumb labels without bundling the
   * registry onto the much larger catalog payload.
   */
  distributionChannels: DistributionChannel[];
  /**
   * Admin-curated supplemental tag vocabulary. Used by custom deck-builder
   * formats (first: region-locked freeform). Lives on /init so the freeform
   * filter UI can render labels without depending on the catalog payload.
   */
  customTags: CustomTag[];
  /**
   * Catalogue-derived list of tag names that identify a Champion (the
   * distinct `tags` values across all Legend cards — each Legend has
   * exactly one tag, the champion name). Used by Custom-Region deck
   * validation to discriminate champion-identifier tags from region/
   * utility tags when checking that a Signature's matching champion is
   * actually in the deck.
   */
  championIdentifierTags: string[];
}
