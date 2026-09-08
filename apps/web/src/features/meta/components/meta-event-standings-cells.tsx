import type { MetaEventPlayer } from "@openrift/shared/types/api/meta";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { Suspense } from "react";

import { Medal } from "@/components/ui/podium";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import {
  MetaEventDeckPreview,
  MetaEventDeckPreviewSkeleton,
} from "@/features/meta/components/meta-event-deck-preview";
import { MetaIdentity } from "@/features/meta/components/meta-identity";
import { MetaRunStrip } from "@/features/meta/components/meta-run-strip";
import { useMetaPriceFormat } from "@/features/meta/hooks/use-meta-price-format";
import type { MetaDeckCost } from "@/features/meta/lib/meta-deck-collection";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/features/meta/lib/meta-format";
import type { MetaPlayerRound } from "@/features/meta/lib/meta-player-run";
import { metaSubmitSearchForPlayer } from "@/features/meta/lib/meta-submit-link";
import { cn } from "@/lib/utils";

function Rank({ player }: { player: MetaEventPlayer }) {
  if (player.rank <= MEDAL_RANKS) {
    return <Medal rank={player.rank} />;
  }
  return (
    <span className="text-muted-foreground tabular-nums">
      {formatRank(player.rank, player.rankIsTier)}
    </span>
  );
}

export function RankCell({ player, className }: { player: MetaEventPlayer; className?: string }) {
  const record = formatRecord(player.wins, player.losses, player.draws);
  return (
    <div className={cn("flex flex-col items-center gap-0.5 leading-tight", className)}>
      <Rank player={player} />
      {record !== null && (
        <span className="text-muted-foreground text-xs tabular-nums">{record}</span>
      )}
    </div>
  );
}

function MissingLine({ cost }: { cost: MetaDeckCost }) {
  const format = useMetaPriceFormat();
  if (cost.owned === undefined || cost.needed === 0) {
    return null;
  }
  if (cost.owned >= cost.needed) {
    return <span className="text-border-accent text-xs font-medium">Buildable</span>;
  }
  if (cost.toComplete === undefined || cost.toComplete === 0) {
    return null;
  }
  return <span className="text-muted-foreground text-xs">{format(cost.toComplete)} missing</span>;
}

export function DeckValue({
  player,
  costs,
  className,
}: {
  player: MetaEventPlayer;
  costs: ReadonlyMap<string, MetaDeckCost> | undefined;
  className?: string;
}) {
  const format = useMetaPriceFormat();
  const cost = player.deckId === null ? undefined : costs?.get(player.deckId);
  if (cost === undefined) {
    return null;
  }
  return (
    <div className={cn("flex flex-col items-end gap-0.5 leading-tight tabular-nums", className)}>
      {cost.value !== undefined && <span>{format(cost.value)}</span>}
      <MissingLine cost={cost} />
    </div>
  );
}

export function LegendCell({ player }: { player: MetaEventPlayer }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <CardArtThumb
        imageId={player.legend?.imageId ?? player.champion?.imageId ?? null}
        domains={player.legend?.domains}
        loading="lazy"
        className="w-9"
      />
      <MetaIdentity
        name={player.legend?.name}
        slug={player.legend?.slug}
        archiveSlug={player.legend?.archiveSlug}
        domains={player.legend?.domains}
        layout="stacked"
      />
    </div>
  );
}

export function RunCell({
  player,
  slug,
  rounds,
  className,
}: {
  player: MetaEventPlayer;
  slug: string;
  rounds: readonly MetaPlayerRound[] | undefined;
  className?: string;
}) {
  if (rounds === undefined || rounds.length === 0) {
    return null;
  }
  if (player.playerKey === null) {
    return <MetaRunStrip rounds={rounds} className={className} />;
  }
  return (
    <Link
      to="/meta/$slug/players/$key"
      params={{ slug, key: player.playerKey }}
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5",
        className,
      )}
    >
      <MetaRunStrip rounds={rounds} />
      <ChevronRightIcon className="size-4" />
    </Link>
  );
}

export function DeckCell({
  player,
  slug,
  canSubmit,
  expanded,
  className,
}: {
  player: MetaEventPlayer;
  slug: string;
  canSubmit: boolean;
  expanded: boolean;
  className?: string;
}) {
  if (player.shareToken !== null) {
    return (
      <span
        className={cn(
          "text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap",
          className,
        )}
      >
        {player.listStatus === "partial" ? "Partial list" : "Decklist"}
        <ChevronRightIcon
          className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-90")}
        />
      </span>
    );
  }
  if (!canSubmit) {
    return null;
  }
  return (
    <Link
      to="/meta/$slug/submit"
      params={{ slug }}
      search={metaSubmitSearchForPlayer(player)}
      className={cn("text-primary font-medium whitespace-nowrap hover:underline", className)}
    >
      + Add
    </Link>
  );
}

export function DeckPreview({ token }: { token: string }) {
  return (
    <Suspense fallback={<MetaEventDeckPreviewSkeleton />}>
      <MetaEventDeckPreview token={token} />
    </Suspense>
  );
}
