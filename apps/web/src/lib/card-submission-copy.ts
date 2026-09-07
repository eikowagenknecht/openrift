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

export const submissionStatusLabels: Record<CardSubmissionStatus, string> = {
  pending: "Waiting for review",
  accepted: "Applied",
  already_correct: "Already correct",
  not_applied: "Not used",
  rejected: "Not used",
};

/**
 * `not_applied` and `rejected` deliberately look the same: the split is an
 * internal abuse signal, not something to show a good-faith contributor.
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

export const submissionStatusHints: Record<CardSubmissionStatus, string | null> = {
  pending: "Someone will look at this by hand. That can take a while.",
  accepted: "Your details are in the catalogue. Thank you.",
  already_correct: "The catalogue already matched everything you sent.",
  not_applied: null,
  rejected: null,
};

export const submissionKindLabels: Record<CardSubmissionKind, string> = {
  new_card: "New card",
  correction: "Correction",
  image: "Image",
};

export const submissionReasonSentences: Record<CardSubmissionReason, string> = {
  duplicate: "Someone had already sent this one in.",
  already_correct: "The catalogue already had these details.",
  unverified: "We could not confirm this against a source, so we left the card as it was.",
  not_a_card: "This did not look like a real Riftbound card.",
  bad_image: "The image was not usable, usually because of its size, angle, or quality.",
};

export const submissionReasonLabels: Record<CardSubmissionReason, string> = {
  duplicate: "Already submitted",
  already_correct: "Already correct",
  unverified: "Could not verify",
  not_a_card: "Not a real card",
  bad_image: "Unusable image",
};

export function submissionExplanation(
  reason: CardSubmissionReason | null,
  note: string | null,
): string | null {
  if (note) {
    return note;
  }
  return reason ? submissionReasonSentences[reason] : null;
}
