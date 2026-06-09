import type { RuleKind } from "@openrift/shared";

/** Rule kinds that map to a real rules page. */
export const VALID_RULE_KINDS: ReadonlySet<RuleKind> = new Set(["core", "tournament"]);

/**
 * Human-friendly title for a rule kind.
 * @returns "Tournament Rules" for the tournament kind, "Core Rules" otherwise.
 */
export function ruleKindTitle(kind: RuleKind): string {
  return kind === "tournament" ? "Tournament Rules" : "Core Rules";
}
