import type { MetaEventDetail, MetaEventPhase, MetaEventPlayer } from "@openrift/shared";
import { dateLeafPartsUtc, imageUrl } from "@openrift/shared";
import { ExternalLinkIcon } from "lucide-react";
import { Fragment } from "react";

import { ArtBandBackdrop } from "@/components/art-band-backdrop";
import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { MetaContributors } from "@/components/meta/meta-contributors";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { useDeckFormatList } from "@/hooks/use-enums";
import { describeEventStructure } from "@/lib/meta-event-structure";
import { formatRecord } from "@/lib/meta-format";
import { metaEventWinners } from "@/lib/meta-front-page";

/** Every citation is printed, never collapsed behind a "+2 more": this is attribution. */
function EventSources({ sources }: { sources: MetaEventDetail["sources"] }) {
  return (
    <p className="text-muted-foreground text-xs">
      {sources.length === 1 ? "Source" : "Sources"}:{" "}
      {sources.map((source, index) => (
        <Fragment key={source.id}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          {source.sourceUrl === null ? (
            <span>{source.label}</span>
          ) : (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
            >
              {source.label}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          )}
        </Fragment>
      ))}
    </p>
  );
}

function Counter({ value, label }: { value: string; label: string }) {
  return (
    <p className="flex flex-col gap-0.5">
      <span className="font-heading text-2xl leading-none font-bold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </p>
  );
}

/** Pinned grouping: a server on another default locale would send "1.247" into a browser rendering "1,247". */
function counterValue(value: number): string {
  return value.toLocaleString("en-US");
}

function ChampionPlate({ player, artId }: { player: MetaEventPlayer; artId: string | null }) {
  const record = formatRecord(player.wins, player.losses, player.draws);

  return (
    <div className="flex w-full shrink-0 items-center gap-4 sm:w-auto">
      <div className="bg-background/60 ring-foreground/10 flex w-full flex-col gap-2 rounded-lg p-4 ring-1 sm:w-64">
        <span className="text-border-accent text-2xs font-semibold tracking-wider uppercase">
          Champion
        </span>
        <p className="font-heading font-semibold">{player.playerName}</p>
        <MetaIdentity
          name={player.legend?.name}
          slug={player.legend?.slug}
          archiveSlug={player.legend?.archiveSlug}
          domains={player.legend?.domains}
          layout="stacked"
          className="text-sm"
        />
        {player.champion !== null && (
          <p className="text-muted-foreground text-xs">{player.champion.name}</p>
        )}
        {record !== null && (
          <p className="font-heading text-border-accent text-2xl leading-none font-bold tabular-nums">
            {record}
          </p>
        )}
      </div>
      {artId !== null && (
        <ImgWithFallback
          src={imageUrl(artId, "240w")}
          alt=""
          aria-hidden="true"
          loading="lazy"
          draggable={false}
          fallback={null}
          style={{ borderRadius: CARD_BORDER_RADIUS }}
          className="aspect-card hidden h-32 shrink-0 rotate-6 object-cover shadow-md sm:block"
        />
      )}
    </div>
  );
}

/**
 * The flag and the venue are independently optional: the country comes from an
 * address heuristic that gives up on formats it does not know. The tier badge
 * rides beside the title in the top bar, not here.
 */
export function MetaEventHeader({
  event,
  players,
  phases,
}: {
  event: MetaEventDetail;
  players: readonly MetaEventPlayer[];
  phases: readonly MetaEventPhase[];
}) {
  const { labels: formatLabels } = useDeckFormatList();
  const leaf = dateLeafPartsUtc(event.eventDate);
  const structure = describeEventStructure(phases);
  const champion = players.find((player) => player.rank === 1) ?? null;
  const winnerLegend =
    champion?.legend ?? metaEventWinners(event).find((winner) => winner.legend !== null)?.legend;
  const artId = winnerLegend?.imageId ?? null;

  const byline: string[] = [];
  if (event.organizer !== null) {
    byline.push(`Organized by ${event.organizer}`);
  }
  byline.push(formatLabels[event.format]);
  if (structure.sentence !== null) {
    byline.push(structure.sentence);
  }

  return (
    <section className="bg-card ring-foreground/10 relative overflow-hidden rounded-xl ring-1">
      {artId !== null && (
        <ArtBandBackdrop
          thumbnail={imageUrl(artId, "400w")}
          domains={winnerLegend?.domains ?? []}
        />
      )}

      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex items-center gap-3">
            <DateLeaf month={leaf.month} day={leaf.day} year={leaf.year} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="font-heading text-2xl font-bold">{event.name}</h1>
                <MetaTierBadge tier={event.tier} />
              </div>
              {(event.country !== null || event.location !== null) && (
                <p className="font-medium">
                  <CountryFlag
                    code={event.country}
                    size="sm"
                    showCode={event.location === null}
                    className="mr-1.5 align-middle"
                  />
                  {event.location}
                </p>
              )}
              <p className="text-muted-foreground text-sm">{byline.join(" · ")}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-9 gap-y-3">
            {event.playerCount !== null && (
              <Counter value={counterValue(event.playerCount)} label="players in the field" />
            )}
            <Counter value={counterValue(event.playerRowCount)} label="results archived" />
            <Counter value={counterValue(event.deckCount)} label="decklists on file" />
          </div>

          {(event.sources.length > 0 || event.contributors.length > 0) && (
            <div className="flex flex-col gap-1">
              {event.sources.length > 0 && <EventSources sources={event.sources} />}
              <MetaContributors contributors={event.contributors} className="text-xs" />
            </div>
          )}
        </div>

        {champion !== null && <ChampionPlate player={champion} artId={artId} />}
      </div>
    </section>
  );
}
