import type { MetaEventPlayer } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Heading } from "@/components/heading";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Medal } from "@/components/ui/podium";
import { useUserId } from "@/lib/auth-session";
import { formatRank, formatRecord, MEDAL_RANKS } from "@/lib/meta-format";
import { metaSubmitSearchForPlayer } from "@/lib/meta-submit-link";

function DecklistRow({
  player,
  token,
  slug,
  canSubmit,
}: {
  player: MetaEventPlayer;
  token: string;
  slug: string;
  canSubmit: boolean;
}) {
  const record = formatRecord(player.wins, player.losses, player.draws);
  const byline = [formatRank(player.rank, player.rankIsTier), player.playerName, record]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <div className="bg-card ring-foreground/10 relative flex items-center gap-3 rounded-lg px-3 py-2 ring-1">
      <span className="relative shrink-0">
        <CardArtThumb
          imageId={player.legend?.imageId ?? player.champion?.imageId ?? null}
          loading="lazy"
          domains={player.legend?.domains}
          className="w-11"
        />
        {player.rank <= MEDAL_RANKS && (
          <Medal rank={player.rank} variant="onArt" className="absolute -top-1 -left-1" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {/* The ::after is what makes the whole row clickable. It resolves
            against the row root, the only positioned ancestor. The focus ring
            rides this link rather than the row, so the "Complete" link beside
            it does not light the whole row up when it is focused. */}
        <Link
          to="/meta/decks/$token"
          params={{ token }}
          className="focus-visible:ring-ring/50 rounded-lg outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2"
        >
          <MetaIdentity name={player.legend?.name} domains={player.legend?.domains} />
        </Link>
        <p className="text-muted-foreground truncate text-xs">{byline}</p>
      </div>

      <MetaListStatusBadge listStatus={player.listStatus} />

      {player.listStatus === "partial" &&
        canSubmit && (
          // Above the row's click overlay, or the link swallows it. Desktop only:
          // on a phone the deck page's own incomplete alert carries this instead.
          <Link
            to="/meta/$slug/submit"
            params={{ slug }}
            search={metaSubmitSearchForPlayer(player)}
            className="text-primary relative z-10 hidden shrink-0 text-sm font-medium hover:underline sm:inline"
          >
            Complete
          </Link>
        )}

      <ChevronRightIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
    </div>
  );
}

/**
 * The entries whose decklist the archive holds, best finish first.
 *
 * The same rows as the standings below, filtered to the ones with a page behind
 * them: an event of 588 players whose lists are known for 32 would otherwise
 * bury those 32 in the table.
 *
 * `fieldSize` is what the source reported the field as, which can exceed the
 * rows the archive holds — the caption counts the lists against the tournament,
 * not against the slice of it that was fetched.
 */
export function MetaEventDecklists({
  players,
  fieldSize,
  slug,
}: {
  players: readonly MetaEventPlayer[];
  fieldSize: number | null;
  slug: string;
}) {
  // Same gate as the standings' "+ Add": the form is behind a login, so a
  // signed-out reader is not offered a link that bounces them.
  const canSubmit = useUserId() !== null;
  const withLists = players.flatMap((player) =>
    player.shareToken === null ? [] : [{ player, token: player.shareToken }],
  );
  const entries = fieldSize ?? players.length;

  return (
    <section className="mt-8">
      <Heading className="mb-3">
        Decklists{" "}
        {withLists.length > 0 && (
          <span className="text-muted-foreground text-sm font-normal">
            {withLists.length} of {entries} {entries === 1 ? "entry" : "entries"}
          </span>
        )}
      </Heading>
      {withLists.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyDescription>
              We haven&rsquo;t archived any decks from this event yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {withLists.map((entry) => (
            <li key={entry.player.id}>
              <DecklistRow
                player={entry.player}
                token={entry.token}
                slug={slug}
                canSubmit={canSubmit}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
