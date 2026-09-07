import type { Currency, ListIntent, TradePreference } from "@openrift/shared";
import { useState } from "react";

import { TradePreferenceEditor } from "@/components/trade-preferences/trade-preference-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateList } from "@/hooks/use-lists";
import { useDisplayStore } from "@/stores/display-store";

interface ListEditDialogProps {
  listId: string;
  intent: ListIntent;
  currentName: string;
  currentTradeDefaults: TradePreference;
  currentCurrency: Currency | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ListEditDialog({
  listId,
  intent,
  currentName,
  currentTradeDefaults,
  currentCurrency,
  open,
  onOpenChange,
}: ListEditDialogProps) {
  const supportsPrefs = intent !== "organize";
  const defaultCurrency = useDisplayStore((s) => s.defaultCurrency);

  const [name, setName] = useState(currentName);
  const [tradeDefaults, setTradeDefaults] = useState<TradePreference>(currentTradeDefaults);
  const [currency, setCurrency] = useState<Currency>(currentCurrency ?? defaultCurrency);
  const updateList = useUpdateList();

  const [seed, setSeed] = useState({
    open,
    currentName,
    currentTradeDefaults,
    currentCurrency,
    defaultCurrency,
  });
  if (
    seed.open !== open ||
    seed.currentName !== currentName ||
    seed.currentTradeDefaults !== currentTradeDefaults ||
    seed.currentCurrency !== currentCurrency ||
    seed.defaultCurrency !== defaultCurrency
  ) {
    setSeed({ open, currentName, currentTradeDefaults, currentCurrency, defaultCurrency });
    if (open) {
      setName(currentName);
      setTradeDefaults(currentTradeDefaults);
      setCurrency(currentCurrency ?? defaultCurrency);
    }
  }

  const absoluteNeedsAmount =
    tradeDefaults.pricePref === "absolute" && tradeDefaults.priceAbsoluteCents === null;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed || absoluteNeedsAmount || updateList.isPending) {
      return;
    }
    updateList.mutate(
      {
        listId,
        name: trimmed === currentName ? undefined : trimmed,
        ...(supportsPrefs && { tradeDefaults, currency }),
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit list</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="list-edit-name">Name</Label>
              <Input
                id="list-edit-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: dialog input should grab focus
                autoFocus
              />
            </div>

            {supportsPrefs && (
              <div className="flex flex-col gap-2">
                <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Trade preferences
                </div>
                <div className="text-muted-foreground text-xs">
                  Defaults applied to every entry. You can override per card on each row.
                </div>
                <TradePreferenceEditor
                  value={tradeDefaults}
                  onChange={setTradeDefaults}
                  currency={currency}
                  showCurrency
                  onCurrencyChange={setCurrency}
                  idPrefix="list-edit"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={updateList.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || absoluteNeedsAmount || updateList.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
