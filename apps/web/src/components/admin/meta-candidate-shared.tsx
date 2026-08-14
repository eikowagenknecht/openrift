import type { MetaCandidateQueueRow } from "@openrift/shared";
import { ChevronRightIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { candidateStateDisplay } from "@/lib/meta-candidate-review";
import { cn } from "@/lib/utils";

// Pieces the candidate queue and the candidate detail page both use (ADR-014).

/**
 * The New / Changed / In sync chip.
 *
 * @returns The state badge.
 */
export function CandidateStateBadge({ state }: { state: MetaCandidateQueueRow["state"] }) {
  const display = candidateStateDisplay(state);
  return <Badge variant={display.variant}>{display.label}</Badge>;
}

/**
 * A titled section that folds away: the candidate surfaces' one disclosure
 * chrome, carrying the source fields nothing maps to, the upload format help,
 * and each breakdown of an upload summary.
 *
 * @returns The collapsible section.
 */
export function CandidateDisclosure({
  title,
  contentClassName,
  children,
}: {
  title: ReactNode;
  /** Extra classes on the panel, e.g. spacing for multi-block content. */
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium select-none">
        {title}
        <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("border-t px-3 py-2 text-sm", contentClassName)}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ConfirmActionButtonProps {
  /** Button face — icon plus label. */
  children: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Runs on confirm. Rejecting leaves the dialog open; the global toast reports why. */
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
  /**
   * The element the trigger renders as. Defaults to a small ghost `Button`;
   * a page top bar passes `<PageTopBarButton />` so the bar keeps one height
   * and emphasis ladder.
   */
  trigger?: ReactElement;
}

/**
 * A button that asks before it acts. Ignoring a candidate deletes the staged row
 * and writes a permanent skip key, so both ignore actions go through this.
 *
 * @returns The trigger button plus its confirmation dialog.
 */
export function ConfirmActionButton({
  children,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  trigger,
}: ConfirmActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // A JSX default in the destructuring pattern makes the React Compiler bail on
  // the whole file (it cannot lower an AssignmentPattern there), so the fallback
  // trigger is built in the body.
  const triggerElement = trigger ?? <Button variant="ghost" size="sm" />;

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
    } catch {
      // Reported by the global mutation error toast.
      setPending(false);
      return;
    }
    setPending(false);
    setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={triggerElement} disabled={disabled}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm} disabled={pending}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
