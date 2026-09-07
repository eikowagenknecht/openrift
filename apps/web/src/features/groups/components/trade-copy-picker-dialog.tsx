import { enumLabel } from "@openrift/shared/enum-label";
import type {
  CardTradeCopyOption,
  CardTradeCopyOptionsResponse,
  CardTradeRole,
} from "@openrift/shared/types/api/card-trade";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import type { CopyMarker } from "@/features/collections/components/copy-indicators";
import { copyMarkers } from "@/features/collections/components/copy-indicators";
import {
  tradeCopyOptionsQueryOptions,
  useAcceptTrade,
} from "@/features/groups/hooks/use-card-trades";
import { useEnumOrders } from "@/hooks/use-enums";
import { useRequiredUserId } from "@/lib/auth-session";

export interface TradeAcceptTarget {
  tradeId: string;
  groupSlug?: string;
  role: CardTradeRole;
  cardName: string;
}

interface TradeCopyChoice {
  target: TradeAcceptTarget;
  options: CardTradeCopyOptionsResponse;
}

export interface TradeAcceptFlow {
  start: (target: TradeAcceptTarget) => void;
  busy: boolean;
  choice: TradeCopyChoice | null;
  confirm: (copyIds: string[]) => void;
  cancel: () => void;
  accepting: boolean;
}

export function useTradeAcceptFlow({ onSettled }: { onSettled?: () => void } = {}) {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const accept = useAcceptTrade();
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<TradeCopyChoice | null>(null);

  function finish(): void {
    setBusy(false);
    setChoice(null);
    onSettled?.();
  }

  function acceptWith(target: TradeAcceptTarget, copyIds?: string[]): void {
    setBusy(true);
    accept.mutate(
      { tradeId: target.tradeId, groupSlug: target.groupSlug, copyIds },
      { onSettled: finish },
    );
  }

  const flow: TradeAcceptFlow = {
    busy,
    choice,
    accepting: accept.isPending,

    start: (target) => {
      // The receiver's side owns no copies to promise; the options route answers a receiver 403.
      if (target.role !== "giver") {
        acceptWith(target);
        return;
      }
      setBusy(true);
      void (async () => {
        try {
          const options = await queryClient.query(
            tradeCopyOptionsQueryOptions(userId, target.tradeId),
          );
          if (options.choiceMatters) {
            setChoice({ target, options });
            return;
          }
        } catch {
          // Options read failure falls through to a plain accept; a real
          // failure resurfaces on the accept mutation itself.
        }
        acceptWith(target);
      })();
    },

    confirm: (copyIds) => {
      if (choice === null) {
        return;
      }
      acceptWith(choice.target, copyIds);
    },

    cancel: () => {
      if (accept.isPending) {
        return;
      }
      finish();
    },
  };
  return flow;
}

function markersFor(copy: CardTradeCopyOption): CopyMarker[] {
  const asCopy: CopyResponse = {
    ...copy,
    printingId: "",
    groupId: null,
    onLoan: false,
    reserved: false,
  };
  return copyMarkers(asCopy);
}

function CopyQualityBadge({ copy }: { copy: CardTradeCopyOption }) {
  const { labels } = useEnumOrders();

  if (copy.grader !== null && copy.grade !== null) {
    return (
      <Badge variant="secondary">
        {enumLabel(labels.graders, copy.grader)} {copy.grade}
      </Badge>
    );
  }
  if (copy.condition !== null) {
    return <Badge variant="secondary">{enumLabel(labels.conditions, copy.condition)}</Badge>;
  }
  return null;
}

function CopyOptionSummary({ copy }: { copy: CardTradeCopyOption }) {
  if (!copy.hasRecordedDetails) {
    return <span className="text-muted-foreground text-sm">No details</span>;
  }

  return (
    <>
      <CopyQualityBadge copy={copy} />
      {markersFor(copy).map(({ key, icon: Icon, label, content }) => (
        <Badge key={key} variant="outline" title={content ?? label}>
          <Icon aria-hidden />
          {label}
        </Badge>
      ))}
    </>
  );
}

function selectionHint(selected: number, quantity: number): string {
  const missing = quantity - selected;
  if (missing > 0) {
    return missing === 1 ? "Pick 1 more copy." : `Pick ${missing} more copies.`;
  }
  if (missing < 0) {
    const extra = -missing;
    return extra === 1 ? "Unpick 1 copy." : `Unpick ${extra} copies.`;
  }
  return quantity === 1 ? "1 copy picked." : `${quantity} copies picked.`;
}

// Opens on the copies already pinned to the trade when there are any,
// otherwise the server's own pin order; either way capped at `quantity`.
function defaultSelection(options: CardTradeCopyOptionsResponse, quantity: number): Set<string> {
  const pinned = options.copies.filter((copy) => copy.pinned);
  const preselected = (pinned.length > 0 ? pinned : options.copies).slice(0, quantity);
  return new Set(preselected.map((copy) => copy.id));
}

function CopyPickerBody({
  title,
  description,
  confirmLabel,
  options,
  quantity,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  options: CardTradeCopyOptionsResponse;
  quantity: number;
  pending: boolean;
  onConfirm: (copyIds: string[]) => void;
  onCancel: () => void;
}) {
  const { copies } = options;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    defaultSelection(options, quantity),
  );

  const ready = selectedIds.size === quantity;

  return (
    <DialogForm
      onSubmit={() => {
        if (!ready) {
          return;
        }
        onConfirm(copies.filter((copy) => selectedIds.has(copy.id)).map((copy) => copy.id));
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <ul className="-mx-1 flex max-h-72 flex-col gap-1 overflow-y-auto">
        {copies.map((copy) => {
          const checkboxId = `trade-copy-${copy.id}`;
          return (
            <li key={copy.id} className="flex items-center gap-3 px-1 py-1">
              <Checkbox
                id={checkboxId}
                checked={selectedIds.has(copy.id)}
                disabled={pending}
                onCheckedChange={(checked) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (checked === false) {
                      next.delete(copy.id);
                    } else {
                      next.add(copy.id);
                    }
                    return next;
                  });
                }}
              />
              <label
                htmlFor={checkboxId}
                className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-1.5"
              >
                <span className="max-w-48 truncate text-sm font-medium">{copy.collectionName}</span>
                <CopyOptionSummary copy={copy} />
              </label>
            </li>
          );
        })}
      </ul>

      <DialogFooter className="sm:justify-between">
        <p aria-live="polite" className="text-muted-foreground self-center text-sm">
          {selectionHint(selectedIds.size, quantity)}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !ready}>
            {confirmLabel}
          </Button>
        </div>
      </DialogFooter>
    </DialogForm>
  );
}

export function TradeCopyPickerDialog({ flow }: { flow: TradeAcceptFlow }) {
  const choice = flow.choice;
  const quantity = choice?.options.quantity ?? 1;
  return (
    <Dialog
      open={choice !== null}
      onOpenChange={(open) => {
        if (!open) {
          flow.cancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {choice === null ? null : (
          <CopyPickerBody
            title={quantity === 1 ? "Which copy?" : `Which ${quantity} copies?`}
            description={`You have ${choice.options.copies.length} copies of ${choice.target.cardName} this trade could take. Pick the ${quantity === 1 ? "one" : quantity} you want to hand over. The rest stay yours.`}
            confirmLabel="Accept"
            options={choice.options}
            quantity={quantity}
            pending={flow.accepting}
            onConfirm={(copyIds) => flow.confirm(copyIds)}
            onCancel={() => flow.cancel()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface TradeSettleChoice {
  options: CardTradeCopyOptionsResponse;
  quantity: number;
}

// No "start": the choice already exists by the time this opens.
export interface TradeSettleChoiceControl {
  choice: TradeSettleChoice | null;
  confirm: (copyIds: string[]) => void;
  cancel: () => void;
  settling: boolean;
}

export function TradeSettleCopyPickerDialog({
  flow,
  cardName,
}: {
  flow: TradeSettleChoiceControl;
  cardName: string;
}) {
  const choice = flow.choice;
  const quantity = choice?.quantity ?? 1;
  const noun = quantity === 1 ? "copy" : `${quantity} copies`;
  return (
    <Dialog
      open={choice !== null}
      onOpenChange={(open) => {
        if (!open) {
          flow.cancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {choice === null ? null : (
          <CopyPickerBody
            // Keyed by trade id to reset selection state per row.
            key={choice.options.tradeId}
            title={quantity === 1 ? "Which copy did you hand over?" : `Which ${quantity} copies?`}
            description={`Pick the ${noun} of ${cardName} that changed hands. ${quantity === 1 ? "It leaves" : "They leave"} your collection for good, and the rest stay yours.`}
            confirmLabel={`Remove ${noun}`}
            options={choice.options}
            quantity={quantity}
            pending={flow.settling}
            onConfirm={(copyIds) => flow.confirm(copyIds)}
            onCancel={() => flow.cancel()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
