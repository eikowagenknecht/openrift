import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cardWord } from "@/features/scan/lib/scan-card-word";

interface ScanClearDialogProps {
  count: number | null;
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
}

export function ScanClearDialog({ count, onOpenChange, onClear }: ScanClearDialogProps) {
  return (
    <AlertDialog open={count !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Clear {count ?? 0} scanned {cardWord(count ?? 0)}?
          </AlertDialogTitle>
          <AlertDialogDescription>They are not in a collection yet.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogPrimitive.Close render={<Button variant="destructive" />} onClick={onClear}>
            Clear
          </AlertDialogPrimitive.Close>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
