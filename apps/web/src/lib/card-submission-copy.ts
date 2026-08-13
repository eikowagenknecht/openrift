import type {
  CardSubmissionKind,
  CardSubmissionReason,
  CardSubmissionStatus,
} from "@openrift/shared/contracts/card-submissions";

/**
 * The words a contributor sees for their own submissions, and the same words
 * the admin picks from when replying. Kept in one module so the reason an admin
 * chooses and the sentence the contributor reads can never drift apart.
 */

/** Badge label per status. */
export const submissionStatusLabels: Record<CardSubmissionStatus, string> = {
  pending: "Waiting for review",
  accepted: "Applied",
  already_correct: "Already correct",
  not_applied: "Not used",
  rejected: "Not used",
};

/**
 * Badge variant per status. `not_applied` and `rejected` deliberately look the
 * same: the split between them is an internal signal about abuse, not something
 * to point at a contributor who simply could not be verified.
 */
export const submissionStatusBadgeVariant: Record<
  CardSubmissionStatus,
  "secondary" | "success" | "outline"
> = {
  pending: "secondary",
  accepted: "success",
  already_correct: "outline",
  not_applied: "outline",
  rejected: "outline",
};

/** One line of explanation under the badge, when the status alone is thin. */
export const submissionStatusHints: Record<CardSubmissionStatus, string | null> = {
  pending: "Someone will look at this by hand. That can take a while.",
  accepted: "Your details are in the catalogue. Thank you.",
  already_correct: "The catalogue already matched everything you sent.",
  not_applied: null,
  rejected: null,
};

/** What the contributor sent. */
export const submissionKindLabels: Record<CardSubmissionKind, string> = {
  new_card: "New card",
  correction: "Correction",
  image: "Image",
};

/** The canned sentence behind each admin reason. */
export const submissionReasonSentences: Record<CardSubmissionReason, string> = {
  duplicate: "Someone had already sent this one in.",
  already_correct: "The catalogue already had these details.",
  unverified: "We could not confirm this against a source, so we left the card as it was.",
  not_a_card: "This did not look like a real Riftbound card.",
  bad_image: "The image was not usable, usually because of its size, angle, or quality.",
};

/** Short labels for the admin's reason picker. */
export const submissionReasonLabels: Record<CardSubmissionReason, string> = {
  duplicate: "Already submitted",
  already_correct: "Already correct",
  unverified: "Could not verify",
  not_a_card: "Not a real card",
  bad_image: "Unusable image",
};

/**
 * The full explanation to show for a resolved submission: the admin's own words
 * when they wrote any, otherwise the canned sentence for the reason they picked.
 * @param reason The canned reason, if one was chosen.
 * @param note The admin's free text, if any.
 * @returns The sentence to render, or null when there is nothing to say.
 */
export function submissionExplanation(
  reason: CardSubmissionReason | null,
  note: string | null,
): string | null {
  if (note) {
    return note;
  }
  return reason ? submissionReasonSentences[reason] : null;
}
