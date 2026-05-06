export type RuleKind = "core" | "tournament";

export interface RuleResponse {
  id: string;
  kind: RuleKind;
  version: string;
  ruleNumber: string;
  sortOrder: number;
  depth: number;
  ruleType: "title" | "subtitle" | "text";
  content: string;
  changeType: "added" | "modified" | "removed";
}

export interface RuleVersionResponse {
  kind: RuleKind;
  version: string;
  comments: string | null;
  importedAt: string;
}

export interface RuleChangesResponse {
  /** Rule numbers added in this version. */
  added: string[];
  /** rule_number -> the rule's content as of the previous version. */
  modifiedPrev: Record<string, string>;
  /**
   * Tombstones for rules removed in this version. `content` is backfilled
   * from the previous version so the row can be rendered in place.
   */
  removed: RuleResponse[];
}

export interface RulesListResponse {
  kind: RuleKind;
  rules: RuleResponse[];
  version: string;
  /** Per-version diff metadata. Only present when a specific version was requested. */
  changes?: RuleChangesResponse;
}

export interface RuleVersionsListResponse {
  versions: RuleVersionResponse[];
}
