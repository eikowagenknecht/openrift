import { imageUrl } from "@openrift/shared/image-url";
import type { MetaEventSummary } from "@openrift/shared/types/api/meta";
import { Link } from "@tanstack/react-router";

import { ArtBandBackdrop } from "@/components/art-band-backdrop";
import { CardFan } from "@/components/cards/card-fan";
import { MetaEventHeading, MetaFinishRow } from "@/components/meta/meta-event-row";
import { metaEventWinners } from "@/lib/meta-front-page";
import { cn } from "@/lib/utils";

/**
 * The whole block is one link, so legend names inside stay unlinked
 * (an anchor inside an anchor is invalid).
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
        className="hover:bg-muted/50 focus-visible:ring-ring/50 relative flex flex-col gap-2.5 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:-outline-offset-2"
      >
        <MetaEventHeading event={event} />

        {event.topFinishes.length > 0 && (
          <span
            className={cn(
              "relative flex flex-col gap-0.5",
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
