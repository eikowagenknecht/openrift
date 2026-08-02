import type {
  CardTradeCopyOption,
  CardTradeCopyOptionsResponse,
  CardTradeRole,
  CopyResponse,
} from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { CopyMarker } from "@/components/collection/copy-indicators";
import { copyMarkers } from "@/components/collection/copy-indicators";
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
import { tradeCopyOptionsQueryOptions, useAcceptTrade } from "@/hooks/use-card-trades";
import { useEnumOrders } from "@/hooks/use-enums";
import { useRequiredUserId } from "@/lib/auth-session";

/** The trade an accept was started for. */
export interface TradeAcceptTarget {
  tradeId: string;
  groupSlug: string;
  /** The viewer's side. Only a giver has copies of their own to promise. */
  role: CardTradeRole;
  /** Card name, for the picker's heading. */
  cardName: string;
}

/** An accept paused on the giver's copy choice. */
interface TradeCopyChoice {
  target: TradeAcceptTarget;
  options: CardTradeCopyOptionsResponse;
}

/**
 * An accept in progress, shared between the row's Accept button and the copy
 * picker. `start` is the only entry point; everything below it is the picker's
 * own plumbing.
 */
export interface TradeAcceptFlow {
  /** Begins an accept. Prompts only when the giver has a real choice to make. */
  start: (target: TradeAcceptTarget) => void;
  /** True from the click until the accept settles or the picker is dismissed. */
  busy: boolean;
  /** The paused accept the picker is showing, or null when it is closed. */
  choice: TradeCopyChoice | null;
  /** Accepts with the chosen copies. */
  confirm: (copyIds: string[]) => void;
  /** Drops the accept without touching the trade. */
  cancel: () => void;
  /** True while the accept mutation itself is in flight. */
  accepting: boolean;
}

/**
 * Drives one row's Accept button: reads which copies the trade could take, then
 * either accepts straight away or hands off to `TradeCopyPickerDialog`.
 *
 * The options read happens between the click and the prompt, not on mount, so
 * a page of trade rows costs nothing until someone actually accepts. It is also
 * what decides whether to prompt at all: a giver looking at a stack of
 * identical unrecorded copies has nothing to choose, so `choiceMatters` comes
 * back false and the accept goes through with no dialog. That keeps the common
 * case a plain button press, at the cost of one request before it lands.
 * @returns The accept flow for one row.
 */
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
      // The receiver never picks: the copies at stake are the other party's,
      // and the options route answers a receiver 403.
      if (target.role !== "giver") {
        acceptWith(target);
        return;
      }
      setBusy(true);
      void (async () => {
        try {
          const options = await queryClient.fetchQuery(
            tradeCopyOptionsQueryOptions(userId, target.tradeId),
          );
          if (options.choiceMatters) {
            setChoice({ target, options });
            return;
          }
        } catch {
          // The picker refines the accept, it does not gate it. If the options
          // read fails, fall through to the plain accept this button always
          // did and let the server pin the plainest copies. A failure that
          // matters (the trade moved on) surfaces again on the accept itself,
          // where the global mutation toast reports it.
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

/**
 * `copyMarkers` is typed against the full `CopyResponse`, while a trade copy
 * option is deliberately a narrower DTO (no printing, no loan or reserve
 * state). It only reads the metadata fields the two shapes share, so fill the
 * rest with inert values rather than restating the marker list here and letting
 * the two drift.
 * @returns The copy's markers, in the same order the collection surfaces use.
 */
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

/**
 * How good the copy is, in one badge: its grade once it has been slabbed,
 * otherwise its condition.
 * @returns The badge, or null when the copy records neither.
 */
function CopyQualityBadge({ copy }: { copy: CardTradeCopyOption }) {
  const { labels } = useEnumOrders();

  if (copy.grader !== null && copy.grade !== null) {
    return (
      <Badge variant="secondary">
        {labels.graders[copy.grader]} {copy.grade}
      </Badge>
    );
  }
  if (copy.condition !== null) {
    return <Badge variant="secondary">{labels.conditions[copy.condition]}</Badge>;
  }
  return null;
}

/**
 * What distinguishes one candidate copy from the next: its condition or grade,
 * then the altered/notes/links markers. Mirrors the copy-details picker's
 * summary so a copy reads the same here as it does in the collection.
 * @returns The summary badges, or the "nothing recorded" hint.
 */
function CopyOptionSummary({ copy }: { copy: CardTradeCopyOption }) {
  if (!copy.hasRecordedDetails) {
    return <span className="text-muted-foreground text-sm">Nothing recorded</span>;
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

/**
 * How far the selection is from what the trade needs. Spoken to screen readers
 * as it changes, so the disabled confirm button is never a mystery.
 * @returns The hint sentence.
 */
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

function CopyPickerBody({
  cardName,
  options,
  pending,
  onConfirm,
  onCancel,
}: {
  cardName: string;
  options: CardTradeCopyOptionsResponse;
  pending: boolean;
  onConfirm: (copyIds: string[]) => void;
  onCancel: () => void;
}) {
  const { quantity, copies } = options;
  // The server hands back its own pin order, so the first `quantity` copies are
  // byte-for-byte what an accept without a choice would promise.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(copies.slice(0, quantity).map((copy) => copy.id)),
  );

  const ready = selectedIds.size === quantity;

  return (
    <DialogForm
      onSubmit={() => {
        if (!ready) {
          return;
        }
        // Always send the ids, even when they still match the preselection. The
        // order was computed when the picker opened, so naming the copies makes
        // a supply change since then fail loudly instead of quietly promising a
        // different copy than the one on screen.
        onConfirm(copies.filter((copy) => selectedIds.has(copy.id)).map((copy) => copy.id));
      }}
    >
      <DialogHeader>
        <DialogTitle>{quantity === 1 ? "Which copy?" : `Which ${quantity} copies?`}</DialogTitle>
        <DialogDescription>
          You have {copies.length} copies of {cardName} this trade could take. Pick the{" "}
          {quantity === 1 ? "one" : quantity} you want to hand over. The rest stay yours.
        </DialogDescription>
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
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
              >
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <CopyOptionSummary copy={copy} />
                </span>
                <span className="text-muted-foreground shrink-0 truncate text-xs">
                  {copy.collectionName}
                </span>
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
            Accept
          </Button>
        </div>
      </DialogFooter>
    </DialogForm>
  );
}

/**
 * Lets the giver choose which physical copies an accept promises away, so a
 * graded or annotated copy is never handed over just because it happened to
 * come first out of supply. Mount it next to an Accept button wired to the same
 * `useTradeAcceptFlow`; it stays closed unless that flow found a choice worth
 * making.
 * @returns The picker dialog.
 */
export function TradeCopyPickerDialog({ flow }: { flow: TradeAcceptFlow }) {
  const choice = flow.choice;
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
            cardName={choice.target.cardName}
            options={choice.options}
            pending={flow.accepting}
            onConfirm={(copyIds) => flow.confirm(copyIds)}
            onCancel={() => flow.cancel()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
