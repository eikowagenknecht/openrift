import type { MetaEventPlayer } from "@openrift/shared";
import { formatRank, formatRecord } from "@openrift/shared";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Heading } from "@/components/heading";
import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { MetaHeroArt, MetaHeroCounter } from "@/components/meta/meta-hero";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaPlayerName } from "@/components/meta/meta-player-name";
import { MetaResultChip } from "@/components/meta/meta-result-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { accentGlow } from "@/components/ui/podium";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useMetaEvent } from "@/hooks/use-meta";
import { deckGlowStyle } from "@/lib/domain";
import { isSingleElimination } from "@/lib/meta-bracket";
import { describeEventStructure } from "@/lib/meta-event-structure";
import { splitLegendName } from "@/lib/meta-format";
import type { MetaPlayerRound } from "@/lib/meta-player-run";
import {
  metaCutRoundLabel,
  metaEventPlayerByKey,
  metaPlayerRun,
  metaRunRecord,
} from "@/lib/meta-player-run";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta_/$slug_/players_/$key");

const FINAL_GLOW = accentGlow(12);

const ROW_GRID = "items-center gap-x-3.5";
const SWISS_GRID = `grid grid-cols-[2.75rem_3.5rem_minmax(0,1fr)_10.5rem_7rem_6rem] ${ROW_GRID}`;
const CUT_GRID = `grid grid-cols-[6rem_3.5rem_minmax(0,1fr)_10.5rem_7rem_6rem] ${ROW_GRID}`;

const SHORT_CUT_LABEL: Record<string, string> = {
  Quarterfinal: "QF",
  Semifinal: "SF",
  Final: "F",
};

function opponentFinishLine(opponent: MetaEventPlayer | undefined): string | null {
  if (opponent === undefined) {
    return null;
  }
  const parts = [`finished ${formatRank(opponent.rank, opponent.rankIsTier)}`];
  const record = formatRecord(opponent.wins, opponent.losses, opponent.draws);
  if (record !== null) {
    parts.push(record);
  }
  return parts.join(" · ");
}

function OpponentList({ opponent }: { opponent: MetaEventPlayer | undefined }) {
  if (opponent === undefined || opponent.shareToken === null) {
    return null;
  }
  return (
    <Link
      to="/meta/decks/$token"
      params={{ token: opponent.shareToken }}
      className="text-primary font-medium whitespace-nowrap hover:underline"
    >
      {opponent.listStatus === "partial" ? "Partial" : "Decklist"}
    </Link>
  );
}

function OpponentThumb({ opponent }: { opponent: MetaEventPlayer | undefined }) {
  return (
    <CardArtThumb
      className="w-9"
      imageId={opponent?.legend?.imageId ?? null}
      domains={opponent?.legend?.domains}
    />
  );
}

function OpponentLegend({
  opponent,
  className,
  championOnly = false,
}: {
  opponent: MetaEventPlayer | undefined;
  className?: string;
  championOnly?: boolean;
}) {
  return (
    <MetaIdentity
      name={opponent?.legend?.name}
      slug={opponent?.legend?.slug}
      archiveSlug={opponent?.legend?.archiveSlug}
      domains={opponent?.legend?.domains}
      championOnly={championOnly}
      className={className}
    />
  );
}

function OpponentName({
  opponent,
  className,
}: {
  opponent: MetaEventPlayer | undefined;
  className?: string;
}) {
  if (opponent === undefined) {
    return <span className={className}>Unknown</span>;
  }
  return (
    <MetaPlayerName
      name={opponent.playerName}
      playerKey={opponent.playerKey}
      className={className}
    />
  );
}

interface RunRowProps {
  round: MetaPlayerRound;
  opponent: MetaEventPlayer | undefined;
  label: string;
  shortLabel: string;
  grid: string;
  isFinal: boolean;
}

function RunRow({ round, opponent, label, shortLabel, grid, isFinal }: RunRowProps) {
  const isBye = round.opponentId === null;
  const finish = opponent === undefined ? null : formatRank(opponent.rank, opponent.rankIsTier);
  const record =
    opponent === undefined ? null : formatRecord(opponent.wins, opponent.losses, opponent.draws);

  return (
    <li className="not-last:border-b" style={isFinal ? { backgroundImage: FINAL_GLOW } : undefined}>
      <div className={cn(grid, "hidden px-4 py-2.5 sm:grid")}>
        <span className="font-heading text-sm font-semibold tabular-nums">{label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {round.tableNumber === null ? "" : `Table ${round.tableNumber}`}
        </span>
        {isBye ? (
          <span className="text-muted-foreground text-sm">No opponent this round</span>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <OpponentThumb opponent={opponent} />
            <div className="min-w-0">
              <OpponentName opponent={opponent} className="block truncate font-medium" />
              <OpponentLegend opponent={opponent} className="text-xs" />
            </div>
          </div>
        )}
        <div className="text-muted-foreground text-xs leading-tight tabular-nums">
          {finish !== null && (
            <p>
              finished <span className="text-foreground font-medium">{finish}</span>
            </p>
          )}
          {record !== null && <p>{record}</p>}
        </div>
        <MetaResultChip
          outcome={round.outcome}
          gamesWon={round.gamesWon}
          gamesLost={round.gamesLost}
        />
        <span className="text-right text-sm">
          <OpponentList opponent={opponent} />
        </span>
      </div>

      <div className="flex items-center gap-2.5 px-3 py-2 text-sm sm:hidden">
        <span className="font-heading w-10 shrink-0 font-semibold tabular-nums">{shortLabel}</span>
        {isBye ? (
          <span className="text-muted-foreground min-w-0 flex-1">No opponent this round</span>
        ) : (
          <>
            <OpponentThumb opponent={opponent} />
            <div className="min-w-0 flex-1 leading-tight">
              <OpponentName opponent={opponent} className="block truncate font-medium" />
              <OpponentLegend
                opponent={opponent}
                championOnly
                className="text-muted-foreground text-xs"
              />
              {opponentFinishLine(opponent) !== null && (
                <p className="text-muted-foreground text-xs tabular-nums">
                  {opponentFinishLine(opponent)}
                </p>
              )}
            </div>
          </>
        )}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <MetaResultChip
            outcome={round.outcome}
            gamesWon={round.gamesWon}
            gamesLost={round.gamesLost}
          />
          <span className="text-xs">
            <OpponentList opponent={opponent} />
          </span>
        </div>
      </div>
    </li>
  );
}

function sectionSubtitle(rounds: readonly MetaPlayerRound[], bestOf: number | null): string {
  const parts = [`${rounds.length} ${rounds.length === 1 ? "round" : "rounds"}`];
  const record = metaRunRecord(rounds);
  const formatted = formatRecord(record.wins, record.losses, record.draws);
  if (formatted !== null) {
    parts.push(formatted);
  }
  if (bestOf !== null) {
    parts.push(`best of ${bestOf}`);
  }
  return parts.join(" · ");
}

interface RunSectionProps {
  title: string;
  bestOf: number | null;
  rounds: readonly MetaPlayerRound[];
  players: ReadonlyMap<string, MetaEventPlayer>;
  lastCutRound: number | null;
  finalRoundNumber: number | null;
}

function RunSection({
  title,
  bestOf,
  rounds,
  players,
  lastCutRound,
  finalRoundNumber,
}: RunSectionProps) {
  if (rounds.length === 0) {
    return null;
  }
  const grid = lastCutRound === null ? SWISS_GRID : CUT_GRID;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Heading>{title}</Heading>
        <p className="text-muted-foreground text-sm">{sectionSubtitle(rounds, bestOf)}</p>
      </div>

      <Card className="gap-0 py-0">
        <div className={cn(grid, "hidden h-10 border-b px-4 text-sm font-medium sm:grid")}>
          <span>Round</span>
          <span />
          <span>Opponent</span>
          <span>Their finish</span>
          <span>Result</span>
          <span className="text-right">List</span>
        </div>
        <ul className="flex flex-col">
          {rounds.map((round) => {
            const label =
              lastCutRound === null
                ? `R${round.roundNumber}`
                : metaCutRoundLabel(round.roundNumber, lastCutRound);
            return (
              <RunRow
                key={`${round.phaseOrder}:${round.roundNumber}`}
                round={round}
                opponent={round.opponentId === null ? undefined : players.get(round.opponentId)}
                label={label}
                shortLabel={lastCutRound === null ? label : (SHORT_CUT_LABEL[label] ?? label)}
                grid={grid}
                isFinal={round.roundNumber === finalRoundNumber}
              />
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

export function MetaEventRunPage() {
  const { slug, key } = routeApi.useParams();
  const { data } = useMetaEvent(slug);
  const domainColors = useDomainColors();

  const player = metaEventPlayerByKey(data.players, key);
  if (player === null) {
    return null;
  }

  const players = new Map(data.players.map((row) => [row.id, row]));
  const run = metaPlayerRun(data.matches, data.phases, player.id);
  const structure = describeEventStructure(data.phases);
  const cutPhases = new Set(
    data.phases.filter((phase) => isSingleElimination(phase.roundType)).map((p) => p.phaseOrder),
  );
  const cutMatches = data.matches.filter((match) => cutPhases.has(match.phaseOrder));
  const lastCutRound =
    cutMatches
      .map((match) => match.roundNumber)
      .toSorted((a, b) => a - b)
      .at(-1) ?? 0;
  const finalRoundNumber =
    cutMatches.filter((match) => match.roundNumber === lastCutRound).length === 1
      ? lastCutRound
      : null;

  const champion = player.legend === null ? null : splitLegendName(player.legend.name).champion;
  const fieldSize = data.event.playerCount ?? data.event.playerRowCount;
  const record = formatRecord(player.wins, player.losses, player.draws);
  const roundsPlayed = run.swiss.length + run.cut.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar className="gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TopBarBreadcrumbTrail
              segments={[
                { label: "Meta Archive", link: <Link to="/meta" /> },
                { label: data.event.name, link: <Link to="/meta/$slug" params={{ slug }} /> },
              ]}
            />
            <TopBarBreadcrumbSeparator className="hidden sm:inline" />
            <PageTopBarTitle>{player.playerName}</PageTopBarTitle>
          </div>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe flex flex-col gap-8 pt-3 pb-10")}>
        <Card className="relative gap-0 py-0">
          <div
            aria-hidden
            className="absolute inset-0"
            style={deckGlowStyle(player.legend?.domains ?? [], domainColors)}
          />
          <MetaHeroArt imageId={player.legend?.imageId ?? null} alt={champion ?? ""} />

          <div className="relative flex flex-col gap-3 p-5 pr-[45%] sm:pr-[38%]">
            <p className="text-border-accent text-2xs font-semibold tracking-wide uppercase">
              {player.rank === 1 ? "Road to the title" : "Tournament run"}
            </p>
            <h2 className="font-heading text-2xl font-bold">{player.playerName}</h2>

            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <MetaIdentity
                name={player.legend?.name}
                slug={player.legend?.slug}
                archiveSlug={player.legend?.archiveSlug}
                domains={player.legend?.domains}
                className="text-foreground"
              />
              {player.champion !== null && (
                <>
                  <span aria-hidden className="text-muted-foreground/60">
                    ·
                  </span>
                  <span>{player.champion.name}</span>
                </>
              )}
            </p>

            <div className="flex flex-wrap gap-x-9 gap-y-3">
              <MetaHeroCounter
                value={formatRank(player.rank, player.rankIsTier)}
                label={`of ${fieldSize.toLocaleString("en-US")} players`}
                className="text-border-accent"
              />
              {record !== null && <MetaHeroCounter value={record} label="final record" />}
              <MetaHeroCounter value={roundsPlayed} label="rounds played" />
            </div>

            <div className="flex flex-wrap gap-2">
              {player.shareToken !== null && (
                <Button
                  variant="outline"
                  render={<Link to="/meta/decks/$token" params={{ token: player.shareToken }} />}
                >
                  {player.listStatus === "partial" ? "Partial list" : "Decklist"}
                </Button>
              )}
              {player.playerKey !== null && (
                <Button
                  variant="ghost"
                  render={<Link to="/meta/players/$key" params={{ key: player.playerKey }} />}
                >
                  Every finish by {player.playerName}
                  <ChevronRightIcon />
                </Button>
              )}
            </div>
          </div>
        </Card>

        <RunSection
          title="Swiss"
          bestOf={structure.bestOf}
          rounds={run.swiss}
          players={players}
          lastCutRound={null}
          finalRoundNumber={null}
        />

        <RunSection
          title={structure.cutSize === null ? "Top cut" : `Top ${structure.cutSize}`}
          bestOf={structure.bestOf}
          rounds={run.cut}
          players={players}
          lastCutRound={lastCutRound}
          finalRoundNumber={finalRoundNumber}
        />

        <p className="text-muted-foreground text-sm">
          <Link to="/meta/$slug" params={{ slug }} className="hover:underline">
            Full standings
          </Link>
          {" · Every match on this page is the result published by the tournament organizer."}
        </p>
      </div>
    </div>
  );
}
