import type { CardTradeStatus, Finish, Rarity } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowDownLeftIcon, ArrowUpRightIcon, BellIcon, CheckIcon, ClockIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FinishIcon } from "@/components/cards/finish-icon";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { getFilterIconPath } from "@/lib/icons";
import { tradeStatusLabel } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";

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
