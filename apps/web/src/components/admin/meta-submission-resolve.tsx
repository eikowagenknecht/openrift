import type { MetaSubmissionReason } from "@openrift/shared";
import { META_SUBMISSION_REASONS, formatDayTime } from "@openrift/shared";
import type {
  AdminMetaSubmission,
  MetaSubmissionResolution,
} from "@openrift/shared/contracts/admin/meta-submissions";
import { UndoIcon } from "lucide-react";
import { useState } from "react";

import { SubmissionMessageFields } from "@/components/admin/submission-message-fields";
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
import {
  useReopenMetaSubmission,
  useResolveMetaSubmission,
} from "@/hooks/use-admin-meta-submissions";
import {
  metaSubmissionExplanation,
  metaSubmissionReasonLabels,
  metaSubmissionReasonSentences,
  metaSubmissionResolutionHints,
  metaSubmissionResolutionLabels,
  metaSubmissionStatusBadgeVariant,
  metaSubmissionStatusLabels,
} from "@/lib/meta-submission-copy";

/**
 * The three outcomes, in the order an admin meets them. `already_correct` leads
 * because it is the expected result when a second person sends a list the
 * archive already has — the common case and the polite one — and it is a plain
 * radio option beside the other two, never a step further away than `rejected`.
 */
const RESOLUTION_ORDER: MetaSubmissionResolution[] = ["already_correct", "not_applied", "rejected"];

/** The reason a given outcome usually carries, so the common case is one click. */
const DEFAULT_REASON: Record<MetaSubmissionResolution, MetaSubmissionReason | null> = {
  already_correct: "already_correct",
  // Nothing generic fits "read it and took nothing from it", and a wrong canned
  // sentence is worse than none, so the admin picks one or writes their own.
  not_applied: null,
  rejected: "not_an_event",
};

/**
 * Declared above the component: the React Compiler bails on a function declared
 * after the return, and on one called before its declaration.
 *
 * @param status - The outcome currently selected.
 * @param note - The reviewer's own words, trimmed.
 * @param reason - The canned reason, if one is picked.
 * @returns True when the submit must stay disabled.
 */
function blocksSubmit(
  status: MetaSubmissionResolution,
  note: string,
  reason: MetaSubmissionReason | null,
): boolean {
  // A rejection is the one outcome that is a judgement, so it may never reach
  // the contributor as a bare "Not used". Either half of the explanation will
  // do — a note replaces the canned sentence anyway.
  return status === "rejected" && reason === null && note.length === 0;
}

/**
 * What the archive already told this contributor, for a submission that is
 * settled. Shown instead of the form, with the reopen that undoes a misclick.
 *
 * @returns The resolved summary.
 */
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
  /** Scopes the cache invalidation to the roster row this was resolved from. */
  candidatePlayerId: string;
}

/**
 * The resolve control for one contributed decklist (ADR-014's user
 * submissions). Accepting is the accept path's job and writes a public credit
 * with it, so `accepted` is deliberately not among the outcomes here: this is
 * the other half, the one that tells someone their list was not used and why.
 *
 * Without it a submission could only ever reach `accepted`, and a declined
 * contributor would read "pending" forever.
 *
 * @returns The pending form's trigger, or the resolved summary with its reopen.
 */
export function MetaSubmissionResolve({
  submission,
  candidatePlayerId,
}: MetaSubmissionResolveProps) {
  const resolve = useResolveMetaSubmission();
  const reopen = useReopenMetaSubmission();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MetaSubmissionResolution>("already_correct");
  const [reason, setReason] = useState<MetaSubmissionReason | null>("already_correct");
  const [note, setNote] = useState("");
  // The API's own explanation when the accept settled this first; shown in
  // place of a failure toast, which would say nothing an admin could act on.
  const [conflict, setConflict] = useState(false);

  function pickStatus(next: MetaSubmissionResolution) {
    setStatus(next);
    // Follow the outcome's usual reason until the admin overrides it, which is
    // what keeps the common case one click.
    setReason(DEFAULT_REASON[next]);
  }

  async function handleReopen() {
    let result;
    try {
      result = await reopen.mutateAsync({ submissionId: submission.id, candidatePlayerId });
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
        candidatePlayerId,
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
          onReopen={handleReopen}
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
      <span className="text-muted-foreground min-w-0 text-sm">
        Nothing has been sent back to this contributor yet.
      </span>
      <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
        Resolve submission
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogForm onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Resolve {submission.playerName}&apos;s submission</DialogTitle>
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
                reasonOrder={META_SUBMISSION_REASONS}
                reasonLabels={metaSubmissionReasonLabels}
                reasonSentences={metaSubmissionReasonSentences}
                reason={reason}
                note={note}
                onReasonChange={setReason}
                onNoteChange={setNote}
                // Unlike the card dialog, a reason is genuinely optional here:
                // `not_applied` has no canned sentence that fits, and the
                // contract's `reason` is nullable.
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
