import { cardFieldsSchema } from "@openrift/shared/contracts/admin/card-mutations";
import type { AcceptNewCardBody } from "@openrift/shared/contracts/admin/card-mutations";
import type { z } from "zod";

/** Keyed exhaustively off the schema, so a new field there is a compile error here. */
const FIELD_LABELS: Record<keyof AcceptNewCardBody["cardFields"], string> = {
  id: "Card ID",
  name: "Name",
  types: "Types",
  superTypes: "Supertypes",
  domains: "Domains",
  might: "Might",
  energy: "Energy",
  power: "Power",
  mightBonus: "Might Bonus",
  tags: "Tags",
};

/** Keys match the spreadsheet field keys — `types` is plural, matching `buildCandidateCardFields`. */
const REQUIRED_ACTIVE_FIELDS = ["name", "types", "domains"] as const;

/** Deeper validity (empty arrays, numeric fields) is checked at click time by `describeAcceptCardFieldIssues`. */
export function hasRequiredActiveFields(activeCard: Record<string, unknown>): boolean {
  return REQUIRED_ACTIVE_FIELDS.every((key) => Boolean(activeCard[key]));
}

/** Falls back to Zod's own message for anything the common cases don't cover. */
function reasonFor(issue: z.core.$ZodIssue): string {
  if (issue.code === "invalid_type") {
    return issue.expected === "number" ? "must be a whole number" : "is required";
  }
  if (issue.code === "too_small") {
    if (issue.origin === "array") {
      return "needs at least one entry";
    }
    if (issue.origin === "string") {
      return "is required";
    }
    if (issue.origin === "number") {
      return "must be 0 or higher";
    }
  }
  return issue.message;
}

/** Validates against the same schema the accept-new-card endpoint uses. */
export function describeAcceptCardFieldIssues(
  cardFields: AcceptNewCardBody["cardFields"],
): string[] {
  const result = cardFieldsSchema.safeParse(cardFields);
  if (result.success) {
    return [];
  }
  const lines = result.error.issues.map((issue) => {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
    const label = key ? (FIELD_LABELS[key as keyof typeof FIELD_LABELS] ?? key) : "Card";
    return `${label}: ${reasonFor(issue)}`;
  });
  return [...new Set(lines)];
}
