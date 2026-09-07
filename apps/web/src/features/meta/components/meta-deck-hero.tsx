import { formatDay } from "@openrift/shared/format-date";
import type { MetaDeckDetailResponse } from "@openrift/shared/types/api/meta";
import { Link } from "@tanstack/react-router";

import { CountryFlag } from "@/components/ui/country-flag";
import { Medal } from "@/components/ui/podium";
import { MetaIdentity } from "@/features/meta/components/meta-identity";
import { MetaPlayerName } from "@/features/meta/components/meta-player-name";
import { MetaTierBadge } from "@/features/meta/components/meta-tier-badge";
import type { ArchivedDeckIdentity } from "@/features/meta/lib/meta-deck-archive";
import { medalRank } from "@/features/meta/lib/meta-deck-archive";
import { formatRank, formatRecord } from "@/features/meta/lib/meta-format";

type MetaDeckContext = MetaDeckDetailResponse["meta"];

export function MetaDeckFinish({ meta }: { meta: MetaDeckContext }) {
  const medal = medalRank(meta.rank, meta.rankIsTier);
  const record = formatRecord(meta.wins, meta.losses, meta.draws);
  const field = meta.event.playerCount;
  return (
    <div className="border-border flex shrink-0 flex-col items-start gap-1 self-center border-r pr-4 sm:pr-5">
      <span className="text-border-accent text-2xs font-semibold tracking-wide uppercase">
        Finish
      </span>
      <span className="flex items-center gap-1.5">
        {medal !== null && <Medal rank={medal} />}
        <span className="font-heading text-2xl leading-none font-bold tabular-nums">
          {formatRank(meta.rank, meta.rankIsTier)}
        </span>
      </span>
      {field !== null && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {/* en-US pinned: a server on another locale would send "1.280" to a "1,280" browser. */}
          of {field.toLocaleString("en-US")} players
        </span>
      )}
      {record !== null && (
        <span className="text-muted-foreground text-xs tabular-nums">{record}</span>
      )}
    </div>
  );
}

export function MetaDeckHeading({
  meta,
  identity,
}: {
  meta: MetaDeckContext;
  identity: ArchivedDeckIdentity | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-heading truncate text-2xl font-bold">
        <MetaPlayerName name={meta.playerName} playerKey={meta.playerKey} />
      </p>
      {identity !== null && (
        <MetaIdentity
          name={identity.name}
          slug={identity.slug}
          domains={identity.domains}
          className="font-heading text-lg"
        />
      )}
      <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <CountryFlag code={meta.event.country} showCode={false} size="sm" />
        <Link
          to="/meta/$slug"
          params={{ slug: meta.event.slug }}
          className="truncate hover:underline"
        >
          {meta.event.name}
        </Link>
        <span aria-hidden>·</span>
        <span>{formatDay(meta.event.eventDate)}</span>
        <MetaTierBadge tier={meta.event.tier} />
      </p>
    </div>
  );
}
