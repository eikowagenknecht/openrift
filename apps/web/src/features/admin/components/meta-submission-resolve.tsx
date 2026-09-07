import type {
  AdminMetaSubmission,
  MetaSubmissionResolution,
} from "@openrift/shared/contracts/admin/meta-submissions";
import { formatDayTime } from "@openrift/shared/format-date";
import type { MetaSubmissionReason } from "@openrift/shared/types/enums";
import { UndoIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SubmissionMessageFields } from "@/features/admin/components/submission-message-fields";
import {
  useReopenMetaSubmission,
  useResolveMetaSubmission,
} from "@/features/admin/hooks/use-admin-meta-submissions";
import {
  metaSubmissionExplanation,
  metaSubmissionKindLabels,
  metaSubmissionReasonLabels,
  metaSubmissionReasonSentences,
  metaSubmissionReasonsFor,
  metaSubmissionResolutionHints,
  metaSubmissionResolutionLabels,
  metaSubmissionStatusBadgeVariant,
  metaSubmissionStatusLabels,
} from "@/features/meta/lib/meta-submission-copy";

const RESOLUTION_ORDER: MetaSubmissionResolution[] = ["already_correct", "not_applied", "rejected"];

const DEFAULT_REASON: Record<MetaSubmissionResolution, MetaSubmissionReason | null> = {
  already_correct: "already_correct",
  not_applied: null,
  rejected: "not_an_event",
};

// Declared above the component: the React Compiler bails on a function
// declared after the return, or one called before its declaration.
function blocksSubmit(
  status: MetaSubmissionResolution,
  note: string,
  reason: MetaSubmissionReason | null,
): boolean {
  return status === "rejected" && reason === null && note.length === 0;
}

function ResolvedSummary({
  submission,
  onReopen,
  reopening,
}: {
  submission: AdminMetaSubmission;
  onReopen: () => void;
  reopening: boolean;
}) {
  const explanation = metaSubmissionExplanation(submission.reason, submission.resolutionNote);
  const accepted = submission.status === "accepted";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={metaSubmissionStatusBadgeVariant[submission.status]}>
        {metaSubmissionStatusLabels[submission.status]}
      </Badge>
      <Badge variant="muted">{metaSubmissionKindLabels[submission.kind]}</Badge>
      {submission.resolvedAt !== null && (
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatDayTime(submission.resolvedAt)}
        </span>
      )}
      {explanation !== null && (
        <span className="text-muted-foreground min-w-0 text-sm">They read: {explanation}</span>
      )}
      {accepted ? (
        <span className="text-muted-foreground ml-auto text-sm">
          Settled by the accept, alongside the credit and the archived deck.
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={reopening}
          onClick={onReopen}
        >
          <UndoIcon />
          Reopen
        </Button>
      )}
    </div>
  );
}

interface MetaSubmissionResolveProps {
  submission: AdminMetaSubmission;
  playerOverlayId: string | null;
}

export function MetaSubmissionResolve({ submission, playerOverlayId }: MetaSubmissionResolveProps) {
  const resolve = useResolveMetaSubmission();
  const reopen = useReopenMetaSubmission();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MetaSubmissionResolution>("already_correct");
  const [reason, setReason] = useState<MetaSubmissionReason | null>("already_correct");
  const [note, setNote] = useState("");
  const [conflict, setConflict] = useState(false);

  function pickStatus(next: MetaSubmissionResolution) {
    setStatus(next);
    setReason(DEFAULT_REASON[next]);
  }

  async function handleReopen() {
    let result;
    try {
      result = await reopen.mutateAsync({ submissionId: submission.id, playerOverlayId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    setConflict(result.status === "alreadyAccepted");
  }

  const trimmedNote = note.trim();
  const notePayload = trimmedNote.length > 0 ? trimmedNote : null;

  async function handleSubmit() {
    let result;
    try {
      result = await resolve.mutateAsync({
        submissionId: submission.id,
        playerOverlayId,
        status,
        reason,
        note: notePayload,
      });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    if (result.status === "alreadyAccepted") {
      setConflict(true);
      return;
    }
    setConflict(false);
    setOpen(false);
  }

  if (submission.status !== "pending") {
    return (
      <div className="space-y-1">
        <ResolvedSummary
          submission={submission}
          reopening={reopen.isPending}
          onReopen={() => void handleReopen()}
        />
        {conflict && (
          <p className="text-muted-foreground text-sm">
            That submission was already accepted, so its outcome is settled. The accept wrote a
            public credit and an archived deck with it, and changing the ledger now would leave the
            three disagreeing.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={metaSubmissionStatusBadgeVariant.pending}>
        {metaSubmissionStatusLabels.pending}
      </Badge>
      <Badge variant="muted">{metaSubmissionKindLabels[submission.kind]}</Badge>
      <span className="text-muted-foreground min-w-0 text-sm">
        Nothing has been sent back to this contributor yet.
      </span>
      <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
        Resolve submission
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogForm onSubmit={() => void handleSubmit()}>
            <DialogHeader>
              <DialogTitle>
                {submission.playerName === null
                  ? `Resolve the correction to ${submission.eventName}`
                  : `Resolve ${submission.playerName}'s submission`}
              </DialogTitle>
              <DialogDescription>This is the only reply the contributor sees.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label>Outcome</Label>
                <RadioGroup
                  value={status}
                  onValueChange={(next) => pickStatus(next as MetaSubmissionResolution)}
                  className="flex flex-col gap-3"
                  aria-label="Outcome"
                >
                  {RESOLUTION_ORDER.map((option) => {
                    const radioId = `meta-resolution-${option}`;
                    return (
                      <div key={option} className="flex items-start gap-2">
                        <RadioGroupItem id={radioId} value={option} className="mt-1" />
                        <label htmlFor={radioId} className="cursor-pointer">
                          <span className="block">{metaSubmissionResolutionLabels[option]}</span>
                          <span className="text-muted-foreground block text-sm">
                            {metaSubmissionResolutionHints[option]}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </div>

              <SubmissionMessageFields
                idPrefix="meta-resolution"
                reasonOrder={metaSubmissionReasonsFor(submission.kind)}
                reasonLabels={metaSubmissionReasonLabels}
                reasonSentences={metaSubmissionReasonSentences}
                reason={reason}
                note={note}
                onReasonChange={setReason}
                onNoteChange={setNote}
                // `not_applied` has no canned sentence, and the contract's `reason` is nullable.
                allowNoReason
              />
              {submission.note !== null && (
                <p className="text-muted-foreground text-sm">
                  They wrote: &ldquo;{submission.note}&rdquo;
                </p>
              )}

              {conflict && (
                <p className="text-destructive text-sm">
                  That submission was already accepted, so its outcome is settled. The accept wrote
                  a public credit and an archived deck with it, and changing the ledger now would
                  leave the three disagreeing.
                </p>
              )}
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button
                type="submit"
                disabled={resolve.isPending || blocksSubmit(status, trimmedNote, reason)}
              >
                Send outcome
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
