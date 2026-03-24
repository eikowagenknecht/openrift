export interface KeywordStyleEntry {
  color: string;
  darkText: boolean;
}

export type KeywordStylesResponse = Record<string, KeywordStyleEntry>;
