export interface KeywordStyleEntry {
  color: string;
  darkText: boolean;
}

export interface KeywordStylesResponse {
  items: Record<string, KeywordStyleEntry>;
}
