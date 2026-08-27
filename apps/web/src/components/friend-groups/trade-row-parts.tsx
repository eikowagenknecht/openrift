import type { CardTradeStatus, Finish, Rarity } from "@openrift/shared";
import { marketplaceLabel, formatRelativeTime } from "@openrift/shared";
import { ArrowDownLeftIcon, ArrowUpRightIcon, BellIcon, CheckIcon, ClockIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FinishIcon } from "@/components/cards/finish-icon";
import { Badge } from "@/components/ui/badge";
import { usePrices } from "@/hooks/use-prices";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { tradeStatusLabel } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

/** A pending trade slips into the danger zone this long before it auto-expires. */
const EXPIRY_URGENT_MS = 24 * 60 * 60 * 1000;

function expiresWithinUrgentWindow(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - Date.now() < EXPIRY_URGENT_MS;
}

/**
 * The round direction badge shared by match rows and trade rows: green arrow in
 * when the card comes to you, amber arrow out when it goes to them.
 * @returns The direction badge element.
 */
export function TradeDirectionIcon({ incoming }: { incoming: boolean }) {
  const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        incoming
          ? "bg-green-500/10 text-green-600 dark:text-green-500"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-500",
      )}
      title={incoming ? "Comes to you" : "Goes to them"}
      aria-label={incoming ? "Comes to you" : "Goes to them"}
    >
      <Icon className="size-4" />
    </span>
  );
}

/**
 * The compact card-detail line under a card name, identical on match rows and
 * trade rows: shortcode (which already encodes the set), rarity icon, finish
 * icon, then any row-specific `trailing` content (e.g. "· ×N available").
 * @returns The metadata line element.
 */
export function CardMetaLine({
  shortCode,
  rarity,
  rarityLabel,
  finish,
  finishLabel,
  trailing,
}: {
  shortCode: string;
  rarity: Rarity;
  rarityLabel: string;
  finish: Finish;
  finishLabel: string;
  trailing?: ReactNode;
}) {
  const rarityIcon = getFilterIconPath("rarities", rarity);
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      {shortCode ? <span className="font-medium">{shortCode}</span> : null}
      {rarityIcon ? (
        <img
          src={rarityIcon}
          alt={rarityLabel}
          title={rarityLabel}
          width={28}
          height={28}
          className="size-3.5"
        />
      ) : null}
      <FinishIcon finish={finish} title={finishLabel} />
      {trailing}
    </span>
  );
}

/**
 * Per-copy market price of a card at the user's favorite marketplace, for a
 * trade *suggestion*. A suggestion's quantity is only what's *wished*, which can
 * exceed what the other side actually has, so multiplying by it (as a settled
 * trade does) would overstate the deal. We show the unit price and let the
 * wished / available counts stand on their own. Renders nothing when the
 * printing has no price there. Shaped for a `CardMetaLine` trailing slot.
 * @returns The dot-separated per-copy price, or null when unpriced.
 */
export function TradePerCopyPrice({ printingId }: { printingId: string }) {
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const unitPrice = prices.get(printingId, marketplace);
  if (unitPrice === undefined) {
    return null;
  }
  return (
    <>
      <span>·</span>
      <span
        className={cn("font-medium", priceColorClass(unitPrice))}
        title={`Price per copy (${marketplaceLabel(marketplace)})`}
      >
        {compactFormatterForMarketplace(marketplace)(unitPrice)}/copy
      </span>
    </>
  );
}

/**
 * Estimated market value of a settled trade row at the user's favorite
 * marketplace: the printing's current price times the row's (agreed) quantity.
 * Renders nothing when the printing has no price there. Shaped for a
 * `CardMetaLine` trailing slot — a dot separator followed by the color-banded
 * price.
 * @returns The dot-separated price, or null when unpriced.
 */
export function TradeEstimatedPrice({
  printingId,
  quantity,
}: {
  printingId: string;
  quantity: number;
}) {
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const unitPrice = prices.get(printingId, marketplace);
  if (unitPrice === undefined) {
    return null;
  }
  const total = unitPrice * quantity;
  return (
    <>
      <span>·</span>
      <span
        className={cn("font-medium", priceColorClass(total))}
        title={`Estimated value (${marketplaceLabel(marketplace)})`}
      >
        {compactFormatterForMarketplace(marketplace)(total)}
      </span>
    </>
  );
}

/**
 * Which of {@link TradeStatusBadge}'s badges a trade gets. Named rather than
 * derived twice, so a surface that has already said the state in a heading can
 * name the one it would be repeating.
 */
export type TradeBadgeState =
  | "your-move"
  | "waiting-for-them"
  | "ready-to-swap"
  | "done-your-side"
  | `status:${CardTradeStatus}`;

/**
 * The badge a trade lands on, from the same three inputs the badge itself takes.
 * @param trade The trade's status and the two things that qualify it.
 * @returns The badge state.
 */
export function tradeBadgeState({
  status,
  awaitingViewer,
  viewerSettled,
}: {
  status: CardTradeStatus;
  awaitingViewer?: boolean;
  viewerSettled?: boolean;
}): TradeBadgeState {
  if (status === "pending") {
    return awaitingViewer === true ? "your-move" : "waiting-for-them";
  }
  if (status === "reserved") {
    return viewerSettled === true ? "done-your-side" : "ready-to-swap";
  }
  return `status:${status}`;
}

/**
 * The status badge for a live or finished trade, shared across match rows and
 * trade rows. A sent request still awaiting the other side reads "Waiting for
 * {name}" (the ball is in their court); the same status but awaiting the viewer
 * reads "Your move" (they sent it, you accept or decline). An accepted trade
 * reads "Ready to swap" (go arrange the physical hand-off), or "Done on your
 * side" once the viewer has settled their half. Terminal statuses fall back to
 * their plain label.
 * @returns The status badge element.
 */
export function TradeStatusBadge({
  status,
  counterpartyName,
  awaitingViewer,
  viewerSettled,
  className,
}: {
  status: CardTradeStatus;
  counterpartyName?: string | null;
  /** True when a pending trade is awaiting the viewer's accept/decline. */
  awaitingViewer?: boolean;
  /**
   * True when the viewer has settled their own half of a reserved swap. Splits
   * `reserved` into "go and swap" and "waiting on them to confirm".
   */
  viewerSettled?: boolean;
  /**
   * Extra badge classes. Pass `min-w-0 shrink` where the row must never widen
   * its container — "Waiting for {name}" is as long as the member's name, and
   * a badge that can't shrink pushes the whole page into horizontal scroll.
   */
  className?: string;
}) {
  const state = tradeBadgeState({ status, awaitingViewer, viewerSettled });
  if (state === "your-move") {
    return (
      <Badge variant="warning" className={cn("shrink-0", className)}>
        <BellIcon />
        Your move
      </Badge>
    );
  }
  if (state === "waiting-for-them") {
    return (
      <Badge variant="secondary" className={cn("shrink-0", className)}>
        <ClockIcon />
        <span className="truncate">Waiting for {counterpartyName ?? "them"}</span>
      </Badge>
    );
  }
  // The viewer has settled their own half, so the swap is done as far as they
  // are concerned and only the other party's confirmation is outstanding
  // (ADR-019, amendment 2026-08-10). It says "done", not "waiting", because
  // nothing about it is theirs to chase — the trade sheet files these under
  // history for the same reason. The muted variant keeps it from reading as a
  // completed trade, which needs both halves.
  if (state === "done-your-side") {
    return (
      <Badge
        variant="secondary"
        className={cn("shrink-0", className)}
        title="Your side is settled. The trade completes when they confirm theirs."
      >
        <CheckIcon />
        <span className="truncate">Done on your side</span>
      </Badge>
    );
  }
  if (state === "ready-to-swap") {
    return (
      <Badge variant="success" className={cn("shrink-0", className)}>
        <CheckIcon />
        Ready to swap
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className={cn("shrink-0", className)}>
      {tradeStatusLabel(status)}
    </Badge>
  );
}

/**
 * The countdown shown next to a pending trade's status badge. A request expires
 * 7 days after it's sent (ADR-019, `PENDING_TTL_HOURS` in the trades service);
 * this tells the viewer how long is left to act before it auto-expires, turning
 * amber in the final stretch. Renders nothing once the trade is no longer
 * pending or has no deadline.
 * @returns The countdown element, or null.
 */
export function TradeExpiry({
  status,
  expiresAt,
}: {
  status: CardTradeStatus;
  expiresAt: string | null;
}) {
  if (status !== "pending" || expiresAt === null) {
    return null;
  }
  const label = formatRelativeTime(expiresAt);
  if (label === "") {
    return null;
  }
  const urgent = expiresWithinUrgentWindow(expiresAt);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap",
        urgent ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
      )}
      title="Pending requests expire 7 days after they're sent"
    >
      <ClockIcon className="size-3" />
      {label}
    </span>
  );
}
