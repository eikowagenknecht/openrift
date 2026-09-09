import type {
  GroupCutTierView,
  GroupStageGroupView,
  GroupStageView,
  GroupStandingRowView,
} from "@openrift/shared/types/api/pod-tournament";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatWinRate, GROUP_CUT_TIER_LABEL } from "@/features/tournaments/lib/group-cut-display";
import { cn } from "@/lib/utils";

const DECIDED_BY_HEAD = "Below the row above by";

function DecidedByBadge({ tier }: { tier: GroupCutTierView | null }) {
  if (tier === null) {
    return null;
  }
  return (
    <Badge variant={tier === "meta_pending" ? "warning" : "muted"}>
      {GROUP_CUT_TIER_LABEL[tier]}
    </Badge>
  );
}

function RankMark({ place }: { place: number }) {
  if (place <= 3) {
    return <Medal rank={place} />;
  }
  return <span className="text-muted-foreground tabular-nums">{place}</span>;
}

function PlayerCell({ row }: { row: Pick<GroupStandingRowView, "displayName" | "status"> }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar name={row.displayName} size="sm" className="shrink-0" />
      <span className="truncate font-medium">{row.displayName}</span>
      {row.status === "dropped" ? (
        <span className="text-muted-foreground shrink-0 text-sm">(dropped)</span>
      ) : null}
    </div>
  );
}

function groupDescription(group: GroupStageGroupView): string {
  const count = group.playerIds.length;
  const players = `${count} player${count === 1 ? "" : "s"}`;
  return group.pairedGroupLabel === null
    ? players
    : `${players} · one cross-group match each, counted for the cut only`;
}

export function GroupStandingsCard({ group }: { group: GroupStageGroupView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Group {group.label}
          {group.pairedGroupLabel === null ? null : (
            <Badge variant="info">Paired with Group {group.pairedGroupLabel}</Badge>
          )}
        </CardTitle>
        <CardDescription>{groupDescription(group)}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Legend</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="text-right">W-L-D</TableHead>
              <TableHead className="text-right">GW%</TableHead>
              <TableHead>{DECIDED_BY_HEAD}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.standings.map((row) => (
              <TableRow key={row.playerId} className={cn(row.status === "dropped" && "opacity-50")}>
                <TableCell>
                  <RankMark place={row.place} />
                </TableCell>
                <TableCell>
                  <PlayerCell row={row} />
                </TableCell>
                <TableCell className="text-muted-foreground">{row.legendName ?? ""}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {row.points}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.wins}-{row.losses}-{row.draws}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatWinRate(row.gameWinRate)}
                </TableCell>
                <TableCell>
                  <DecidedByBadge tier={row.decidedBy} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CutSeedsCard({
  groupStage,
  cutSize,
}: {
  groupStage: GroupStageView;
  cutSize: number;
}) {
  const qualified = groupStage.ranking.filter((row) => row.qualified);
  const missedOut = groupStage.ranking.filter((row) => !row.qualified).slice(0, 3);
  if (qualified.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Top {cutSize} seeds
          {groupStage.cutGenerated ? <Badge variant="secondary">Locked</Badge> : null}
        </CardTitle>
        <CardDescription>
          All group winners first, then all runners-up, and so on until the cut is full.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {groupStage.seedsDiverged ? (
          <p className="text-warning text-sm">
            A group result was corrected after the cut. Group standings now differ from the locked
            seeds.
          </p>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Seed</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Place</TableHead>
              <TableHead className="text-right">MW%</TableHead>
              <TableHead className="text-right">GW%</TableHead>
              <TableHead>{DECIDED_BY_HEAD}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qualified.map((row) => (
              <TableRow key={row.playerId}>
                <TableCell>
                  <Badge variant="outline" className="tabular-nums">
                    #{row.seed ?? "-"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <UserAvatar name={row.displayName} size="sm" className="shrink-0" />
                    <span className="truncate font-medium">{row.displayName}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="muted">{row.groupLabel}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.place}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatWinRate(row.matchWinRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatWinRate(row.gameWinRate)}
                </TableCell>
                <TableCell>
                  <DecidedByBadge tier={row.decidedBy} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {missedOut.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            Did not qualify: {missedOut.map((row) => row.displayName).join(", ")}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function GroupTiebreakNote({ legendTiebreak }: { legendTiebreak: boolean }) {
  return (
    <p className="text-muted-foreground text-sm">
      Inside a group, match points come first, then the head-to-head result, a mini-table when three
      or more are level, and the game win rate
      {legendTiebreak ? ", then the rarer Legend in the field and its meta share" : ""}. For the
      cut, all group winners rank above all runners-up, and match win rate over all three matches
      orders each tier.
    </p>
  );
}
