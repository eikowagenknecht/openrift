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

  // The bar's segments are sized by flex-grow, which CSS reads as shares of the
  // free space — and when the grow factors sum to less than 1 it hands out only
  // that fraction of it (CSS Flexbox §9.7). Feeding the raw money in therefore
  // broke every cheap deal: a 0.32 € trade filled a third of the rail and left
  // the rest bare track. Normalising to fractions of the total pins the sum at
  // 1 at any price, and the segments' min-width still keeps a zero side visible.
  const total = split.give + split.get;
  const giveShare = total > 0 ? split.give / total : 0.5;

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
          {/* Zero-value sides keep a sliver (min-width) so the bar always reads
              as two-sided rather than one color filling the rail. */}
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
