export interface KeywordEntry {
  color: string;
  darkText: boolean;
  /** Language code → translated label (e.g. { ZH: "护盾" }). EN is omitted since the key is already English. */
  translations?: Record<string, string>;
}

export interface KeywordsResponse {
  items: Record<string, KeywordEntry>;
}
