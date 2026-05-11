import type { DistributionChannel } from "../catalog.js";
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
}
