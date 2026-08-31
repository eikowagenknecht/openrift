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
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Pieces the Meta Archive's review surfaces share (ADR-014).

/**
 * A titled panel that starts closed. Its content still mounts eagerly, so a
 * child that fetches takes `onOpenChange` and gates its own query on it.
 *
 * @returns The disclosure.
 */
export function ReviewDisclosure({
  title,
  contentClassName,
  onOpenChange,
  children,
}: {
  title: ReactNode;
  /** Extra classes on the panel, e.g. spacing for multi-block content. */
  contentClassName?: string;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible className="rounded-md border" onOpenChange={onOpenChange}>
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
 * A button that asks before it acts. Dismissing a source key writes a permanent
 * skip, so both dismiss actions go through this.
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
