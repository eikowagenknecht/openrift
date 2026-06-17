import type { DeckCheckEntryState, DeckCheckReviewOutcome } from "@openrift/shared";

/** The entry fields the judge action predicates depend on. */
interface JudgeActionEntry {
  state: DeckCheckEntryState;
  reviewOutcome: DeckCheckReviewOutcome | null;
  claimedUserId: string | null;
}

/**
 * Whether the "Request changes" action should be offered to a judge.
 *
 * Requesting changes flips a submitted entry back to `editable` and flags it as
 * an issue, so it only makes sense for a claimed submission that is not already
 * flagged with an issue — re-flagging an existing "Submitted · issue" entry is a
 * no-op, so the button is hidden there.
 *
 * @returns true when the judge can request changes for this entry.
 */
export function canRequestChanges(entry: JudgeActionEntry): boolean {
  return (
    entry.state === "submitted" && entry.claimedUserId !== null && entry.reviewOutcome !== "issue"
  );
}
