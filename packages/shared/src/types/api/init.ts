import type { KeywordEntry } from "./keyword.js";

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
  keywords: Record<string, KeywordEntry>;
}
