import type { CardTradeResponse } from "@openrift/shared";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAcceptTrade, useCancelTrade, useDeclineTrade } from "@/hooks/use-card-trades";
import { useTradeActionStore } from "@/stores/trade-action-store";

/** Which bulk action a block of one member's trades offers: accept/decline for
 * the requests awaiting the viewer, cancel for the requests the viewer sent, or
 * none (completed history). */
type BulkMode = "accept-decline" | "cancel" | "none";

/**
 * Above this many requests, "Accept all" asks first. Each accept reserves real
 * copies on both shelves, and at this size the button is usually pressed on a
 * pile the viewer has not actually read row by row.
 */
const BULK_ACCEPT_CONFIRM_THRESHOLD = 10;

/**
 * The bulk action buttons over one member's trades. Acts on the ones whose
 * contextual action matches the mode — accept/decline for "Your move" requests,
 * cancel for the viewer's own pending ones — firing one mutation per trade and
 * driving the shared action store so every affected row shows its in-flight
 * state. Renders nothing until there are at least two to act on, since a lone
 * trade is served fine by its own row button.
 *
 * Reserved trades are not bulk-settled from here. Settling a pile is what the
 * trade sheet's settle session is for, and it counts what actually turned up
 * first, which a button that files everything at once cannot.
 *
 * Bulk accept deliberately does not offer the copy picker the row buttons do.
 * Choosing copies needs one options read per trade, and that read re-derives
 * the giver's supply, so an "Accept all (12)" would pay twelve of them before
 * anything happened and then stop on a queue of dialogs. Sending no `copyIds`
 * leaves the server pinning the plainest copies first, which is the protection
 * that matters here. A giver who wants to hand over a specific copy accepts
 * that trade from its own row.
 * @returns The bulk-action buttons, or null when fewer than two apply.
 */
export function BulkTradeActions({
  trades,
  mode,
}: {
  trades: CardTradeResponse[];
  mode: BulkMode;
}) {
  const accept = useAcceptTrade();
  const decline = useDeclineTrade();
  const cancel = useCancelTrade();
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const needle = mode === "accept-decline" ? "accept-or-decline" : "cancel";
  const targets = mode === "none" ? [] : trades.filter((trade) => trade.actionNeeded === needle);
  const acting = useTradeActionStore((state) =>
    targets.some((trade) => state.pending.has(trade.id)),
  );

  // Declared ahead of the early returns below: the React Compiler bails on a
  // function declaration it reaches only after a `return`.
  function runAll(mutation: {
    mutate: (
      variables: { tradeId: string; groupSlug?: string },
      options?: { onSettled?: () => void },
    ) => void;
  }): void {
    for (const trade of targets) {
      begin(trade.id);
      mutation.mutate(
        { tradeId: trade.id, groupSlug: trade.groupSlug },
        { onSettled: () => settle(trade.id) },
      );
    }
  }

  if (targets.length < 2) {
    return null;
  }

  if (mode === "cancel") {
    return (
      <Button size="sm" variant="outline" disabled={acting} onClick={() => runAll(cancel)}>
        Cancel all ({targets.length})
      </Button>
    );
  }
  // A big accept-all reserves real copies on both shelves, so above the
  // threshold the button asks once instead of firing on a misread pile.
  const needsConfirm = targets.length > BULK_ACCEPT_CONFIRM_THRESHOLD;
  const counterpartyName = targets[0]?.counterparty.name ?? "this member";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={acting} onClick={() => runAll(decline)}>
        Decline all
      </Button>
      <Button
        size="sm"
        disabled={acting}
        onClick={() => (needsConfirm ? setConfirmOpen(true) : runAll(accept))}
      >
        Accept all ({targets.length})
      </Button>
      {needsConfirm ? (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>
              Accept all {targets.length} requests from {counterpartyName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each accepted request reserves your copies for the swap. You can still cancel
              individual trades afterwards.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmOpen(false);
                  runAll(accept);
                }}
              >
                Accept all ({targets.length})
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
