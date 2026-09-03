import type { MetaEventFinish, MetaEventSummary } from "@openrift/shared";
import { dateLeafPartsUtc, imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { ArtBandBackdrop } from "@/components/art-band-backdrop";
import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Medal } from "@/components/ui/podium";
import { formatRecord, metaEventCounts } from "@/lib/meta-format";
import { metaEventWinners } from "@/lib/meta-front-page";
import { cn } from "@/lib/utils";

/**
 * One podium standings row: the medal, the legend as a mini card, who it was,
 * and on what. The rank-1 row sits on the archive's gold wash, the same claim
 * the podium's raised seat makes, at row strength.
 */
function FinishRow({ finish, showArt }: { finish: MetaEventFinish; showArt: boolean }) {
  const record = formatRecord(finish.wins, finish.losses, finish.draws);

  return (
    <span
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1",
        finish.rank === 1 && "bg-border-accent/10",
      )}
    >
      <Medal rank={finish.rank} />
      {showArt && (
        <CardArtThumb
          imageId={finish.legend?.imageId ?? null}
          domains={finish.legend?.domains}
          loading="lazy"
          className="h-12"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate", finish.rank === 1 ? "font-semibold" : "font-medium")}>
          {finish.playerName}
        </span>
        <MetaIdentity
          name={finish.legend?.name}
          domains={finish.legend?.domains}
          className="text-sm"
        />
      </span>
      {record !== null && (
        <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
          {record}
        </span>
      )}
    </span>
  );
}

/**
 * One archived event with its podium as indented rows, for the front page's
 * premier and competitive sections. `featured` (premier) turns the block into
 * the deck hero's band: the winner's legend art blurred behind the row, the
 * domain glow, and the legend card itself standing on the right — which is why
 * a premier block moves its counts under the venue instead of holding a right
 * column.
 *
 * The whole block is one link, so the legend names inside stay unlinked
 * (an anchor inside an anchor is invalid); the legend pages remain one step
 * away on the event page.
 */
export function MetaFrontEventBlock({
  event,
  featured = false,
}: {
  event: MetaEventSummary;
  featured?: boolean;
}) {
  const leaf = dateLeafPartsUtc(event.eventDate);
  const venue = [event.organizer, event.location].filter(Boolean).join(" · ");
  const counts = metaEventCounts(event);
  const bandLegend = featured
    ? (metaEventWinners(event).find((winner) => winner.legend !== null)?.legend ?? null)
    : null;
  const bandArtId = bandLegend?.imageId ?? null;
  const showsLegendArt = event.topFinishes.some((finish) => finish.legend !== null);

  return (
    <div className="relative overflow-hidden">
      {featured && (
        <ArtBandBackdrop
          thumbnail={bandArtId === null ? null : imageUrl(bandArtId, "400w")}
          domains={bandLegend?.domains ?? []}
        />
      )}
      <Link
        to="/meta/$slug"
        params={{ slug: event.slug }}
        className={cn(
          "hover:bg-muted/40 focus-visible:ring-ring/50 relative flex flex-col gap-2.5 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:-outline-offset-2",
          featured && "sm:pr-32",
        )}
      >
        <span className="flex items-center gap-3">
          <DateLeaf month={leaf.month} day={leaf.day} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{event.name}</span>
            <span className="text-muted-foreground truncate text-xs">{venue}</span>
            {featured ? (
              <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                <CountryFlag code={event.country} size="sm" />
                <span className="truncate tabular-nums">{counts.join(" · ")}</span>
              </span>
            ) : null}
          </span>
          {!featured && (
            <span className="hidden shrink-0 items-center gap-4 sm:flex">
              <span className="w-14">
                <CountryFlag code={event.country} size="sm" />
              </span>
              <span className="text-muted-foreground w-44 text-right text-xs tabular-nums">
                {counts.join(" · ")}
              </span>
            </span>
          )}
          <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        </span>

        {event.topFinishes.length > 0 && (
          <span className="flex flex-col gap-0.5 sm:pl-14">
            {event.topFinishes.map((finish, index) => (
              <FinishRow
                key={`${finish.rank}-${finish.playerName}-${index}`}
                finish={finish}
                showArt={showsLegendArt}
              />
            ))}
          </span>
        )}

        {featured && bandArtId !== null && (
          <ImgWithFallback
            src={imageUrl(bandArtId, "240w")}
            alt=""
            aria-hidden="true"
            loading="lazy"
            draggable={false}
            fallback={null}
            style={{ borderRadius: CARD_BORDER_RADIUS }}
            className="aspect-card absolute top-1/2 right-6 hidden h-24 -translate-y-1/2 rotate-6 object-cover shadow-md sm:block"
          />
        )}
      </Link>
    </div>
  );
}
