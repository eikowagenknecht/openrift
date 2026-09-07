import type { Marketplace, MetaDeckSummary } from "@openrift/shared";
import { dateLeafPartsUtc, formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { MetaPlayerName } from "@/components/meta/meta-player-name";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { Medal } from "@/components/ui/podium";
import { compactFormatterForMarketplace } from "@/lib/format";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

// Shared by the rows and the sort header above them; keep both in sync.
export const DECK_INDEX_GRID =
  "grid grid-cols-[3.5rem_2.75rem_11rem_10rem_minmax(0,1fr)_2.75rem_4rem_10.5rem] items-center gap-x-3.5";

function Finish({ deck, fieldSize }: { deck: MetaDeckSummary; fieldSize: number | null }) {
  return (
    <span className="flex flex-col items-center gap-0.5 text-center">
      {deck.rank <= MEDAL_RANKS ? (
        <Medal rank={deck.rank} />
      ) : (
        <span className="text-sm tabular-nums">{formatRank(deck.rank, deck.rankIsTier)}</span>
      )}
      {fieldSize !== null && (
        <span className="text-muted-foreground text-xs leading-none tabular-nums">
          of {fieldSize.toLocaleString("en-US")}
        </span>
      )}
    </span>
  );
}

function Art({ deck }: { deck: MetaDeckSummary }) {
  return (
    <span aria-hidden className="relative block h-10 w-11">
      <CardArtThumb
        imageId={deck.legendImageId}
        variant="120w"
        className={cn(
          "absolute top-0 left-0 w-6.5 -rotate-6 rounded-xs shadow-sm",
          deck.championImageId === null && "left-2 -rotate-3",
        )}
      />
      {deck.championImageId !== null && (
        <CardArtThumb
          imageId={deck.championImageId}
          variant="120w"
          className="absolute top-0.5 left-4 w-6.5 rotate-6 rounded-xs shadow-sm"
        />
      )}
    </span>
  );
}

function Owned({ cost, marketplace }: { cost?: MetaDeckCost; marketplace: Marketplace }) {
  if (cost === undefined || cost.owned === undefined || cost.needed === 0) {
    return null;
  }
  const complete = cost.owned >= cost.needed;
  const percent = Math.min(100, Math.round((cost.owned / cost.needed) * 100));
  return (
    <span className="flex flex-col gap-1">
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
          "flex justify-between gap-1.5 text-xs whitespace-nowrap tabular-nums",
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
              {cost.owned}/{cost.needed} owned
            </span>
            {cost.toComplete !== undefined && cost.toComplete > 0 && (
              <span>
                <span className="text-foreground font-semibold">
                  {compactFormatterForMarketplace(marketplace)(cost.toComplete)}
                </span>{" "}
                to complete
              </span>
            )}
          </>
        )}
      </span>
    </span>
  );
}

function deckLabel(deck: MetaDeckSummary): string {
  return deck.legendName === null
    ? `${deck.playerName}'s decklist`
    : `${deck.playerName}'s ${deck.legendName} decklist`;
}

export function MetaDeckIndexRow({
  deck,
  cost,
  fieldSize,
  marketplace,
}: {
  deck: MetaDeckSummary;
  cost?: MetaDeckCost;
  fieldSize: number | null;
  marketplace: Marketplace;
}) {
  const leaf = dateLeafPartsUtc(deck.event.eventDate);
  const record = formatRecord(deck.wins, deck.losses, deck.draws);
  const value = cost?.value;
  const priced = value === undefined ? null : compactFormatterForMarketplace(marketplace)(value);

  return (
    <div className="group hover:bg-muted/50 focus-within:ring-ring/50 relative px-4 py-2.5 focus-within:ring-2 focus-within:ring-inset">
      <Link
        to="/meta/decks/$token"
        params={{ token: deck.shareToken }}
        aria-label={deckLabel(deck)}
        className="outline-none after:absolute after:inset-0"
      />

      <div className={cn(DECK_INDEX_GRID, "hidden sm:grid")}>
        <Finish deck={deck} fieldSize={fieldSize} />
        <Art deck={deck} />
        <MetaIdentity
          name={deck.legendName}
          archiveSlug={deck.legendArchiveSlug}
          layout="stacked"
        />
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <MetaPlayerName
              name={deck.playerName}
              playerKey={deck.playerKey}
              inStretchedTile
              className="truncate font-medium"
            />
            <MetaListStatusBadge listStatus={deck.listStatus} />
          </span>
          {record !== null && (
            <span className="text-muted-foreground text-xs tabular-nums">{record}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium">{deck.event.name}</span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <MetaTierBadge tier={deck.event.tier} />
            <CountryFlag code={deck.event.country} size="sm" />
          </span>
        </div>
        <DateLeaf month={leaf.month} day={leaf.day} size="sm" />
        <span className="text-right text-sm tabular-nums">{priced}</span>
        <Owned cost={cost} marketplace={marketplace} />
      </div>

      <div className="flex items-start gap-2.5 sm:hidden">
        <Finish deck={deck} fieldSize={fieldSize} />
        <CardArtThumb imageId={deck.legendImageId} variant="120w" className="w-7.5 rounded-xs" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <MetaIdentity name={deck.legendName} archiveSlug={deck.legendArchiveSlug} layout="row" />
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
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
          </span>
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            <MetaTierBadge tier={deck.event.tier} />
            <CountryFlag code={deck.event.country} size="sm" showCode={false} />
            <span className="truncate">
              {deck.event.name} · {formatDay(deck.event.eventDate)}
            </span>
          </span>
        </div>
        {cost !== undefined && (
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-sm tabular-nums">{priced}</span>
            {cost.owned !== undefined && cost.needed > 0 && (
              <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                {cost.owned >= cost.needed ? (
                  <span className="text-border-accent font-medium">Buildable</span>
                ) : (
                  cost.toComplete !== undefined && (
                    <>
                      <span className="text-foreground font-semibold">
                        {compactFormatterForMarketplace(marketplace)(cost.toComplete)}
                      </span>{" "}
                      to complete
                    </>
                  )
                )}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
