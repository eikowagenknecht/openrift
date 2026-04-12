import type { KeywordStyleEntry } from "./keyword-style.js";

interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
}

interface ColoredEnumRow extends EnumRow {
  color: string | null;
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
  };
  keywordStyles: Record<string, KeywordStyleEntry>;
}
