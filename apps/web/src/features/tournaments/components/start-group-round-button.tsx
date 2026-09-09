import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { PlayIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";

export function StartGroupRoundButton({
  roundNumber,
  scopeLabel,
  disabled,
  pending,
  size = "sm",
  onConfirm,
}: {
  roundNumber: number;
  /** "Group A", "Group D · E", or "all groups". */
  scopeLabel: string;
  disabled: boolean;
  pending: boolean;
  size?: "sm" | "default";
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger disabled={disabled || pending} render={<Button size={size} />}>
        <PlayIcon />
        Start round {roundNumber}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <DialogForm onSubmit={onConfirm}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Start round {roundNumber} for {scopeLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Please tell a judge before you start the next round.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogPrimitive.Close render={<Button type="submit" />}>
              Start round {roundNumber}
            </AlertDialogPrimitive.Close>
          </AlertDialogFooter>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
