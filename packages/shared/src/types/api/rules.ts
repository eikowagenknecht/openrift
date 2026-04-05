export interface RuleResponse {
  id: string;
  version: string;
  ruleNumber: string;
  sortOrder: number;
  depth: number;
  ruleType: "title" | "subtitle" | "text";
  content: string;
  changeType: "added" | "modified" | "removed";
}

export interface RuleVersionResponse {
  version: string;
  sourceType: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  importedAt: string;
}

export interface RulesListResponse {
  rules: RuleResponse[];
  version: string;
}

export interface RuleVersionsListResponse {
  versions: RuleVersionResponse[];
}
