import { formatRelativeTime } from "@openrift/shared/format-date";
import { marketplaceLabel } from "@openrift/shared/marketplace";
import type { CardTradeStatus } from "@openrift/shared/types/api/card-trade";
import type { Finish, Rarity } from "@openrift/shared/types/enums";
import { ArrowDownLeftIcon, ArrowUpRightIcon, BellIcon, CheckIcon, ClockIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { FinishIcon } from "@/features/cards/components/finish-icon";
import { usePrices } from "@/features/cards/hooks/use-prices";
import { tradeStatusLabel } from "@/features/groups/lib/trade-derivation";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const EXPIRY_URGENT_MS = 24 * 60 * 60 * 1000;

function expiresWithinUrgentWindow(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - Date.now() < EXPIRY_URGENT_MS;
}

export function TradeDirectionIcon({ incoming }: { incoming: boolean }) {
  const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        incoming ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
      )}
      title={incoming ? "Comes to you" : "Goes to them"}
      aria-label={incoming ? "Comes to you" : "Goes to them"}
    >
      <Icon className="size-4" />
    </span>
  );
}

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

export type TradeBadgeState =
  | "your-move"
  | "waiting-for-them"
  | "ready-to-swap"
  | "done-your-side"
  | `status:${CardTradeStatus}`;

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

export function TradeStatusBadge({
  status,
  counterpartyName,
  awaitingViewer,
  viewerSettled,
  className,
}: {
  status: CardTradeStatus;
  counterpartyName?: string | null;
  awaitingViewer?: boolean;
  viewerSettled?: boolean;
  // Pass `min-w-0 shrink` where the row must never widen its container:
  // "Waiting for {name}" can be as long as the member's name.
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
        urgent ? "text-warning font-medium" : "text-muted-foreground",
      )}
      title="Pending requests expire 7 days after they're sent"
    >
      <ClockIcon className="size-3" />
      {label}
    </span>
  );
}
