import type { CardTradeLiveAnnotation } from "@openrift/shared";

import { CountPill } from "@/components/ui/count-pill";
import type { LiveTradeStatusDescriptor } from "@/lib/trade-status-labels";
import {
  SHARED_RESERVED_STATUS,
  liveTradeStatus,
  tradeStatusTitle,
} from "@/lib/trade-status-labels";
import { cn } from "@/lib/utils";

/**
 * `word` omits the count: an annotation's count is printing-wide, so a
 * per-copy row must not multiply it.
 */
export type TradeChipDetail = "icon" | "count" | "label" | "word";

function TradeChip({
  status,
  count,
  totalCount,
  detail,
  withDirection = true,
  title: titleOverride,
}: {
  status: LiveTradeStatusDescriptor;
  count?: number;
  totalCount?: number;
  detail: TradeChipDetail;
  withDirection?: boolean;
  title?: string;
}) {
  const Icon = status.icon;
  const showTotal = totalCount !== undefined && totalCount !== count;
  // Must sit on the pill itself: a title on a wrapper loses to the
  // innermost element's title on hover.
  const title =
    titleOverride ??
    tradeStatusTitle({
      label: status.label,
      direction: withDirection ? status.direction : undefined,
      count,
      totalCount,
    });
  return (
    <CountPill
      variant="ghost"
      title={title}
      aria-label={title}
      className={cn(status.tone === "committed" && "text-foreground font-semibold")}
    >
      <Icon className="size-3" aria-hidden />
      {(detail === "label" || detail === "word") && <span>{status.label}</span>}
      {count !== undefined && (
        <>
          <span>{count}</span>
          {showTotal && <span className="opacity-60">({totalCount})</span>}
        </>
      )}
    </CountPill>
  );
}

/**
 * `count` is the passed annotation's own copies, never a totalCount across
 * sibling printings: a printing with one reserved and two asked trades has
 * one copy committed, not three.
 */
export function TradeStatusChip({
  annotation,
  totalCount,
  detail = "count",
  title,
}: {
  annotation: CardTradeLiveAnnotation;
  totalCount?: number;
  detail?: TradeChipDetail;
  title?: string;
}) {
  const count = annotation.quantity;
  const showTotal = totalCount !== undefined && totalCount !== count;
  if (count <= 0 && !showTotal) {
    return null;
  }
  const countless = detail === "icon" || detail === "word";
  return (
    <TradeChip
      status={liveTradeStatus(annotation)}
      count={countless ? undefined : count}
      totalCount={countless ? undefined : totalCount}
      detail={detail}
      title={title}
    />
  );
}

/**
 * Takes no annotation and no free text, so no caller can leak a counterparty
 * or a live negotiation onto a page with no session behind it.
 */
export function SharedTradeStatusChip({
  count,
  detail = "label",
}: {
  count?: number;
  detail?: TradeChipDetail;
}) {
  return (
    <TradeChip
      status={liveTradeStatus(SHARED_RESERVED_STATUS)}
      count={detail === "icon" || detail === "word" ? undefined : count}
      detail={detail}
      withDirection={false}
    />
  );
}
