import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";
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

type BulkMode = "accept-decline" | "cancel" | "none";

const BULK_ACCEPT_CONFIRM_THRESHOLD = 10;

/** Bulk accept sends no `copyIds`; the server defaults to plainest copies when none are given. */
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
        { tradeId: trade.id, groupSlug: trade.groupSlug ?? undefined },
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
  // A big accept-all reserves real copies on both shelves; above the
  // threshold the button confirms once before firing.
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
