import type { MetaEventSummary } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { ArtBandBackdrop } from "@/components/art-band-backdrop";
import { CardFan } from "@/components/cards/card-fan";
import { MetaEventHeading, MetaFinishRow } from "@/components/meta/meta-event-row";
import { metaEventWinners } from "@/lib/meta-front-page";
import { cn } from "@/lib/utils";

/**
 * One archived event with its podium as indented rows, for the front page's
 * premier and competitive sections: the store-and-casual row's anatomy plus the
 * deck hero's band, with the winner's legend art blurred behind it, the domain
 * glow, and the podium's legends as a `CardFan` beside the standings.
 *
 * The fan sits over the podium rows only, so the heading stays full width and
 * an event with no legend art closes up its reservation entirely.
 *
 * The whole block is one link, so the legend names inside stay unlinked
 * (an anchor inside an anchor is invalid); the legend pages remain one step
 * away on the event page.
 */
export function MetaFrontEventBlock({ event }: { event: MetaEventSummary }) {
  const bandLegend =
    metaEventWinners(event).find((winner) => winner.legend !== null)?.legend ?? null;
  const bandArtId = bandLegend?.imageId ?? null;
  const fanCovers = event.topFinishes.flatMap((finish, index) => {
    const imageId = finish.legend?.imageId ?? null;
    return imageId === null
      ? []
      : [{ key: `${finish.rank}-${finish.playerName}-${index}`, imageId }];
  });
  const showsLegendArt = event.topFinishes.some((finish) => finish.legend !== null);

  return (
    <div className="relative overflow-hidden">
      <ArtBandBackdrop
        thumbnail={bandArtId === null ? null : imageUrl(bandArtId, "400w")}
        domains={bandLegend?.domains ?? []}
      />
      <Link
        to="/meta/$slug"
        params={{ slug: event.slug }}
        className="hover:bg-muted/40 focus-visible:ring-ring/50 relative flex flex-col gap-2.5 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:-outline-offset-2"
      >
        <MetaEventHeading event={event} />

        {event.topFinishes.length > 0 && (
          <span
            className={cn(
              "relative flex flex-col gap-0.5",
              // The reservation is the fan's alone; without one the rows close up.
              fanCovers.length > 0 && "sm:min-h-26 sm:pr-40",
              "sm:pl-12",
            )}
          >
            {event.topFinishes.map((finish, index) => (
              <MetaFinishRow
                key={`${finish.rank}-${finish.playerName}-${index}`}
                finish={finish}
                showArt={showsLegendArt}
              />
            ))}
            {fanCovers.length > 0 && (
              <span aria-hidden="true" className="absolute top-0 right-2 hidden h-26 w-29 sm:block">
                <CardFan covers={fanCovers} size="xs" anchor="center" />
              </span>
            )}
          </span>
        )}
      </Link>
    </div>
  );
}
