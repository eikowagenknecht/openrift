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
import { useDisplayStore } from "@/stores/display-store";

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
  /** Current list currency. When `null`, the dialog shows a currency picker
   * (seeded from the user's default) and passes the chosen value back via
   * `listCurrencyToSet` on save so the parent can patch the list. */
  currency: Currency | null;
  /** True iff the incoming override is non-empty. */
  isOverridden: boolean;
  /**
   * Save handler. `listCurrencyToSet` is set when the dialog needed to ask
   * the user for a currency (parent's `currency` was null at open time and
   * the user picked an absolute price). Parent should push it onto the list
   * before/with the entry override.
   */
  onSave: (next: TradePreference, listCurrencyToSet?: Currency) => void;
}

/**
 * Edit a list entry's trade-preference override in a dialog. Used from the
 * grid-view context menu and from the row pill.
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
  const defaultCurrency = useDisplayStore((s) => s.defaultCurrency);
  const [draft, setDraft] = useState<TradePreference>(override);
  // Local currency draft — only meaningful when the list has no currency yet.
  // Seeded from the user's default so the editor shows a real symbol instead
  // of "?" the moment the user picks an absolute price.
  const [draftCurrency, setDraftCurrency] = useState<Currency>(currency ?? defaultCurrency);
  const listMissingCurrency = currency === null;

  // Re-sync when a different entry's override flows in (the dialog is
  // mounted once and reused for whichever entry the user right-clicked).
  useEffect(() => {
    if (open) {
      setDraft(override);
      setDraftCurrency(currency ?? defaultCurrency);
    }
  }, [open, override, currency, defaultCurrency]);

  const absoluteNeedsAmount = draft.pricePref === "absolute" && draft.priceAbsoluteCents === null;
  // Only push a list-currency back up when the list didn't have one to begin
  // with and the user actually picked an absolute price.
  const listCurrencyToSet: Currency | undefined =
    listMissingCurrency && draft.pricePref === "absolute" ? draftCurrency : undefined;

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
          currency={draftCurrency}
          // Show the currency picker only when the list has no currency yet
          // and the user is editing an absolute price. Once the user saves,
          // the list keeps that currency and the picker stops appearing.
          showCurrency={listMissingCurrency && draft.pricePref === "absolute"}
          onCurrencyChange={setDraftCurrency}
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
                onSave(draft, listCurrencyToSet);
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
