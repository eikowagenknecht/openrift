import type { MetaDeckDetailResponse } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaPlayerName } from "@/components/meta/meta-player-name";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { CountryFlag } from "@/components/ui/country-flag";
import { Medal } from "@/components/ui/podium";
import type { ArchivedDeckIdentity } from "@/lib/meta-deck-archive";
import { medalRank } from "@/lib/meta-deck-archive";
import { formatRank, formatRecord } from "@/lib/meta-format";

type MetaDeckContext = MetaDeckDetailResponse["meta"];

/**
 * What the entry scored, as the hero's first block. The field size is the one
 * the source reported, left out when the source published none.
 *
 * @returns The finish block.
 */
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
          {/* Pinned grouping: a server on another default locale would send
              "1.280" into a browser rendering "1,280". */}
          of {field.toLocaleString("en-US")} players
        </span>
      )}
      {record !== null && (
        <span className="text-muted-foreground text-xs tabular-nums">{record}</span>
      )}
    </div>
  );
}

/**
 * Who played the list, what they played, and where — the archive's replacement
 * for a deck name it generated itself.
 *
 * @returns The heading block.
 */
export function MetaDeckHeading({
  meta,
  identity,
}: {
  meta: MetaDeckContext;
  /** Null for a list whose source published neither a Legend nor a champion. */
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
