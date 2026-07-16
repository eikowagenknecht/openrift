import type { PodStandingRow } from "@openrift/shared";

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
import { cn } from "@/lib/utils";

import { formatPlayerRecord, formatScore, POD_WINS_HINT, standingRanks } from "./standings-display";

// Default region label: the raw slug. A named module-level default keeps the
// React Compiler from bailing out (inline arrow defaults are not reorderable).
const rawRegionSlug = (slug: string): string => slug;

// The two headers that read as codes rather than words. The columns are named
// the way organizers say them out loud, so the long form is a tooltip on the
// header rather than a wider column.
const OPP_TITLE = "Average opponent points";
const GAME_TITLE = "Game points";

/**
 * The rank marker at the head of a row: a medal for the top three, the plain
 * number below that.
 * @returns The rank element.
 */
function RankMark({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <Medal rank={rank} />;
  }
  return <span className="text-muted-foreground tabular-nums">{rank}</span>;
}

/**
 * A player's identity in a standings row: face, name, region, drop state.
 * @returns The player cell contents.
 */
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
  standings,
  variant = "pod",
  regionsEnabled = false,
  regionLabel = rawRegionSlug,
}: {
  standings: PodStandingRow[];
  /** Column set: FFA pods (score/wins/pod tallies) or Swiss (points/W-L-D). */
  variant?: "pod" | "swiss";
  /** Shows each player's region alongside their name. */
  regionsEnabled?: boolean;
  /** Region slug -> display label; defaults to the raw slug. */
  regionLabel?: (slug: string) => string;
}) {
  if (standings.length === 0) {
    return <p className="text-muted-foreground">No players yet.</p>;
  }
  const swiss = variant === "swiss";
  const ranks = standingRanks(standings);
  return (
    <>
      {/* Mobile: a compact divided list. Only the tie-break chain (wins, opponent
          score, game points) is shown; rounds/pods/byes stay desktop-only. */}
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

      {/* Desktop: the full table. */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">{swiss ? "Points" : "Score"}</TableHead>
              {swiss ? (
                <TableHead className="text-right">W-L-D</TableHead>
              ) : (
                // "Wins" alone invites reading it as a match record; the column
                // counts pods won outright.
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
