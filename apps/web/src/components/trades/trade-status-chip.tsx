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
 * How much of the status the chip spells out. `count` is the strip default
 * (icon plus number, wording in the tooltip) and matches the on-loan chip, so
 * the two sit together without a break. `label` adds the word for rows with
 * room for it. `icon` drops the number for copies-view tiles, where the tile is
 * a single copy and the number is always 1.
 *
 * `word` is `label` without the number, for a row that stands for exactly one
 * physical copy. The count on an annotation belongs to the printing, so on a
 * per-copy row it is the wrong number: two reserved copies of one printing
 * would each read "Reserved 2" and look like four. `icon` cannot stand in for
 * it, because the icon is the direction arrow and every phase shares its side's
 * arrow, so the word is the only thing naming the phase.
 */
export type TradeChipDetail = "icon" | "count" | "label" | "word";

/**
 * The chip body. The icon is the direction arrow, which is the only thing
 * separating a card on its way out from one on its way in — the word names the
 * phase and reads the same on both sides. Weight carries how binding the state
 * is: a committed trade takes the full foreground, a bid stays muted. Colour
 * never does, so a card with three chips on it doesn't turn into a traffic
 * light.
 * @returns The chip element.
 */
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
  // The override has to reach the pill itself. A `title` on a wrapper loses to
  // the innermost one on hover, and the pill's `aria-label` would still read
  // the computed text.
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
 * Compact strip chip marking a printing the viewer has a live trade on. Shown
 * on their own surfaces (collections grid, copies view, list rows) next to the
 * on-loan chip, whose shape and contract it shares.
 *
 * Pass one annotation, normally the winner of `collapseTradeAnnotations`. The
 * count is that annotation's own copies, never a side total: a printing with
 * one reserved trade and two asked ones has one copy committed, and a chip
 * reading "Reserved 3" would be a lie. `totalCount` is the tile's figure across
 * sibling printings (cards view), dimmed in parentheses only when the two
 * diverge.
 *
 * `title` replaces the computed tooltip for a surface that knows more than the
 * annotation does. The collections tile uses it to add how many copies are
 * still free, so an "Asked for" count never reads as committed. It exists only
 * here, never on {@link SharedTradeStatusChip}, so free text can't reach a page
 * anyone can open.
 * @returns The chip, or null when the annotation covers no copies.
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
  // `icon` and `word` both stand for a single copy, where the annotation's
  // printing-wide count is the wrong number to show.
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
 * The trade chip for a surface anyone can open (share links, public views). It
 * says one thing, "Reserved", which those surfaces already expose as "not
 * claimable".
 *
 * It takes no annotation and no text of any kind, so no caller can leak a
 * counterparty or a live negotiation onto a page with no session behind it. The
 * endpoint returns no names today; this keeps the component unable to show one
 * if that ever changes.
 *
 * The tooltip drops the direction the private chips spell out. "Outgoing" is
 * relative to the viewer, and whoever opens a share link is not a side of the
 * trade — the copies are simply not claimable.
 * @returns The chip element.
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
