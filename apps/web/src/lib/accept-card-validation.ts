import { cardFieldsSchema } from "@openrift/shared/contracts/admin/card-mutations";
import type { AcceptNewCardBody } from "@openrift/shared/contracts/admin/card-mutations";
import type { z } from "zod";

/** Human labels for the card fields the accept-new-card schema validates, so a
 * failed check names the field the admin sees in the spreadsheet rather than the
 * raw schema key. */
const FIELD_LABELS: Record<string, string> = {
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

/** The Active-column fields that must be selected before a candidate can be
 * accepted as a new card. Keys match the spreadsheet field keys — note `types`
 * is plural, matching `buildCandidateCardFields`. */
const REQUIRED_ACTIVE_FIELDS = ["name", "types", "domains"] as const;

/** Whether the Active column has the minimum fields picked to enable the
 * "Accept as new card" button: name, types, and domains, each truthy. Deeper
 * validity (empty arrays, numeric fields) is checked at click time by
 * `describeAcceptCardFieldIssues`.
 * @returns True when every required field is present and truthy. */
export function hasRequiredActiveFields(activeCard: Record<string, unknown>): boolean {
  return REQUIRED_ACTIVE_FIELDS.every((key) => Boolean(activeCard[key]));
}

/** Turn one Zod issue into a short, jargon-free reason. Falls back to Zod's own
 * message for anything the common cases don't cover.
 * @returns The reason text (without the field label). */
function reasonFor(issue: z.core.$ZodIssue): string {
  if (issue.code === "invalid_type") {
    // A numeric field committed as a string (the classic accept failure) reports
    // `expected: "number"`; a missing required string/array field reports its own
    // expected type with `received undefined`.
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

/** Validate card fields against the same schema the accept-new-card endpoint
 * uses, returning one friendly line per invalid field. Empty array means valid.
 * Runs client-side so the admin sees exactly which field is wrong instead of the
 * server's generic "Input validation failed".
 * @returns Deduplicated `Field: reason` lines, or `[]` when the fields are valid. */
export function describeAcceptCardFieldIssues(
  cardFields: AcceptNewCardBody["cardFields"],
): string[] {
  const result = cardFieldsSchema.safeParse(cardFields);
  if (result.success) {
    return [];
  }
  const lines = result.error.issues.map((issue) => {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
    const label = key ? (FIELD_LABELS[key] ?? key) : "Card";
    return `${label}: ${reasonFor(issue)}`;
  });
  return [...new Set(lines)];
}
