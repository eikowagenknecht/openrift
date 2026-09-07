import type { MetaSubmissionResolution } from "@openrift/shared/contracts/admin/meta-submissions";
import { META_SUBMISSION_REASONS } from "@openrift/shared/types/enums";
import type {
  MetaCreditVisibility,
  MetaListStatus,
  MetaSubmissionKind,
  MetaSubmissionReason,
  MetaSubmissionStatus,
} from "@openrift/shared/types/enums";

export const metaSubmissionKindLabels: Record<MetaSubmissionKind, string> = {
  new_list: "New list",
  completion: "Completion",
  correction: "Correction",
  event_correction: "Event correction",
};

/** The three the decklist form covers; an event correction has its own dialog. */
export type MetaDeckSubmissionKind = Exclude<MetaSubmissionKind, "event_correction">;

export const metaSubmissionFormTitles: Record<MetaDeckSubmissionKind, string> = {
  new_list: "Add decklist",
  completion: "Complete decklist",
  correction: "Suggest a correction",
};

export const metaSubmissionStatusLabels: Record<MetaSubmissionStatus, string> = {
  pending: "Waiting for review",
  accepted: "Added to the archive",
  already_correct: "Already there",
  not_applied: "Not used",
  rejected: "Not used",
};

/** `not_applied` and `rejected` share a variant: the split is an internal signal, not something to show a submitter. */
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

export const metaSubmissionStatusHints: Record<MetaSubmissionStatus, string | null> = {
  pending: "Someone reads everything sent in by hand, so this can take a while.",
  accepted: "The list is on the archive now. Thank you.",
  already_correct: "The archive already had this.",
  not_applied: null,
  rejected: null,
};

/** An event correction carries no decklist, so it drops the two list-related reasons. */
export function metaSubmissionReasonsFor(
  kind: MetaSubmissionKind,
): readonly MetaSubmissionReason[] {
  if (kind !== "event_correction") {
    return META_SUBMISSION_REASONS;
  }
  return ["already_correct", "unverified", "not_an_event"];
}

/** Worded to cover every kind: a wrong-date submitter must not read that the archive already had their list. */
export const metaSubmissionReasonSentences: Record<MetaSubmissionReason, string> = {
  duplicate: "Someone had already sent this in.",
  already_correct: "The archive already had this.",
  unverified:
    "We could not confirm this against a published result, so we left the event as it is.",
  incomplete_list: "Too much of the deck was missing to archive it.",
  not_an_event: "We could not find a tournament behind this.",
};

export const metaSubmissionReasonLabels: Record<MetaSubmissionReason, string> = {
  duplicate: "Already submitted",
  already_correct: "Already in the archive",
  unverified: "Could not verify",
  incomplete_list: "Too little of the list",
  not_an_event: "No tournament behind it",
};

/** Distinct from {@link metaSubmissionStatusLabels}, which prints the same words for both outcomes so a submitter isn't pointed at. */
export const metaSubmissionResolutionLabels: Record<MetaSubmissionResolution, string> = {
  already_correct: "Already in the archive",
  not_applied: "Reviewed, nothing taken",
  rejected: "Reject",
};

export const metaSubmissionResolutionHints: Record<MetaSubmissionResolution, string> = {
  already_correct: "The archive already had this. The usual outcome for a second sender.",
  not_applied: "Read it, took nothing from it, and it is nobody's fault.",
  rejected: "Turned down. Records a signal about the submission, so keep it for real problems.",
};

export function metaSubmissionExplanation(
  reason: MetaSubmissionReason | null,
  note: string | null,
): string | null {
  if (note) {
    return note;
  }
  return reason ? metaSubmissionReasonSentences[reason] : null;
}

/** `none` is not among them: a submission is a decklist, a standings-only entry never comes from a person. */
export type MetaSubmissionCompleteness = Exclude<MetaListStatus, "none">;

export const metaSubmissionCompletenessLabels: Record<MetaSubmissionCompleteness, string> = {
  full: "Whole deck",
  partial: "Main deck only",
};

export const metaCreditVisibilityLabels: Record<MetaCreditVisibility, string> = {
  hidden: "Don't credit me",
  name: "Credit my display name",
  riot_id: "Credit my Riot ID",
};

export const metaCreditVisibilityHints: Record<MetaCreditVisibility, string> = {
  hidden: "Your decks still count towards the archive, but nothing names you.",
  name: "Your account name appears on events you contributed to.",
  riot_id: "Your Riot ID appears instead. Without one, your display name is used.",
};

/** Must mirror the server's own two fallbacks or it promises a line the event page won't produce. */
export interface MetaCreditPreview {
  creditedAs: string | null;
  usesDisplayNameFallback: boolean;
}

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
