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

export interface RulesListResponse {
  kind: RuleKind;
  rules: RuleResponse[];
  version: string;
}

export interface RuleVersionsListResponse {
  versions: RuleVersionResponse[];
}
