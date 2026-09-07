import { marketplaceLabel } from "@openrift/shared/marketplace";
import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";
import type { ReactNode } from "react";

import { usePrices } from "@/hooks/use-prices";
import { compactFormatterForMarketplace } from "@/lib/format";
import { sumTradeValues } from "@/lib/trade-derivation";
import { useDisplayStore } from "@/stores/display-store";

function cardCount(trades: readonly CardTradeResponse[], role: CardTradeResponse["role"]): number {
  return trades
    .filter((trade) => trade.role === role)
    .reduce((total, trade) => total + trade.quantity, 0);
}

/** In the marketplace's currency. */
const EVEN_THRESHOLD = 1;

export function TradeBalanceBar({ trades }: { trades: readonly CardTradeResponse[] }) {
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");

  if (trades.length === 0) {
    return null;
  }

  const split = sumTradeValues(trades, (printingId) => prices.get(printingId, marketplace));
  const fmt = compactFormatterForMarketplace(marketplace);
  const giveCards = cardCount(trades, "giver");
  const getCards = cardCount(trades, "receiver");
  const priced = split.hasGive || split.hasGet;

  // CSS shorts flex-grow when factors sum below 1 (Flexbox §9.7); normalize raw values first.
  const total = split.give + split.get;
  const giveShare = total > 0 ? split.give / total : 0.5;

  // Never labeled as anyone's "favor": the app can't see the cash side of a deal.
  const delta = split.get - split.give;
  const deltaText =
    Math.abs(delta) < EVEN_THRESHOLD ? "≈ even" : `≈ ${fmt(Math.abs(delta))} difference`;

  const sideLabel = (cards: number, value: number, hasValue: boolean): ReactNode => {
    const noun = cards === 1 ? "card" : "cards";
    return (
      <>
        <span className="text-foreground font-medium">
          {cards} {noun}
        </span>
        {hasValue ? (
          <>
            {" worth "}
            <span className="text-foreground font-medium">≈{fmt(value)}</span>
          </>
        ) : null}
      </>
    );
  };

  return (
    <div
      className="flex flex-col gap-1"
      title={`Estimated value (${marketplaceLabel(marketplace)})`}
    >
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          You give {sideLabel(giveCards, split.give, split.hasGive)}
        </span>
        <span className="text-muted-foreground text-right">
          You get {sideLabel(getCards, split.get, split.hasGet)}
        </span>
      </div>
      {priced ? (
        <>
          <div className="bg-muted flex h-1.5 overflow-hidden rounded-full">
            <span className="bg-warning/80 min-w-1" style={{ flexGrow: giveShare }} />
            <span className="w-0.5 shrink-0" />
            <span className="bg-success/80 min-w-1" style={{ flexGrow: 1 - giveShare }} />
          </div>
          <div className="text-muted-foreground/70 flex justify-between gap-3 text-xs">
            <span>{deltaText}</span>
            <span>{marketplaceLabel(marketplace)} est.</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
