import { enumLabel } from "@openrift/shared/enum-label";
import { dateLeafPartsUtc } from "@openrift/shared/format-date";
import { imageUrl } from "@openrift/shared/image-url";
import type {
  MetaEventDetail,
  MetaEventMatch,
  MetaEventPhase,
  MetaEventPlayer,
} from "@openrift/shared/types/api/meta";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { Fragment } from "react";

import { ArtBandBackdrop } from "@/components/art-band-backdrop";
import { MetaContributors } from "@/components/meta/meta-contributors";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaPlayerName } from "@/components/meta/meta-player-name";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { Card } from "@/components/ui/card";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { useDeckFormatList } from "@/hooks/use-enums";
import { CARD_BORDER_RADIUS } from "@/lib/card-grid-constants";
import { describeEventStructure } from "@/lib/meta-event-structure";
import { formatRecord } from "@/lib/meta-format";
import { metaEventWinners } from "@/lib/meta-front-page";
import { metaCutLineRecord } from "@/lib/meta-player-run";

/** Every citation is printed, never collapsed behind a "+2 more". */
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

function ChampionPlate({
  player,
  artId,
  slug,
  hasRun,
}: {
  player: MetaEventPlayer;
  artId: string | null;
  slug: string;
  hasRun: boolean;
}) {
  const record = formatRecord(player.wins, player.losses, player.draws);

  return (
    <div className="flex w-full shrink-0 items-center gap-4 sm:w-auto">
      <div className="bg-background/60 ring-border flex w-full flex-col gap-2 rounded-lg p-4 ring-1 sm:w-64">
        <span className="text-border-accent text-2xs font-semibold tracking-wide uppercase">
          Champion
        </span>
        <p className="font-heading font-semibold">
          <MetaPlayerName name={player.playerName} playerKey={player.playerKey} />
        </p>
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
        {hasRun && player.playerKey !== null && (
          <Link
            to="/meta/$slug/players/$key"
            params={{ slug, key: player.playerKey }}
            className="text-primary inline-flex items-center gap-0.5 text-xs font-medium hover:underline"
          >
            Road to the title
            <ChevronRightIcon className="size-3.5" />
          </Link>
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

/** The flag and venue are independently optional; the tier badge lives in the top bar, not here. */
export function MetaEventHeader({
  event,
  players,
  matches,
  phases,
  slug,
}: {
  event: MetaEventDetail;
  players: readonly MetaEventPlayer[];
  matches: readonly MetaEventMatch[];
  phases: readonly MetaEventPhase[];
  slug: string;
}) {
  const { labels: formatLabels } = useDeckFormatList();
  const leaf = dateLeafPartsUtc(event.eventDate);
  const structure = describeEventStructure(phases);
  const champion = players.find((player) => player.rank === 1) ?? null;
  const winnerLegend =
    champion?.legend ?? metaEventWinners(event).find((winner) => winner.legend !== null)?.legend;
  const artId = winnerLegend?.imageId ?? null;
  const cutLineRecord = metaCutLineRecord(players, structure.cutSize);
  const championHasRun =
    champion !== null &&
    matches.some((match) => match.player1Id === champion.id || match.player2Id === champion.id);

  const byline: string[] = [];
  if (event.organizer !== null) {
    byline.push(`Organized by ${event.organizer}`);
  }
  byline.push(enumLabel(formatLabels, event.format));
  if (structure.sentence !== null) {
    byline.push(structure.sentence);
  }

  return (
    <Card className="relative gap-0 py-0">
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
            {cutLineRecord !== null && (
              <Counter value={cutLineRecord} label="record at the cut line" />
            )}
          </div>

          {(event.sources.length > 0 || event.contributors.length > 0) && (
            <div className="flex flex-col gap-1">
              {event.sources.length > 0 && <EventSources sources={event.sources} />}
              <MetaContributors contributors={event.contributors} className="text-xs" />
            </div>
          )}
        </div>

        {champion !== null && (
          <ChampionPlate player={champion} artId={artId} slug={slug} hasRun={championHasRun} />
        )}
      </div>
    </Card>
  );
}
