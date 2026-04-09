import type { KeywordStyleEntry } from "./keyword-style.js";

interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
}

interface DomainEnumRow extends EnumRow {
  color: string | null;
}

export interface InitResponse {
  enums: {
    cardTypes: EnumRow[];
    rarities: EnumRow[];
    domains: DomainEnumRow[];
    superTypes: EnumRow[];
    finishes: EnumRow[];
    artVariants: EnumRow[];
    deckFormats: EnumRow[];
    deckZones: EnumRow[];
  };
  keywordStyles: Record<string, KeywordStyleEntry>;
}
