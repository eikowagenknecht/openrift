import type { CardTradeResponse } from "@openrift/shared";
import { marketplaceLabel } from "@openrift/shared";
import type { ReactNode } from "react";

import { usePrices } from "@/hooks/use-prices";
import { compactFormatterForMarketplace } from "@/lib/format";
import { sumTradeValues } from "@/lib/trade-derivation";
import { useDisplayStore } from "@/stores/display-store";

/** @returns The number of physical cards the trades move in the given role. */
function cardCount(trades: readonly CardTradeResponse[], role: CardTradeResponse["role"]): number {
  return trades
    .filter((trade) => trade.role === role)
    .reduce((total, trade) => total + trade.quantity, 0);
}

/** Below this gap (in the marketplace's currency) the deal reads as even. */
const EVEN_THRESHOLD = 1;

/**
 * The header's answer to "what's the deal with this person": how many cards
 * move each way, what those cards are worth, and a proportional two-color bar —
 * amber for the cards leaving the viewer, green for the cards coming to them,
 * the same coding as the rows' direction arrows. The delta line states the
 * value difference, so nobody has to do the subtraction.
 *
 * Renders nothing while no live trade exists; a deal with no priced side keeps
 * the counts and drops the bar rather than drawing a meaningless split.
 * @returns The balance bar, or null.
 */
export function TradeBalanceBar({
  trades,
}: {
  /** The live (pending or reserved) trades with this person, both directions. */
  trades: readonly CardTradeResponse[];
}) {
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

  // Neutral by design: a value gap is usually the part money settles (one side
  // is simply buying), so the bar states the difference and never calls it
  // anyone's "favor" — the app cannot see the cash side of the deal.
  const delta = split.get - split.give;
  const deltaText =
    Math.abs(delta) < EVEN_THRESHOLD ? "≈ even" : `≈ ${fmt(Math.abs(delta))} difference`;

  // "cards worth" is load-bearing: the number is the market value of the cards
  // changing hands, and without it "you get ≈51 €" reads as cash coming to you
  // — exactly backwards when the other side is paying money for those cards.
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
          {/* Zero-value sides keep a sliver (minmax via flex-basis) so the bar
              always reads as two-sided rather than one color filling the rail. */}
          <div className="bg-muted flex h-1.5 overflow-hidden rounded-full">
            <span
              className="min-w-1 bg-amber-500/80"
              style={{ flexGrow: Math.max(split.give, 0.0001) }}
            />
            <span className="w-0.5 shrink-0" />
            <span
              className="min-w-1 bg-green-500/80"
              style={{ flexGrow: Math.max(split.get, 0.0001) }}
            />
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
