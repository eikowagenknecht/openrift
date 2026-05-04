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
}
