import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BinderSheetPanelProps } from "@/features/groups/components/binder-sheet-panel";
import { BinderSheetPanel } from "@/features/groups/components/binder-sheet-panel";

interface BinderSheetDialogProps extends BinderSheetPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BinderSheetDialog({ open, onOpenChange, ...panelProps }: BinderSheetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Print for your binder</DialogTitle>
          <DialogDescription>A QR sheet for the front of your binder.</DialogDescription>
        </DialogHeader>

        <BinderSheetPanel {...panelProps} />
      </DialogContent>
    </Dialog>
  );
}
