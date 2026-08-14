import type { MetaDeckSummary, PrintingImage } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { FannedPreview } from "@/components/deck/deck-tile";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Badge } from "@/components/ui/badge";
import { cardLinkVariants } from "@/components/ui/card-link";
import { useDeckFormatList } from "@/hooks/use-enums";
import { formatFinishTier } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

/**
 * The archive's denormalized image ids as the fan's `PrintingImage` shape. The
 * summary carries the canonical front image directly, so the tile renders
 * server-side without a catalog lookup.
 * @returns The image, or null when the deck has no card in that zone.
 */
function frontImage(imageId: string | null): PrintingImage | null {
  return imageId === null ? null : { face: "front", imageId };
}

/**
 * The finish/player/record byline every archive surface shows in place of an
 * account owner (ADR-014), with the list-completeness marker on the end so a
 * partial or archetype-only entry says so wherever it is listed.
 * @returns The byline element.
 */
export function MetaDeckByline({
  deck,
  className,
}: {
  deck: Pick<MetaDeckSummary, "playerName" | "finishTier" | "record" | "listStatus">;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <Badge variant="secondary" className="tabular-nums">
        {formatFinishTier(deck.finishTier)}
      </Badge>
      <span className="font-medium">{deck.playerName}</span>
      {deck.record !== null && (
        <span className="text-muted-foreground tabular-nums">({deck.record})</span>
      )}
      <MetaListStatusBadge listStatus={deck.listStatus} />
    </span>
  );
}

/**
 * The wrapper a deck tile or row sits in. A deck with a permalink links to it;
 * an archetype-only entry has no page at all (ADR-014), so it renders as a
 * plain box with none of the hover, focus, or fan-scale affordances that would
 * promise a click. The body is the same either way and arrives as children
 * rather than being written twice.
 *
 * @returns The link or the plain wrapper, around `children`.
 */
export function MetaDeckFrame({
  deck,
  className,
  children,
}: {
  deck: Pick<MetaDeckSummary, "shareToken">;
  /** Layout classes shared by both wrappers; the interactive ones are added here. */
  className: string;
  children: ReactNode;
}) {
  const shared = cn("ring-foreground/10 rounded-lg ring-1", className);

  if (deck.shareToken === null) {
    return <div className={shared}>{children}</div>;
  }
  return (
    <Link
      to="/meta/decks/$token"
      params={{ token: deck.shareToken }}
      className={cn(
        cardLinkVariants(),
        "focus-visible:ring-ring/50 group outline-none focus-visible:ring-2",
        shared,
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
export function MetaDeckIdentityLine({ deck }: { deck: MetaDeckSummary }) {
  const pair = [deck.legendName, deck.championName].filter(Boolean).join(" / ");
  if (pair === "") {
    return null;
  }
  return <p className="text-muted-foreground mt-0.5 truncate text-xs">{pair}</p>;
}

/**
 * One archived deck as a tile, the deck browser's rendering. Rows on an event
 * page (`MetaDeckRow`) share its byline and identity line, so a deck reads the
 * same either way. Links to the archive's permalink (`/meta/decks/$token`),
 * never to the owner-scoped deck route.
 * @returns The deck tile element.
 */
export function MetaDeckCard({ deck }: { deck: MetaDeckSummary }) {
  const { labels: formatLabels } = useDeckFormatList();

  return (
    <MetaDeckFrame deck={deck} className="relative flex flex-col overflow-hidden">
      <FannedPreview
        legendImage={frontImage(deck.legendImageId)}
        championImage={frontImage(deck.championImageId)}
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
