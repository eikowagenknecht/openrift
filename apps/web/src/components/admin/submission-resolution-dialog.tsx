import type { CardSubmissionReason } from "@openrift/shared/contracts/card-submissions";
import { useState } from "react";

import { SubmissionMessageFields } from "@/components/admin/submission-message-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  useSetSubmissionResolution,
  useSubmissionForCandidate,
} from "@/hooks/use-admin-card-submissions";
import { submissionReasonLabels, submissionReasonSentences } from "@/lib/card-submission-copy";

/** Reason options, in the order an admin is most likely to want them. */
const REASON_ORDER: CardSubmissionReason[] = [
  "not_a_card",
  "duplicate",
  "already_correct",
  "unverified",
  "bad_image",
];

/**
 * Declared above the component on purpose: the React Compiler bails on a
 * function declared after the return, which would silently drop memoization for
 * the whole file.
 * @param mode Which flow opened the dialog.
 * @returns The reason to preselect: junk for a rejection, nothing for a reply.
 */
function defaultReason(mode: "reject" | "reply"): CardSubmissionReason | null {
  return mode === "reject" ? "not_a_card" : null;
}

interface SubmissionResolutionDialogProps {
  /** The user-submission column this is about; null closes the dialog. */
  candidateCardId: string | null;
  /**
   * `reject` also ignores the candidate on confirm and preselects a reason, so
   * clearing junk stays close to one click. `reply` only writes the message.
   */
  mode: "reject" | "reply";
  onOpenChange: (open: boolean) => void;
  /** Called after the message is saved, for the reject path to run the ignore. */
  onConfirmed?: () => void;
}

/**
 * Writes the message a contributor sees for their submission, and on the reject
 * path performs the rejection itself.
 *
 * The reason picker is required when rejecting: a rejection that shows the
 * contributor nothing but "not used" is the worst thing their page can display.
 * It defaults to the most common case so Enter still confirms in one keystroke.
 *
 * @param props Which candidate, which mode, and the close/confirm callbacks.
 * @returns The dialog element.
 */
export function SubmissionResolutionDialog({
  candidateCardId,
  mode,
  onOpenChange,
  onConfirmed,
}: SubmissionResolutionDialogProps) {
  const { data } = useSubmissionForCandidate(candidateCardId);
  const setResolution = useSetSubmissionResolution();
  const existing = data?.submission ?? null;

  const [reason, setReason] = useState<CardSubmissionReason | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  // Until the admin edits anything, mirror whatever is already stored (and for
  // a reject, fall back to the most common reason).
  const effectiveReason = touched ? reason : (existing?.reason ?? defaultReason(mode));
  const effectiveNote = touched ? note : (existing?.resolutionNote ?? "");

  // Resolved before the try: a ternary inside a try body makes the React
  // Compiler bail on the whole file.
  const trimmedNote = effectiveNote.trim();
  const notePayload = trimmedNote || null;

  async function handleSubmit() {
    if (candidateCardId === null) {
      return;
    }
    try {
      await setResolution.mutateAsync({
        candidateCardId,
        reason: effectiveReason,
        note: notePayload,
      });
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
      return;
    }
    setTouched(false);
    setNote("");
    onConfirmed?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={candidateCardId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => void handleSubmit()}>
          <DialogHeader>
            <DialogTitle>
              {mode === "reject" ? "Reject submission" : "Reply to contributor"}
            </DialogTitle>
            <DialogDescription>
              {mode === "reject"
                ? "This rejects the submission and tells the contributor why."
                : "The contributor sees this on their submissions page."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <SubmissionMessageFields
              idPrefix="submission"
              reasonOrder={REASON_ORDER}
              reasonLabels={submissionReasonLabels}
              reasonSentences={submissionReasonSentences}
              reason={effectiveReason}
              note={effectiveNote}
              onReasonChange={(next) => {
                setTouched(true);
                setReason(next);
              }}
              onNoteChange={(next) => {
                setTouched(true);
                setNote(next);
              }}
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              type="submit"
              variant={mode === "reject" ? "destructive" : "default"}
              disabled={setResolution.isPending || (mode === "reject" && !effectiveReason)}
            >
              {mode === "reject" ? "Reject" : "Save"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
