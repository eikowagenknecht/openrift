import type { RuleKind } from "@openrift/shared/types/api/rules";

export const VALID_RULE_KINDS: ReadonlySet<RuleKind> = new Set(["core", "tournament"]);

export function ruleKindTitle(kind: RuleKind): string {
  return kind === "tournament" ? "Tournament Rules" : "Core Rules";
}
