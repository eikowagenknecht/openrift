import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { LoaderIcon } from "lucide-react";

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

export function ConfirmClearButton({
  title,
  description,
  onConfirm,
  disabled,
  isPending,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
  isPending?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger disabled={disabled} render={<Button variant="destructive" />}>
        {isPending ? <LoaderIcon className="size-4 animate-spin" /> : "Clear"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogPrimitive.Close render={<Button variant="destructive" />} onClick={onConfirm}>
            Clear
          </AlertDialogPrimitive.Close>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
