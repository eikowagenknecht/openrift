import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";
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

function SettleOverflowMenu({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
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

export function TradeRowActions({
  trade,
  cardName,
}: {
  trade: CardTradeResponse;
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

  // groupSlug only scopes cache invalidation; a trade with no group shows no
  // actions at all, so the undefined branch here is unreachable.
  const actionArgs = { tradeId: trade.id, groupSlug: trade.groupSlug ?? undefined };

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
          // Cancel disappears once either side has settled: the giver's
          // settle hard-deletes the copies and the server refuses it then.
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
