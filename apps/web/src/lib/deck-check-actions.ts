import type {
  DeckCheckEntryDetailResponse,
  DeckCheckEntryState,
  DeckCheckReviewOutcome,
} from "@openrift/shared";
import { CheckIcon, RotateCcwIcon, ThumbsUpIcon } from "lucide-react";

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

/**
 * The single contextual primary action for a state.
 * @returns The action descriptor, or null when the state has no primary action.
 */
export function primaryActionFor(state: DeckCheckEntryDetailResponse["entry"]["state"]): {
  label: string;
  icon: typeof CheckIcon;
  state: "editable" | "submitted" | "approved" | "checked" | "withdrawn";
  reviewOutcome?: "ok" | "issue";
} | null {
  switch (state) {
    case "editable": {
      return { label: "Lock as submitted", icon: CheckIcon, state: "submitted" };
    }
    case "submitted": {
      return { label: "Approve list", icon: ThumbsUpIcon, state: "approved" };
    }
    case "approved": {
      return { label: "Mark checked", icon: CheckIcon, state: "checked", reviewOutcome: "ok" };
    }
    case "checked": {
      return { label: "Re-open", icon: RotateCcwIcon, state: "submitted" };
    }
    case "withdrawn": {
      return { label: "Restore entry", icon: RotateCcwIcon, state: "submitted" };
    }
    default: {
      return null;
    }
  }
}

/**
 * Whether a judge may still correct a card's zone in this entry state. Adding,
 * removing, and re-identifying cards stay locked to the submitted state
 * (ADR-027), but a mis-zoned import is a filing error rather than a change to
 * the deck's contents, so zone corrections remain allowed once the list is
 * approved or checked.
 * @returns True for submitted, approved, and checked.
 */
export function zoneFixAllowed(state: DeckCheckEntryDetailResponse["entry"]["state"]): boolean {
  return state === "submitted" || state === "approved" || state === "checked";
}
