import type {
  CardTradeLiveAnnotation,
  CardTradeResponse,
} from "@openrift/shared/types/api/card-trade";
import { Link } from "@tanstack/react-router";

import { COUNT_PILL_INTERACTIVE, CountPill, countPillVariants } from "@/components/ui/count-pill";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { groupTradesByCounterparty } from "@/features/groups/lib/trade-derivation";
import type { LiveTradeStatusDescriptor } from "@/features/groups/lib/trade-status-labels";
import {
  SHARED_RESERVED_STATUS,
  liveTradeStatus,
  tradeStatusTitle,
} from "@/features/groups/lib/trade-status-labels";
import { cn } from "@/lib/utils";

/**
 * `word` omits the count: an annotation's count is printing-wide, so a
 * per-copy row must not multiply it.
 */
export type TradeChipDetail = "icon" | "count" | "label" | "word";

interface TradeChipPerson {
  userId: string;
  name: string;
  image: string | null;
  gravatarHash: string;
  quantity: number;
}

/** A counterparty who deleted their account has no id left to link to. */
function tradeChipPeople(trades: readonly CardTradeResponse[]): TradeChipPerson[] {
  return groupTradesByCounterparty(trades).flatMap((group) => {
    const { userId } = group.counterparty;
    if (userId === null) {
      return [];
    }
    return [
      {
        userId,
        name: group.counterparty.name ?? "Member",
        image: group.counterparty.image,
        gravatarHash: group.counterparty.gravatarHash,
        quantity: group.trades.reduce((sum, trade) => sum + trade.quantity, 0),
      },
    ];
  });
}

const COMMITTED_CLASS = "text-foreground font-semibold";

/** The pill classes on a link or a popover trigger, which can't be a CountPill. */
function interactiveChipClassName(status: LiveTradeStatusDescriptor): string {
  return cn(
    countPillVariants({ variant: "ghost" }),
    COUNT_PILL_INTERACTIVE,
    status.tone === "committed" && COMMITTED_CLASS,
  );
}

function TradeChipFace({
  status,
  count,
  totalCount,
  detail,
}: {
  status: LiveTradeStatusDescriptor;
  count?: number;
  totalCount?: number;
  detail: TradeChipDetail;
}) {
  const Icon = status.icon;
  const showTotal = totalCount !== undefined && totalCount !== count;
  return (
    <>
      <Icon className="size-3" aria-hidden />
      {(detail === "label" || detail === "word") && <span>{status.label}</span>}
      {count !== undefined && (
        <>
          <span>{count}</span>
          {showTotal && <span className="opacity-60">({totalCount})</span>}
        </>
      )}
    </>
  );
}

function TradeChip({
  status,
  count,
  totalCount,
  detail,
  withDirection = true,
  title: titleOverride,
  trades,
}: {
  status: LiveTradeStatusDescriptor;
  count?: number;
  totalCount?: number;
  detail: TradeChipDetail;
  withDirection?: boolean;
  title?: string;
  trades?: readonly CardTradeResponse[];
}) {
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
  const face = (
    <TradeChipFace status={status} count={count} totalCount={totalCount} detail={detail} />
  );
  const people = trades ? tradeChipPeople(trades) : [];
  const [only] = people;

  if (people.length === 1 && only) {
    const withName = `${title} · with ${only.name}`;
    return (
      <Link
        to="/trades/$userId"
        params={{ userId: only.userId }}
        search={{ from: undefined }}
        onClick={(event) => event.stopPropagation()}
        className={interactiveChipClassName(status)}
        title={withName}
        aria-label={withName}
      >
        {face}
      </Link>
    );
  }

  if (people.length > 1) {
    return (
      <Popover>
        <PopoverTrigger
          onClick={(event) => event.stopPropagation()}
          className={interactiveChipClassName(status)}
          title={title}
          aria-label={title}
        >
          {face}
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-56 p-0">
          <div className="px-3 pt-2.5 pb-1">
            <SectionHeading as="h3">{status.label} with</SectionHeading>
          </div>
          <ul className="px-1 pb-1">
            {people.map((person) => (
              <li key={person.userId}>
                <Link
                  to="/trades/$userId"
                  params={{ userId: person.userId }}
                  search={{ from: undefined }}
                  onClick={(event) => event.stopPropagation()}
                  className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  <UserAvatar
                    image={person.image}
                    name={person.name}
                    gravatarHash={person.gravatarHash}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    &times;{person.quantity}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <CountPill
      variant="ghost"
      title={title}
      aria-label={title}
      className={cn(status.tone === "committed" && COMMITTED_CLASS)}
    >
      {face}
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
  trades,
}: {
  annotation: CardTradeLiveAnnotation;
  totalCount?: number;
  detail?: TradeChipDetail;
  title?: string;
  trades?: readonly CardTradeResponse[];
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
      trades={trades}
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
