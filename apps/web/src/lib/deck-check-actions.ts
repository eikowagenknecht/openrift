import type {
  DeckCheckEntryDetailResponse,
  DeckCheckEntryState,
  DeckCheckReviewOutcome,
} from "@openrift/shared";
import { CheckIcon, RotateCcwIcon, ThumbsUpIcon } from "lucide-react";

interface JudgeActionEntry {
  state: DeckCheckEntryState;
  reviewOutcome: DeckCheckReviewOutcome | null;
  claimedUserId: string | null;
}

/**
 * Requesting changes flips a submitted entry back to `editable` and flags an
 * issue; hidden when the entry is already flagged, since re-flagging is a no-op.
 */
export function canRequestChanges(entry: JudgeActionEntry): boolean {
  return (
    entry.state === "submitted" && entry.claimedUserId !== null && entry.reviewOutcome !== "issue"
  );
}

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
 * Adding, removing, and re-identifying cards stay locked to the submitted
 * state; a mis-zoned import is a filing error, so zone corrections stay
 * allowed once the list is approved or checked.
 */
export function zoneFixAllowed(state: DeckCheckEntryDetailResponse["entry"]["state"]): boolean {
  return state === "submitted" || state === "approved" || state === "checked";
}
