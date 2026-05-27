import type { Currency, TradePreference } from "@openrift/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { TradePreferenceEditor } from "./trade-preference-editor";

interface TradePreferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Card name shown in the dialog header. */
  cardName: string;
  /** Initial entry-level override. */
  override: TradePreference;
  /** List defaults (informational; the editor only writes the override). */
  listDefault: TradePreference;
  /** List currency. */
  currency: Currency | null;
  /** True iff the incoming override is non-empty. */
  isOverridden: boolean;
  onSave: (next: TradePreference) => void;
}

/**
 * Edit a list entry's trade-preference override in a dialog. Used from the
 * grid-view context menu where the inline pill wouldn't fit.
 * @returns The dialog node.
 */
export function TradePreferenceDialog({
  open,
  onOpenChange,
  cardName,
  override,
  listDefault: _listDefault,
  currency,
  isOverridden,
  onSave,
}: TradePreferenceDialogProps) {
  const [draft, setDraft] = useState<TradePreference>(override);

  // Re-sync when a different entry's override flows in (the dialog is
  // mounted once and reused for whichever entry the user right-clicked).
  useEffect(() => {
    if (open) {
      setDraft(override);
    }
  }, [open, override]);

  const absoluteNeedsAmount = draft.pricePref === "absolute" && draft.priceAbsoluteCents === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trade preference</DialogTitle>
          <DialogDescription>
            Override for {cardName}. Leave fields at the list default to inherit.
          </DialogDescription>
        </DialogHeader>

        <TradePreferenceEditor
          value={draft}
          onChange={setDraft}
          currency={currency}
          showCurrency={false}
          idPrefix="entry-dialog"
        />

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isOverridden && draft.pricePref === null && draft.tradeType === null}
            onClick={() => {
              const reset: TradePreference = {
                pricePref: null,
                priceAbsoluteCents: null,
                tradeType: null,
              };
              setDraft(reset);
              onSave(reset);
              onOpenChange(false);
            }}
          >
            Reset to list default
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={absoluteNeedsAmount}
              onClick={() => {
                onSave(draft);
                onOpenChange(false);
              }}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
