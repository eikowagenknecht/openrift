import type { CutSize } from "@openrift/shared/pairing/group-cut-types";
import type {
  GroupStageView,
  PodResponse,
  PodRoundResponse,
  PodScoringScheme,
} from "@openrift/shared/types/api/pod-tournament";
import type { TournamentMatchFormat } from "@openrift/shared/types/api/tournament";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import type { BracketMatch } from "@/features/tournaments/lib/cut-bracket-display";
import { buildBracketColumns } from "@/features/tournaments/lib/cut-bracket-display";
import { cutMatchShortLabel } from "@/features/tournaments/lib/group-cut-display";
import { groupLabelByPlayer } from "@/features/tournaments/lib/group-cut-units";

import { PodCard } from "./pod-card";

interface PodResultEntry {
  playerId: string;
  gamePoints: number;
}

export function CutBracketView({
  rounds,
  cutSize,
  groupStage,
  scheme,
  matchFormat,
  winPoints,
  drawPoints,
  canEnterResult,
  onSubmitResult,
  onSubmitPlayerResult,
}: {
  rounds: PodRoundResponse[];
  cutSize: CutSize;
  groupStage: GroupStageView;
  scheme: PodScoringScheme;
  matchFormat: TournamentMatchFormat;
  winPoints: number;
  drawPoints: number;
  canEnterResult: (round: PodRoundResponse, pod: PodResponse) => boolean;
  onSubmitResult: (podId: string, results: PodResultEntry[]) => Promise<void>;
  onSubmitPlayerResult?: (podId: string, playerId: string, gamePoints: number) => Promise<void>;
}) {
  const columns = buildBracketColumns(rounds, cutSize);
  const seedByPlayer = new Map(
    groupStage.ranking.flatMap((row) => (row.seed === null ? [] : [[row.playerId, row.seed]])),
  );
  const groupByPlayer = groupLabelByPlayer(groupStage.groups);
  const roundByNumber = new Map(rounds.map((round) => [round.roundNumber, round]));

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-start gap-4">
        {columns.map((column) => {
          const round = roundByNumber.get(column.roundNumber);
          return (
            <div key={column.roundNumber} className="flex w-72 shrink-0 flex-col gap-3">
              <SectionHeading as="h3" size="sm">
                {column.label}
              </SectionHeading>
              {column.matches.map((match) => {
                const pod = match.pod;
                if (pod === null || round === undefined) {
                  return (
                    <PlaceholderMatch
                      key={match.key}
                      label={cutMatchShortLabel(cutSize, column.roundNumber, match.podNumber)}
                      match={match}
                    />
                  );
                }
                return (
                  <PodCard
                    key={match.key}
                    pod={pod}
                    teamMode={false}
                    scheme={scheme}
                    matchFormat={matchFormat}
                    winPoints={winPoints}
                    drawPoints={drawPoints}
                    regionLabel={rawSlug}
                    showPenalty={false}
                    warnings={[]}
                    warningsExpanded={false}
                    nameById={new Map()}
                    canEnter={canEnterResult(round, pod)}
                    title={cutMatchShortLabel(cutSize, column.roundNumber, match.podNumber)}
                    renderMemberLeading={(playerId) => (
                      <SeedPill seed={seedByPlayer.get(playerId)} />
                    )}
                    renderMemberBadge={(playerId) => (
                      <MemberNotes
                        groupLabel={groupByPlayer.get(playerId)}
                        chooser={isHigherSeed(pod, playerId, seedByPlayer)}
                      />
                    )}
                    onSubmit={onSubmitResult}
                    onSubmitPlayerResult={onSubmitPlayerResult}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Named module-level default: an inline arrow makes the React Compiler bail.
const rawSlug = (slug: string): string => slug;

function isHigherSeed(
  pod: PodResponse,
  playerId: string,
  seedByPlayer: Map<string, number>,
): boolean {
  const seeds = pod.members.flatMap((member) => {
    const seed = seedByPlayer.get(member.playerId);
    return seed === undefined ? [] : [seed];
  });
  const own = seedByPlayer.get(playerId);
  return own !== undefined && seeds.length > 0 && own === Math.min(...seeds);
}

function SeedPill({ seed }: { seed: number | undefined }) {
  if (seed === undefined) {
    return null;
  }
  return (
    <Badge variant="outline" className="shrink-0 tabular-nums">
      #{seed}
    </Badge>
  );
}

function MemberNotes({
  groupLabel,
  chooser,
}: {
  groupLabel: string | undefined;
  chooser: boolean;
}) {
  return (
    <>
      {groupLabel ? (
        <Badge variant="muted" className="shrink-0">
          {groupLabel}
        </Badge>
      ) : null}
      {chooser ? (
        <span className="text-muted-foreground shrink-0 text-xs">chooses starter</span>
      ) : null}
    </>
  );
}

function PlaceholderMatch({ label, match }: { label: string; match: BracketMatch }) {
  return (
    <Card className="gap-2 border-dashed">
      <CardHeader className="gap-1">
        <CardTitle className="text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
        {match.feeders ? (
          match.feeders.map((feeder) => <span key={feeder}>Winner of {feeder}</span>)
        ) : (
          <span>Not drawn yet</span>
        )}
      </CardContent>
    </Card>
  );
}
