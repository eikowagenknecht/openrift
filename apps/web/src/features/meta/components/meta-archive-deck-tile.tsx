import type { MetaDeckSummary } from "@openrift/shared/types/api/meta";
import type { Marketplace } from "@openrift/shared/types/pricing";

import { Medal } from "@/components/ui/podium";
import { FannedPreview } from "@/features/decks/components/deck-tile";
import { MetaDeckFrame, metaFrontImage } from "@/features/meta/components/meta-deck-card";
import { MetaIdentity } from "@/features/meta/components/meta-identity";
import { MetaListStatusBadge } from "@/features/meta/components/meta-list-status-badge";
import { MetaPlayerName } from "@/features/meta/components/meta-player-name";
import { MetaTierBadge } from "@/features/meta/components/meta-tier-badge";
import type { MetaDeckCost } from "@/features/meta/lib/meta-deck-collection";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/features/meta/lib/meta-format";
import { compactFormatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";

// The artwork under the plate ignores the theme, so the plate does too.
const PLATE_CLASS = "absolute rounded-full bg-black/60 text-xs font-medium text-white tabular-nums";

function PlacementPlate({ deck, fieldSize }: { deck: MetaDeckSummary; fieldSize?: number }) {
  const field =
    fieldSize === undefined ? null : <span>of {fieldSize.toLocaleString("en-US")}</span>;
  if (deck.rank <= MEDAL_RANKS) {
    return (
      <span
        className={cn(PLATE_CLASS, "bottom-2 left-2 flex items-center gap-1.5 py-0.5 pr-2 pl-0.5")}
      >
        <Medal rank={deck.rank} variant="onArt" />
        {field}
      </span>
    );
  }
  return (
    <span className={cn(PLATE_CLASS, "bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5")}>
      <span className="font-heading font-bold">{formatRank(deck.rank, deck.rankIsTier)}</span>
      {field}
    </span>
  );
}

function OwnedRow({ cost, marketplace }: { cost?: MetaDeckCost; marketplace: Marketplace }) {
  if (cost === undefined || cost.owned === undefined || cost.needed === 0) {
    return null;
  }
  const complete = cost.owned >= cost.needed;
  const percent = Math.min(100, Math.round((cost.owned / cost.needed) * 100));
  const toComplete = cost.toComplete;

  return (
    <div className="mt-auto flex flex-col gap-1 pt-1">
      <span
        aria-hidden
        className={cn(
          "block h-1 overflow-hidden rounded-full",
          complete ? "bg-border-accent/25" : "bg-muted",
        )}
      >
        <span
          className={cn("block h-full rounded-full", complete ? "bg-border-accent" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span
        className={cn(
          "flex flex-wrap justify-between gap-x-1.5 text-xs tabular-nums",
          complete ? "text-border-accent font-medium" : "text-muted-foreground",
        )}
      >
        {complete ? (
          <>
            <span>All {cost.needed} owned</span>
            <span>Buildable</span>
          </>
        ) : (
          <>
            <span>
              {cost.owned} of {cost.needed} owned
            </span>
            {toComplete !== undefined && toComplete > 0 && (
              <span>
                <span className="text-foreground font-semibold">
                  {compactFormatterForMarketplace(marketplace)(toComplete)}
                </span>{" "}
                to complete
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

function deckLabel(deck: MetaDeckSummary): string {
  return deck.legendName === null
    ? `${deck.playerName}'s decklist`
    : `${deck.playerName}'s ${deck.legendName} decklist`;
}

export function MetaArchiveDeckTile({
  deck,
  cost,
  fieldSize,
  marketplace,
  showEvent = false,
}: {
  deck: MetaDeckSummary;
  cost?: MetaDeckCost;
  fieldSize?: number;
  marketplace: Marketplace;
  showEvent?: boolean;
}) {
  const record = formatRecord(deck.wins, deck.losses, deck.draws);
  const value = cost?.value;

  return (
    <MetaDeckFrame deck={deck} label={deckLabel(deck)} className="flex flex-col overflow-hidden">
      <div className="relative">
        <FannedPreview
          legendImage={metaFrontImage(deck.legendImageId)}
          championImage={metaFrontImage(deck.championImageId)}
          soloLegend
        />
        <PlacementPlate deck={deck} fieldSize={fieldSize} />
        {value !== undefined && (
          <span className={cn(PLATE_CLASS, "top-2 right-2 px-2 py-0.5")}>
            {compactFormatterForMarketplace(marketplace)(value)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <MetaIdentity name={deck.legendName} archiveSlug={deck.legendArchiveSlug} layout="tile" />

        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
          <MetaPlayerName
            name={deck.playerName}
            playerKey={deck.playerKey}
            inStretchedTile
            className="truncate font-medium"
          />
          {record !== null && (
            <span className="text-muted-foreground text-xs tabular-nums">{record}</span>
          )}
          <MetaListStatusBadge listStatus={deck.listStatus} />
        </p>

        {showEvent && (
          <p className="mt-auto flex min-w-0 items-center gap-1.5 pt-1 text-xs">
            <MetaTierBadge tier={deck.event.tier} />
            <span className="text-muted-foreground truncate">{deck.event.name}</span>
          </p>
        )}

        <OwnedRow cost={cost} marketplace={marketplace} />
      </div>
    </MetaDeckFrame>
  );
}
