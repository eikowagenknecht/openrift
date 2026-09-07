import { imageUrl } from "@openrift/shared/image-url";
import type { MetaEventPlayer } from "@openrift/shared/types/api/meta";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaPlayerName } from "@/components/meta/meta-player-name";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Medal } from "@/components/ui/podium";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/lib/meta-format";
import type { MetaLegendBestFinish } from "@/lib/meta-player-run";
import { metaBestFinishPerLegend } from "@/lib/meta-player-run";

const TILES_SHOWN = 8;

function LegendFinishTile({ entry }: { entry: MetaLegendBestFinish }) {
  const { legend, player } = entry;
  const record = formatRecord(player.wins, player.losses, player.draws);

  return (
    <Card size="sm" className="flex-row items-center gap-3 px-3">
      {legend.imageId !== null && (
        // Wrapped: an <img> as the card's own first child takes the primitive's
        // full-bleed treatment, which is for a cover image, not a portrait.
        <span className="shrink-0">
          <ImgWithFallback
            src={imageUrl(legend.imageId, "240w")}
            alt=""
            aria-hidden="true"
            loading="lazy"
            draggable={false}
            fallback={null}
            className="aspect-card w-11 rounded-md object-cover"
          />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <MetaIdentity
          name={legend.name}
          slug={legend.slug}
          archiveSlug={legend.archiveSlug}
          domains={legend.domains}
          layout="stacked"
          className="text-sm"
        />
        <p className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap tabular-nums">
          {player.rank <= MEDAL_RANKS ? (
            <Medal rank={player.rank} />
          ) : (
            <span className="text-muted-foreground">
              {formatRank(player.rank, player.rankIsTier)}
            </span>
          )}
          <MetaPlayerName
            name={player.playerName}
            playerKey={player.playerKey}
            className="min-w-0 truncate font-medium"
          />
          {record !== null && <span className="text-muted-foreground shrink-0">{record}</span>}
        </p>
      </div>
    </Card>
  );
}

export function MetaEventLegendFinishes({ players }: { players: readonly MetaEventPlayer[] }) {
  const [expanded, setExpanded] = useState(false);
  const entries = metaBestFinishPerLegend(players);

  if (entries.length === 0) {
    return null;
  }

  const shown = expanded ? entries : entries.slice(0, TILES_SHOWN);

  return (
    <section className="mt-8">
      <Heading className="mb-3">Best finish per legend</Heading>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((entry) => (
          <li key={entry.legend.cardId}>
            <LegendFinishTile entry={entry} />
          </li>
        ))}
      </ul>
      {entries.length > TILES_SHOWN && (
        <Button variant="link" className="mt-1 px-0" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show all ${entries.length.toLocaleString("en-US")} legends`}
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button>
      )}
    </section>
  );
}
