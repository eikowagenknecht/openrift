import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** What the API refused, and what confirming would retry. */
export interface MetaOverwriteConfirm {
  /** The candidate whose values would be taken wholesale. */
  candidateId: string;
  /** The provider that candidate came from, for the question's headline. */
  provider: string;
  /** The API's refusal, which names the sources that would be overwritten. */
  message: string;
  /** True when the refused call was the accept that also archives the decks. */
  withDecks: boolean;
}

/**
 * The multi-source overwrite guard's question (ADR-014). The API refuses a
 * whole-source accept when a second source also feeds the live event, and it is
 * a question rather than a failure: the answer is either this dialog's confirm,
 * which retries with `overwriteAll`, or taking the fields one at a time in the
 * compare grid. It deliberately never reaches the global error toast, which
 * would read as a bug and offer nothing to do.
 *
 * @returns The confirmation dialog, or null when nothing was refused.
 */
export function MetaOverwriteConfirmDialog({
  confirm,
  pending,
  onCancel,
  onConfirm,
}: {
  confirm: MetaOverwriteConfirm | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (confirm === null) {
    return null;
  }
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Overwrite with {confirm.provider}&apos;s values?</AlertDialogTitle>
          <AlertDialogDescription>{confirm.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Take fields one at a time</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
            Overwrite
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
