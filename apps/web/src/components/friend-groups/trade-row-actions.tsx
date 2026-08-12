import type { CardTradeResponse } from "@openrift/shared";
import { CheckIcon, EllipsisVerticalIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCancelTrade, useDeclineTrade, useSkipTradeSync } from "@/hooks/use-card-trades";
import { useTradeActionStore } from "@/stores/trade-action-store";

import { TradeCopyPickerDialog, useTradeAcceptFlow } from "./trade-copy-picker-dialog";

/**
 * The overflow menu a reserved row carries. One trigger per row: on phones it
 * is pinned to the card's top-right corner, so a second menu would land on top
 * of the first.
 * @returns The menu.
 */
function SettleOverflowMenu({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // The row's own corner rather than the button row: a reserved row has
          // no buttons left to sit beside, and on phones the corner is where
          // every other row's menu already is.
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            aria-label="More trade actions"
            className="absolute top-2 right-2 sm:static"
          />
        }
      >
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The contextual action cluster for one trade row: accept/decline while the
 * trade awaits the viewer, cancel while it awaits the other side, and an
 * overflow menu once it is reserved. Owns the mutations, the shared
 * action-store pending state and the accept copy picker, so a row is only
 * responsible for its own identity and status.
 * @returns The button cluster and the accept picker dialog.
 */
export function TradeRowActions({
  trade,
  cardName,
}: {
  trade: CardTradeResponse;
  /** The resolved card name, for the accept picker's heading. */
  cardName: string;
}) {
  const acting = useTradeActionStore((state) => state.pending.has(trade.id));
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);

  const acceptFlow = useTradeAcceptFlow({ onSettled: () => settle(trade.id) });
  const decline = useDeclineTrade();
  const cancel = useCancelTrade();
  const skipSync = useSkipTradeSync();

  const incoming = trade.role === "receiver";
  const cancellable =
    trade.viewerSyncAppliedAt === null && trade.counterpartySyncAppliedAt === null;

  function run<TVariables>(
    mutation: { mutate: (variables: TVariables, options?: { onSettled?: () => void }) => void },
    variables: TVariables,
  ): void {
    begin(trade.id);
    mutation.mutate(variables, { onSettled: () => settle(trade.id) });
  }

  const actionArgs = { tradeId: trade.id, groupSlug: trade.groupSlug };

  return (
    <>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
        {trade.actionNeeded === "accept-or-decline" ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => run(decline, actionArgs)}
            >
              Decline
            </Button>
            <Button
              size="sm"
              disabled={acting}
              onClick={() => {
                begin(trade.id);
                acceptFlow.start({ ...actionArgs, role: trade.role, cardName });
              }}
            >
              Accept
            </Button>
          </>
        ) : null}

        {trade.actionNeeded === "cancel" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={() => run(cancel, actionArgs)}
          >
            Cancel
          </Button>
        ) : null}

        {trade.actionNeeded === "settle" ? (
          // A reserved row carries no settle button of its own. Settling is a
          // session on the trade sheet's ready-to-swap section, worked through
          // with the cards in front of you and committed in one press, so a
          // per-row button here would be a second way to do the same thing with
          // none of the counting.
          //
          // What is left are the two exits a session cannot offer. Skip settles
          // the viewer's half without touching the collection, for someone whose
          // data is already right; the viewer settles their own half and nothing
          // else, and the second side's settle is what completes the trade
          // (ADR-019, amendment 2026-08-10). Cancel backs out of the whole
          // reservation, and disappears once either side has settled: the
          // giver's settle hard-deletes the copies, so there is nothing to undo
          // and the server refuses it.
          <SettleOverflowMenu disabled={acting}>
            <DropdownMenuItem onClick={() => run(skipSync, actionArgs)}>
              <CheckIcon className="size-4" />
              {incoming ? "Got them, don't add" : "Handed over, keep mine"}
            </DropdownMenuItem>
            {cancellable ? (
              <DropdownMenuItem variant="destructive" onClick={() => run(cancel, actionArgs)}>
                <XIcon className="size-4" />
                Cancel trade
              </DropdownMenuItem>
            ) : null}
          </SettleOverflowMenu>
        ) : null}
      </div>

      {trade.actionNeeded === "accept-or-decline" ? (
        <TradeCopyPickerDialog flow={acceptFlow} />
      ) : null}
    </>
  );
}
