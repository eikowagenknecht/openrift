import type {
  MetaCreditVisibility,
  MetaListStatus,
  MetaSubmissionReason,
  MetaSubmissionStatus,
} from "@openrift/shared";
import type { MetaSubmissionResolution } from "@openrift/shared/contracts/admin/meta-submissions";

/**
 * The words a contributor sees for a decklist they sent to the meta archive
 * (ADR-014's User submissions), and for the credit setting that decides whether
 * their name appears on the pages they contributed to.
 *
 * Kept in one module for the same reason `card-submission-copy.ts` is: the
 * sentence a contributor reads and the reason an admin picks must not drift
 * apart. Nothing here uses the schema's own vocabulary — a submitter never sees
 * "candidate", "provider", or "list status".
 */

/** Badge label per outcome. */
export const metaSubmissionStatusLabels: Record<MetaSubmissionStatus, string> = {
  pending: "Waiting for review",
  accepted: "Added to the archive",
  already_correct: "Already there",
  not_applied: "Not used",
  rejected: "Not used",
};

/**
 * Badge variant per outcome. `not_applied` and `rejected` look the same on
 * purpose: the split between them is an internal signal about abuse, not
 * something to point at someone who simply could not be verified.
 */
export const metaSubmissionStatusBadgeVariant: Record<
  MetaSubmissionStatus,
  "secondary" | "success" | "outline"
> = {
  pending: "secondary",
  accepted: "success",
  already_correct: "outline",
  not_applied: "outline",
  rejected: "outline",
};

/** One line under the badge, for the outcomes the label alone leaves thin. */
export const metaSubmissionStatusHints: Record<MetaSubmissionStatus, string | null> = {
  pending: "Someone reads every list by hand, so this can take a while.",
  accepted: "The list is on the archive now. Thank you.",
  already_correct: "The archive already had this list.",
  not_applied: null,
  rejected: null,
};

/** The canned sentence behind each reason an admin can pick. */
export const metaSubmissionReasonSentences: Record<MetaSubmissionReason, string> = {
  duplicate: "Someone had already sent this list in.",
  already_correct: "The archive already had this list.",
  unverified:
    "We could not confirm this against a published result, so we left the event as it is.",
  incomplete_list: "Too much of the deck was missing to archive it.",
  not_an_event: "We could not find a tournament behind this.",
};

/** Short labels for the admin's reason picker. */
export const metaSubmissionReasonLabels: Record<MetaSubmissionReason, string> = {
  duplicate: "Already submitted",
  already_correct: "Already in the archive",
  unverified: "Could not verify",
  incomplete_list: "Too little of the list",
  not_an_event: "No tournament behind it",
};

/**
 * Short labels for the admin's outcome picker.
 *
 * These are not {@link metaSubmissionStatusLabels}: that map is what the
 * contributor reads, and it deliberately prints the same words for
 * `not_applied` and `rejected` so a turned-down submission is not pointed at.
 * The admin picking between them needs them told apart.
 */
export const metaSubmissionResolutionLabels: Record<MetaSubmissionResolution, string> = {
  already_correct: "Already in the archive",
  not_applied: "Reviewed, nothing taken",
  rejected: "Reject",
};

/** One line under each outcome, so the choice between the three is obvious. */
export const metaSubmissionResolutionHints: Record<MetaSubmissionResolution, string> = {
  already_correct: "The archive already had this list. The usual outcome for a second sender.",
  not_applied: "Read it, took nothing from it, and it is nobody's fault.",
  rejected: "Turned down. Records a signal about the submission, so keep it for real problems.",
};

/**
 * The full explanation for a resolved submission: the reviewer's own words when
 * they wrote any, otherwise the canned sentence for the reason they picked.
 * @param reason The canned reason, if one was chosen.
 * @param note The reviewer's free text, if any.
 * @returns The sentence to render, or null when there is nothing to say.
 */
export function metaSubmissionExplanation(
  reason: MetaSubmissionReason | null,
  note: string | null,
): string | null {
  if (note) {
    return note;
  }
  return reason ? metaSubmissionReasonSentences[reason] : null;
}

/**
 * How much of a deck the submitter is sending, in a player's words. The stored
 * vocabulary is `full` / `partial` / `archetype`; none of those three words
 * belongs in front of someone typing in a decklist.
 */
export const metaSubmissionCompletenessLabels: Record<MetaListStatus, string> = {
  full: "The whole deck",
  partial: "Main deck only",
  archetype: "Just the legend",
};

/** One line under each completeness option, so the choice is obvious. */
export const metaSubmissionCompletenessHints: Record<MetaListStatus, string> = {
  full: "Every card the pilot played, side zones included.",
  partial: "Every main-deck card, but the battlefields, runes, or sideboard are missing.",
  archetype: "You know which legend they played, but not what was in the deck.",
};

/** Label for the credit setting's three states. */
export const metaCreditVisibilityLabels: Record<MetaCreditVisibility, string> = {
  hidden: "Don't credit me",
  name: "Credit my display name",
  riot_id: "Credit my Riot ID",
};

/** One line under each credit option. */
export const metaCreditVisibilityHints: Record<MetaCreditVisibility, string> = {
  hidden: "Your decks still count towards the archive, but nothing names you.",
  name: "The name on your account appears on every event you have contributed to.",
  riot_id: "Your Riot ID appears instead. Without one, your display name is used.",
};

/**
 * What the archive would print for this person right now, and whether it had to
 * fall back to something other than what they picked.
 *
 * The server resolves the name at render time (ADR-014: a credit points at a
 * person, so it follows their rename), which means the preview has to run the
 * same two fallbacks or it promises a line the event page will not produce:
 * `riot_id` with no Riot ID set drops to the display name, and an empty chosen
 * field drops the contributor from the list entirely.
 */
export interface MetaCreditPreview {
  /** The name an event page would print, or null when nothing would be printed. */
  creditedAs: string | null;
  /** True when a Riot ID was asked for but the display name is what will show. */
  usesDisplayNameFallback: boolean;
}

/**
 * Resolves the credit line for the signed-in user's current profile fields.
 *
 * @param visibility The credit setting as it currently stands.
 * @param profile The viewer's display name and Riot ID, either of which may be blank.
 * @returns What the archive would print, and whether a fallback was used.
 */
export function metaCreditPreview(
  visibility: MetaCreditVisibility,
  profile: { name?: string | null; riotId?: string | null },
): MetaCreditPreview {
  const name = profile.name?.trim() ?? "";
  const riotId = profile.riotId?.trim() ?? "";

  if (visibility === "hidden") {
    return { creditedAs: null, usesDisplayNameFallback: false };
  }
  if (visibility === "riot_id") {
    if (riotId.length > 0) {
      return { creditedAs: riotId, usesDisplayNameFallback: false };
    }
    return { creditedAs: name.length > 0 ? name : null, usesDisplayNameFallback: true };
  }
  return { creditedAs: name.length > 0 ? name : null, usesDisplayNameFallback: false };
}
