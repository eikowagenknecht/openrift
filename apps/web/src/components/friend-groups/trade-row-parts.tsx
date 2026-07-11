import type { CardTradeStatus, Finish, Marketplace, Rarity } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowDownLeftIcon, ArrowUpRightIcon, BellIcon, CheckIcon, ClockIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FinishIcon } from "@/components/cards/finish-icon";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { usePrices } from "@/hooks/use-prices";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { formatTimeRemaining } from "@/lib/format-relative-time";
import { getFilterIconPath } from "@/lib/icons";
import { marketplaceLabel } from "@/lib/marketplace-meta";
import type { TradeValueSplit } from "@/lib/trade-derivation";
import { tradeStatusLabel } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

/** A pending trade slips into the danger zone this long before it auto-expires. */
const EXPIRY_URGENT_MS = 24 * 60 * 60 * 1000;

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
 * The per-person estimated value shown on a counterparty group header, split by
 * direction: "You get cards worth ≈X · give cards worth ≈Y" when cards flow both
 * ways, or a single side when they don't. "cards worth" is load-bearing: the
 * number is the market value of the cards changing hands, and without it "You'd
 * get ≈X" reads as cash coming to you (exactly backwards when the viewer is
 * buying those cards). `conditional` switches to the "You'd get/give" wording
 * used for suggestions (a value you'd realise *if* you traded), versus the plain
 * "You get/give" of trades already agreed. Renders nothing when neither side has
 * a priced item. The "≈" flags it as an estimate over what's priced.
 * @returns The value-summary element, or null when nothing is priced.
 */
export function TradeValueSummary({
  split,
  marketplace,
  conditional = false,
  className,
}: {
  split: TradeValueSplit;
  marketplace: Marketplace;
  /** Use "You'd get/give" (suggestions) instead of "You get/give" (agreed). */
  conditional?: boolean;
  className?: string;
}) {
  if (!split.hasGet && !split.hasGive) {
    return null;
  }
  const fmt = compactFormatterForMarketplace(marketplace);
  const getVerb = conditional ? "You'd get" : "You get";
  const giveVerb = conditional ? "You'd give" : "You give";
  let text: string;
  if (split.hasGet && split.hasGive) {
    text = `${getVerb} cards worth ≈${fmt(split.get)} · give cards worth ≈${fmt(split.give)}`;
  } else if (split.hasGet) {
    text = `${getVerb} cards worth ≈${fmt(split.get)}`;
  } else {
    text = `${giveVerb} cards worth ≈${fmt(split.give)}`;
  }
  return (
    <span
      className={cn("text-muted-foreground shrink-0 text-xs whitespace-nowrap", className)}
      title={`Estimated value (${marketplaceLabel(marketplace)})`}
    >
      {text}
    </span>
  );
}

/**
 * The status badge for a live or finished trade, shared across match rows and
 * trade rows. A sent request still awaiting the other side reads "Waiting for
 * {name}" (the ball is in their court); the same status but awaiting the viewer
 * reads "Your move" (they sent it, you accept or decline). An accepted trade
 * reads "Ready to swap" (go arrange the physical hand-off). Terminal statuses
 * fall back to their plain label.
 * @returns The status badge element.
 */
export function TradeStatusBadge({
  status,
  counterpartyName,
  awaitingViewer,
}: {
  status: CardTradeStatus;
  counterpartyName?: string | null;
  /** True when a pending trade is awaiting the viewer's accept/decline. */
  awaitingViewer?: boolean;
}) {
  if (status === "pending") {
    if (awaitingViewer) {
      return (
        <Badge variant="warning" className="shrink-0">
          <BellIcon />
          Your move
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="shrink-0">
        <ClockIcon />
        Waiting for {counterpartyName ?? "them"}
      </Badge>
    );
  }
  if (status === "reserved") {
    return (
      <Badge variant="success" className="shrink-0">
        <CheckIcon />
        Ready to swap
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0">
      {tradeStatusLabel(status)}
    </Badge>
  );
}

/**
 * The countdown shown next to a pending trade's status badge. A request expires
 * 24h after it's sent (ADR-019); this tells the viewer how long is left to act
 * before it auto-expires, turning amber in the final stretch. Renders nothing
 * once the trade is no longer pending or has no deadline.
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
  const label = formatTimeRemaining(expiresAt);
  if (label === "") {
    return null;
  }
  const urgent = new Date(expiresAt).getTime() - Date.now() < EXPIRY_URGENT_MS;
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

/**
 * The counterparty chip on the right of a row: avatar + name, linking to the
 * member's page. Shared so match rows and trade rows present the member the
 * same way. The name is hidden (`hideName`) only when an adjacent status badge
 * already names the member, so the name isn't shown twice.
 * @returns The counterparty chip element.
 */
export function CounterpartyChip({
  groupSlug,
  userId,
  name,
  image,
  gravatarHash,
  hideName,
}: {
  groupSlug: string;
  userId: string;
  /** Drives the avatar's initials fallback and the label — the member's real name. */
  name: string | null;
  image: string | null;
  gravatarHash: string;
  /** Hide the name label (avatar only) when a neighbouring badge already names the member. */
  hideName?: boolean;
}) {
  return (
    <Link
      to="/groups/$slug/members/$userId"
      params={{ slug: groupSlug, userId }}
      className="hover:bg-muted/60 flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1"
      title={name ?? "Member"}
    >
      <UserAvatar image={image} name={name} gravatarHash={gravatarHash} size="sm" />
      {hideName ? null : <span className="text-sm">{name ?? "Member"}</span>}
    </Link>
  );
}
