import type {
  MetaDeckSummary,
  MetaEventPlayer,
  MetaListStatus,
  PrintingImage,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { FannedPreview } from "@/components/deck/deck-tile";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Badge } from "@/components/ui/badge";
import { cardLinkVariants } from "@/components/ui/card-link";
import { useDeckFormatList } from "@/hooks/use-enums";
import { formatRank, formatRecord } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

/**
 * One archived deck as any archive surface renders it. The deck browser hands
 * over a {@link MetaDeckSummary}, which already has this shape; an event page
 * builds one from the standings row a deck hangs off, through
 * {@link metaDeckViewFromPlayer}.
 */
export interface MetaDeckView {
  shareToken: string;
  name: string;
  format: string;
  legendName: string | null;
  legendImageId: string | null;
  championName: string | null;
  championImageId: string | null;
  playerName: string;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  listStatus: MetaListStatus;
}

/**
 * The deck a standings row carries, in the shape the shared tiles render.
 * @returns The view, or null for a standings-only entry, which has no deck.
 */
export function metaDeckViewFromPlayer(
  player: MetaEventPlayer,
  format: string,
): MetaDeckView | null {
  if (player.shareToken === null || player.deckName === null) {
    return null;
  }
  return {
    shareToken: player.shareToken,
    name: player.deckName,
    format,
    legendName: player.legend?.name ?? null,
    legendImageId: player.legend?.imageId ?? null,
    championName: player.champion?.name ?? null,
    championImageId: player.champion?.imageId ?? null,
    playerName: player.playerName,
    rank: player.rank,
    rankIsTier: player.rankIsTier,
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    listStatus: player.listStatus,
  };
}

/**
 * The archive's denormalized image ids as the fan's `PrintingImage` shape. The
 * summary carries the canonical front image directly, so the tile renders
 * server-side without a catalog lookup.
 * @returns The image, or null when the deck has no card in that zone.
 */
export function metaFrontImage(imageId: string | null): PrintingImage | null {
  return imageId === null ? null : { face: "front", imageId };
}

/**
 * The finish/player/record byline every archive surface shows in place of an
 * account owner (ADR-014), with the list-completeness marker on the end so a
 * partial entry says so wherever it is listed.
 * @returns The byline element.
 */
export function MetaDeckByline({
  deck,
  className,
}: {
  deck: Pick<
    MetaDeckView,
    "playerName" | "rank" | "rankIsTier" | "wins" | "losses" | "draws" | "listStatus"
  >;
  className?: string;
}) {
  const record = formatRecord(deck.wins, deck.losses, deck.draws);

  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <Badge variant="secondary" className="tabular-nums">
        {formatRank(deck.rank, deck.rankIsTier)}
      </Badge>
      <span className="font-medium">{deck.playerName}</span>
      {record !== null && <span className="text-muted-foreground tabular-nums">({record})</span>}
      <MetaListStatusBadge listStatus={deck.listStatus} />
    </span>
  );
}

/**
 * The wrapper a deck tile or row sits in: the archive's permalink
 * (`/meta/decks/$token`), never the owner-scoped deck route. The body is the
 * same for a tile and a row and arrives as children rather than being written
 * twice.
 *
 * @returns The link, around `children`.
 */
export function MetaDeckFrame({
  deck,
  className,
  children,
}: {
  deck: Pick<MetaDeckView, "shareToken">;
  /** Layout classes shared by both wrappers; the interactive ones are added here. */
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      to="/meta/decks/$token"
      params={{ token: deck.shareToken }}
      className={cn(
        cardLinkVariants(),
        "focus-visible:ring-ring/50 ring-foreground/10 group rounded-lg ring-1 outline-none focus-visible:ring-2",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The legend / champion pairing as the archive knows it: denormalized names, no
 * catalog. `DeckIdentityLine` needs full `Card` shapes to fold the shared
 * character name out of the pair, so the archive renders the two names plainly
 * instead.
 * @returns The identity line, or null when neither zone is filled.
 */
export function MetaDeckIdentityLine({ deck }: { deck: MetaDeckView }) {
  const pair = [deck.legendName, deck.championName].filter(Boolean).join(" / ");
  if (pair === "") {
    return null;
  }
  return <p className="text-muted-foreground mt-0.5 truncate text-xs">{pair}</p>;
}

/**
 * One archived deck as a tile, the deck browser's rendering. Rows on an event
 * page (`MetaDeckRow`) share its byline and identity line, so a deck reads the
 * same either way.
 * @returns The deck tile element.
 */
export function MetaDeckCard({ deck }: { deck: MetaDeckSummary }) {
  const { labels: formatLabels } = useDeckFormatList();

  return (
    <MetaDeckFrame deck={deck} className="relative flex flex-col overflow-hidden">
      <FannedPreview
        legendImage={metaFrontImage(deck.legendImageId)}
        championImage={metaFrontImage(deck.championImageId)}
      />

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate leading-tight font-semibold">{deck.name}</h3>
          <MetaDeckIdentityLine deck={deck} />
        </div>

        <MetaDeckByline deck={deck} className="text-sm" />

        <div className="text-muted-foreground mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
          <span className="truncate">{deck.event.name}</span>
          <Badge variant="outline" className="shrink-0">
            {formatLabels[deck.event.format] ?? deck.event.format}
          </Badge>
        </div>
      </div>
    </MetaDeckFrame>
  );
}
