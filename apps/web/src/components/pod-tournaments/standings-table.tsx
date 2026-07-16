import type { PodStandingRow } from "@openrift/shared";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Default region label: the raw slug. A named module-level default keeps the
// React Compiler from bailing out (inline arrow defaults are not reorderable).
const rawRegionSlug = (slug: string): string => slug;

/**
 * Render a score as an integer when whole, otherwise up to two decimals (averages
 * like avg-opponent-score can produce 1.75, which should not round to 1.8).
 * @returns The formatted score string.
 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : Number(score.toFixed(2)).toString();
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
  /** Adds the Region column (and chips on mobile). */
  regionsEnabled?: boolean;
  /** Region slug -> display label; defaults to the raw slug. */
  regionLabel?: (slug: string) => string;
}) {
  if (standings.length === 0) {
    return <p className="text-muted-foreground">No players yet.</p>;
  }
  const swiss = variant === "swiss";
  return (
    <>
      {/* Mobile: a compact divided list. Only the tie-break chain (wins, opponent
          score, game points) is shown; rounds/pods/byes stay desktop-only. */}
      <ul className="divide-y sm:hidden">
        {standings.map((row, index) => (
          <li
            key={row.playerId}
            className={cn("flex items-center gap-3 py-2", row.status === "dropped" && "opacity-50")}
          >
            <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
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
              <div className="text-muted-foreground flex gap-x-3 text-sm">
                {swiss ? (
                  <span className="tabular-nums">
                    {row.wins}-{row.losses}-{row.draws}
                  </span>
                ) : (
                  <span>
                    {row.podWins} win{row.podWins === 1 ? "" : "s"}
                  </span>
                )}
                <span>opp {formatScore(row.avgOpponentScore)}</span>
                <span>{row.gamePoints} game pts</span>
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
              {regionsEnabled ? <TableHead>Region</TableHead> : null}
              <TableHead className="text-right">{swiss ? "Points" : "Score"}</TableHead>
              {swiss ? (
                <TableHead className="text-right">W-L-D</TableHead>
              ) : (
                <TableHead className="text-right">Wins</TableHead>
              )}
              <TableHead className="text-right">Opp</TableHead>
              <TableHead className="text-right">Game</TableHead>
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
              <TableRow key={row.playerId} className={cn(row.status === "dropped" && "opacity-50")}>
                <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                <TableCell className="font-medium">
                  {row.displayName}
                  {row.status === "dropped" ? (
                    <span className="text-muted-foreground ml-2">(dropped)</span>
                  ) : null}
                </TableCell>
                {regionsEnabled ? (
                  <TableCell className="text-muted-foreground">
                    {row.region ? regionLabel(row.region) : "—"}
                  </TableCell>
                ) : null}
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
