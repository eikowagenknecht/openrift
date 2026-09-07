import type { PodStandingRow, TournamentPlayMode } from "@openrift/shared";

import { Badge } from "@/components/ui/badge";
import { Medal } from "@/components/ui/podium";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { collapseTeamStandings } from "@/lib/team-display";
import { cn } from "@/lib/utils";

import { formatPlayerRecord, formatScore, POD_WINS_HINT, standingRanks } from "./standings-display";

// Named module-level default: an inline arrow default is not reorderable and
// makes the React Compiler bail out.
const rawRegionSlug = (slug: string): string => slug;

const OPP_TITLE = "Average opponent points";
const GAME_TITLE = "Game points";

function RankMark({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <Medal rank={rank} />;
  }
  return <span className="text-muted-foreground tabular-nums">{rank}</span>;
}

function PlayerIdentity({
  row,
  regionsEnabled,
  regionLabel,
}: {
  row: PodStandingRow;
  regionsEnabled: boolean;
  regionLabel: (slug: string) => string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar name={row.displayName} size="sm" className="shrink-0" />
      <span className="truncate font-medium">{row.displayName}</span>
      {regionsEnabled && row.region ? (
        <Badge variant="outline" className="shrink-0">
          {regionLabel(row.region)}
        </Badge>
      ) : null}
      {row.status === "dropped" ? (
        <span className="text-muted-foreground shrink-0 text-sm">(dropped)</span>
      ) : null}
    </div>
  );
}

export function StandingsTable({
  standings: standingsInput,
  variant = "pod",
  playMode = "1v1",
  regionsEnabled = false,
  regionLabel = rawRegionSlug,
}: {
  standings: PodStandingRow[];
  /** Column set: FFA pods (score/wins/pod tallies) or Swiss (points/W-L-D). */
  variant?: "pod" | "swiss";
  /** 2v2 collapses teammate rows into one row per team. */
  playMode?: TournamentPlayMode;
  /** Shows each player's region alongside their name. */
  regionsEnabled?: boolean;
  /** Region slug -> display label; defaults to the raw slug. */
  regionLabel?: (slug: string) => string;
}) {
  const teamMode = playMode === "2v2";
  const standings = teamMode ? collapseTeamStandings(standingsInput) : standingsInput;
  if (standings.length === 0) {
    return <p className="text-muted-foreground">No players yet.</p>;
  }
  const swiss = variant === "swiss";
  const ranks = standingRanks(standings);
  return (
    <>
      <ul className="divide-y sm:hidden">
        {standings.map((row, index) => (
          <li
            key={row.playerId}
            className={cn(
              "flex items-center gap-3 py-2",
              row.status === "dropped" && "opacity-50",
              ranks[index] === 1 && "bg-border-accent/5",
            )}
          >
            <div className="flex w-6 shrink-0 justify-end">
              <RankMark rank={ranks[index]} />
            </div>
            <div className="min-w-0 flex-1">
              <PlayerIdentity row={row} regionsEnabled={regionsEnabled} regionLabel={regionLabel} />
              <div className="text-muted-foreground flex gap-x-3 text-sm">
                <span
                  className={swiss ? "tabular-nums" : undefined}
                  title={swiss ? undefined : POD_WINS_HINT}
                >
                  {formatPlayerRecord(row, swiss)}
                </span>
                <span title={OPP_TITLE}>opp {formatScore(row.avgOpponentScore)}</span>
                <span title={GAME_TITLE}>{row.gamePoints} game pts</span>
              </div>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{formatScore(row.score)}</span>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>{teamMode ? "Team" : "Player"}</TableHead>
              <TableHead className="text-right">{swiss ? "Points" : "Score"}</TableHead>
              {swiss ? (
                <TableHead className="text-right">W-L-D</TableHead>
              ) : (
                <TableHead className="text-right" title={POD_WINS_HINT}>
                  Pod wins
                </TableHead>
              )}
              <TableHead className="text-right" title={OPP_TITLE}>
                Opp
              </TableHead>
              <TableHead className="text-right" title={GAME_TITLE}>
                Game
              </TableHead>
              <TableHead className="text-right">Rounds</TableHead>
              {swiss ? null : (
                <>
                  <TableHead className="text-right">3-pods</TableHead>
                  <TableHead className="text-right">4-pods</TableHead>
                </>
              )}
              <TableHead className="text-right">Byes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map((row, index) => (
              <TableRow
                key={row.playerId}
                className={cn(
                  row.status === "dropped" && "opacity-50",
                  ranks[index] === 1 && "bg-border-accent/5",
                )}
              >
                <TableCell>
                  <RankMark rank={ranks[index]} />
                </TableCell>
                <TableCell>
                  <PlayerIdentity
                    row={row}
                    regionsEnabled={regionsEnabled}
                    regionLabel={regionLabel}
                  />
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatScore(row.score)}
                </TableCell>
                {swiss ? (
                  <TableCell className="text-right tabular-nums">
                    {row.wins}-{row.losses}-{row.draws}
                  </TableCell>
                ) : (
                  <TableCell className="text-right tabular-nums">{row.podWins}</TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {formatScore(row.avgOpponentScore)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.gamePoints}</TableCell>
                <TableCell className="text-right tabular-nums">{row.roundsPlayed}</TableCell>
                {swiss ? null : (
                  <>
                    <TableCell className="text-right tabular-nums">{row.pods3Count}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.pods4Count}</TableCell>
                  </>
                )}
                <TableCell className="text-right tabular-nums">{row.byeCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
