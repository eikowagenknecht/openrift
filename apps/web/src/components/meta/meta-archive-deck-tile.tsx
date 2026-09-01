import type { MetaDeckSummary } from "@openrift/shared";

import { FannedPreview } from "@/components/deck/deck-tile";
import { MetaDeckFrame, metaFrontImage } from "@/components/meta/meta-deck-card";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { Medal } from "@/components/ui/podium";
import type { MetaDeckOwnership } from "@/lib/meta-deck-collection";
import { formatRecord } from "@/lib/meta-format";

/**
 * How much of the list the reader holds, pinned over the art opposite the medal.
 * Counted in cards, never as a proportion: the reader wants to know how far off
 * they are, and a proportion of a list the archive holds only part of would be a
 * lie about the deck.
 *
 * The plate is fixed rather than themed, like the medal beside it, because the
 * artwork behind it does not change with the theme.
 */
function OwnedOnArt({ ownership }: { ownership?: MetaDeckOwnership }) {
  if (ownership === undefined || ownership.needed === 0) {
    return null;
  }
  return (
    <span
      className="font-heading text-2xs absolute top-2 right-2 rounded-full bg-zinc-900/85 px-1.5 py-0.5 font-bold text-zinc-100 tabular-nums shadow-md ring-1 ring-black/20"
      title={`You own ${ownership.owned} of the ${ownership.needed} cards in this list`}
    >
      {ownership.owned}/{ownership.needed}
    </span>
  );
}

/**
 * What the tile's permalink announces. The link stretches over the whole tile
 * and wraps no text of its own, so it names the entry the way the tile reads:
 * whose list it is, and what they played.
 */
function deckLabel(deck: MetaDeckSummary): string {
  return deck.legendName === null
    ? `${deck.playerName}'s decklist`
    : `${deck.playerName}'s ${deck.legendName} decklist`;
}

/**
 * One archived decklist as the archive's own tile: the fanned art with the
 * finish pinned over it, then who piloted it and where. The deck's stored name
 * is left out — the legend is what a reader is scanning for, and the name is
 * usually a restatement of it.
 */
export function MetaArchiveDeckTile({
  deck,
  ownership,
}: {
  deck: MetaDeckSummary;
  /**
   * How much of the list the signed-in reader holds. Absent for a signed-out
   * reader, and while the collection is still loading.
   */
  ownership?: MetaDeckOwnership;
}) {
  const record = formatRecord(deck.wins, deck.losses, deck.draws);

  return (
    <MetaDeckFrame deck={deck} label={deckLabel(deck)} className="flex flex-col overflow-hidden">
      <div className="relative">
        <FannedPreview
          legendImage={metaFrontImage(deck.legendImageId)}
          championImage={metaFrontImage(deck.championImageId)}
        />
        <Medal rank={deck.rank} variant="onArt" className="absolute top-2 left-2 size-5.5" />
        <OwnedOnArt ownership={ownership} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <MetaIdentity name={deck.legendName} archiveSlug={deck.legendArchiveSlug} layout="tile" />

        <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
          <span className="truncate">{deck.playerName}</span>
          {record !== null && <span className="tabular-nums">· {record}</span>}
          <MetaListStatusBadge listStatus={deck.listStatus} />
        </p>

        <p className="mt-auto flex min-w-0 items-center gap-1.5 pt-1 text-xs">
          <MetaTierBadge tier={deck.event.tier} />
          <span className="text-muted-foreground truncate">{deck.event.name}</span>
        </p>
      </div>
    </MetaDeckFrame>
  );
}
