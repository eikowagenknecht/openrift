import type { MetaEventWinner } from "@openrift/shared";
import { formatDay, imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { CardContent } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { CountryFlag } from "@/components/ui/country-flag";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Medal } from "@/components/ui/podium";
import { formatRecord, metaEventCounts } from "@/lib/meta-format";
import type { MetaEventWithWinners } from "@/lib/meta-front-page";

/**
 * The winners' legend art as one wide banner. A card image is portrait, so the
 * crop is pulled toward the top third, which is where the character is on every
 * Riftbound legend. A tie splits the banner between the legends rather than
 * picking one of them to stand for the event.
 */
function WinnerArt({ imageIds }: { imageIds: readonly string[] }) {
  return (
    <div
      className="bg-muted/40 relative flex w-full gap-px overflow-hidden"
      style={{ aspectRatio: "21 / 10" }}
    >
      {imageIds.map((imageId) => (
        <ImgWithFallback
          key={imageId}
          src={imageUrl(imageId, "400w")}
          alt=""
          aria-hidden="true"
          loading="lazy"
          draggable={false}
          className="min-w-0 flex-1 object-cover"
          style={{ objectPosition: "50% 22%" }}
          fallback={null}
        />
      ))}
      {/* The art fades into the card rather than ending on a hard edge, so the
          winner's name reads as part of the same surface. */}
      <div className="from-card absolute inset-0 bg-linear-to-t from-0% to-transparent to-55%" />
    </div>
  );
}

/** One name at the top of an event: the medal, who it was, and on what. */
function WinnerLine({ winner }: { winner: MetaEventWinner }) {
  const record = formatRecord(winner.wins, winner.losses, winner.draws);

  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex min-w-0 items-center gap-2">
        <Medal rank={1} />
        <span className="truncate font-semibold">{winner.playerName}</span>
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
        <MetaIdentity name={winner.legend?.name} domains={winner.legend?.domains} />
        {record !== null && <span className="text-muted-foreground tabular-nums">· {record}</span>}
      </div>
    </div>
  );
}

/**
 * One archived win: who took the event, on what, and which tournament it was.
 * Every line is a published result, never a standing computed here — including
 * a tie at the top, where both names stand rather than one being chosen.
 */
export function MetaWinnerCard({ event }: { event: MetaEventWithWinners }) {
  const imageIds = event.winners
    .map((winner) => winner.legend?.imageId)
    .filter((imageId): imageId is string => imageId !== null && imageId !== undefined);

  return (
    <CardLink
      className="flex flex-col gap-0 overflow-hidden p-0"
      render={<Link to="/meta/$slug" params={{ slug: event.slug }} />}
    >
      {/* Always rendered, empty included: the banner is what keeps a row of
          winner cards the same height when one legend has no artwork. */}
      <WinnerArt imageIds={imageIds} />

      <CardContent className="flex flex-col gap-1.5 px-4 pt-2 pb-4">
        {event.winners.map((winner) => (
          <WinnerLine key={winner.playerName} winner={winner} />
        ))}

        <p className="flex min-w-0 items-center gap-2 text-xs">
          <MetaTierBadge tier={event.tier} />
          <span className="truncate font-medium">{event.name}</span>
        </p>

        <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
          <CountryFlag code={event.country} size="sm" />
          <span className="tabular-nums">
            {[
              formatDay(event.eventDate),
              ...metaEventCounts(event.playerRowCount, event.deckCount),
            ].join(" · ")}
          </span>
        </p>
      </CardContent>
    </CardLink>
  );
}
