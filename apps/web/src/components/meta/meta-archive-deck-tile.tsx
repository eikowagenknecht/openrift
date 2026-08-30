import type { MetaDeckSummary, MetaEventTier } from "@openrift/shared";

import { FannedPreview } from "@/components/deck/deck-tile";
import { MetaDeckFrame, metaFrontImage } from "@/components/meta/meta-deck-card";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { Medal } from "@/components/ui/podium";
import { formatRecord } from "@/lib/meta-format";

/**
 * One archived decklist as the archive's own tile: the fanned art with the
 * finish pinned over it, then who piloted it and where. The deck's stored name
 * is left out — the legend is what a reader is scanning for, and the name is
 * usually a restatement of it.
 */
export function MetaArchiveDeckTile({
  deck,
  tier,
}: {
  deck: MetaDeckSummary;
  /** The event's tier, which the deck payload does not denormalize. */
  tier?: MetaEventTier;
}) {
  const record = formatRecord(deck.wins, deck.losses, deck.draws);

  return (
    <MetaDeckFrame deck={deck} className="relative flex flex-col overflow-hidden">
      <div className="relative">
        <FannedPreview
          legendImage={metaFrontImage(deck.legendImageId)}
          championImage={metaFrontImage(deck.championImageId)}
        />
        <Medal rank={deck.rank} variant="onArt" className="absolute top-2 left-2 size-5.5" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {/* No slug: the whole tile is already a link, and an anchor inside an
            anchor is invalid. */}
        <MetaIdentity name={deck.legendName} layout="tile" />

        <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
          <span className="truncate">{deck.playerName}</span>
          {record !== null && <span className="tabular-nums">· {record}</span>}
          <MetaListStatusBadge listStatus={deck.listStatus} />
        </p>

        <p className="mt-auto flex min-w-0 items-center gap-1.5 pt-1 text-xs">
          {tier !== undefined && <MetaTierBadge tier={tier} />}
          <span className="text-muted-foreground truncate">{deck.event.name}</span>
        </p>
      </div>
    </MetaDeckFrame>
  );
}
