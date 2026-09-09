import { GROUP_STAGE_ROUNDS } from "@openrift/shared/pairing/group-cut-types";
import type {
  GroupStageView,
  PodResponse,
  PodRoundResponse,
  PodScoringScheme,
} from "@openrift/shared/types/api/pod-tournament";
import type { TournamentMatchFormat } from "@openrift/shared/types/api/tournament";

import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { groupStageRounds } from "@/features/tournaments/lib/cut-bracket-display";
import type { GroupUnit } from "@/features/tournaments/lib/group-cut-units";
import {
  groupLabelByPlayer,
  groupUnits,
  isCrossGroupPod,
  podsOfUnit,
  roundSummaryLine,
  unitReportProgress,
} from "@/features/tournaments/lib/group-cut-units";

import { PodCard } from "./pod-card";
import { StartGroupRoundButton } from "./start-group-round-button";

interface PodResultEntry {
  playerId: string;
  gamePoints: number;
}

interface GroupStageSectionsProps {
  groupStage: GroupStageView;
  rounds: PodRoundResponse[];
  scheme: PodScoringScheme;
  matchFormat: TournamentMatchFormat;
  winPoints: number;
  drawPoints: number;
  canEnterResult: boolean;
  onSubmitResult: (podId: string, results: PodResultEntry[]) => Promise<void>;
  onSubmitPlayerResult?: (podId: string, playerId: string, gamePoints: number) => Promise<void>;
  /** Absent when the viewer cannot start a group's round. */
  onStartUnit?: (unit: GroupUnit) => void;
  starting?: boolean;
}

export function GroupStageSections({
  groupStage,
  rounds,
  scheme,
  matchFormat,
  winPoints,
  drawPoints,
  canEnterResult,
  onSubmitResult,
  onSubmitPlayerResult,
  onStartUnit,
  starting = false,
}: GroupStageSectionsProps) {
  const units = groupUnits(groupStage.groups);
  const labelByPlayer = groupLabelByPlayer(groupStage.groups);
  const stageRounds = groupStageRounds(rounds);

  if (units.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {units.map((unit) => (
        <GroupUnitSection
          key={unit.key}
          unit={unit}
          rounds={stageRounds}
          labelByPlayer={labelByPlayer}
          scheme={scheme}
          matchFormat={matchFormat}
          winPoints={winPoints}
          drawPoints={drawPoints}
          canEnterResult={canEnterResult}
          onSubmitResult={onSubmitResult}
          onSubmitPlayerResult={onSubmitPlayerResult}
          onStartUnit={onStartUnit}
          starting={starting}
        />
      ))}
    </div>
  );
}

function UnitProgressBadge({
  unit,
  reported,
  total,
}: {
  unit: GroupUnit;
  reported: number;
  total: number;
}) {
  if (unit.done) {
    return <Badge variant="success">Done</Badge>;
  }
  if (unit.roundsStarted === 0) {
    return <Badge variant="muted">Not started</Badge>;
  }
  return (
    <Badge variant={reported === total ? "success" : "warning"}>
      Round {unit.roundsStarted} · {reported} of {total} in
    </Badge>
  );
}

function GroupUnitSection({
  unit,
  rounds,
  labelByPlayer,
  scheme,
  matchFormat,
  winPoints,
  drawPoints,
  canEnterResult,
  onSubmitResult,
  onSubmitPlayerResult,
  onStartUnit,
  starting,
}: {
  unit: GroupUnit;
  rounds: PodRoundResponse[];
  labelByPlayer: Map<string, string>;
  scheme: PodScoringScheme;
  matchFormat: TournamentMatchFormat;
  winPoints: number;
  drawPoints: number;
  canEnterResult: boolean;
  onSubmitResult: (podId: string, results: PodResultEntry[]) => Promise<void>;
  onSubmitPlayerResult?: (podId: string, playerId: string, gamePoints: number) => Promise<void>;
  onStartUnit?: (unit: GroupUnit) => void;
  starting: boolean;
}) {
  const currentRound = rounds.find((round) => round.roundNumber === unit.roundsStarted);
  const currentPods = currentRound ? podsOfUnit(currentRound, unit) : [];
  const progress = unitReportProgress(currentPods);
  const missing = progress.total - progress.reported;
  const earlier = rounds
    .filter((round) => round.roundNumber < unit.roundsStarted)
    .map((round) => ({ roundNumber: round.roundNumber, pods: podsOfUnit(round, unit) }))
    .filter((entry) => entry.pods.length > 0);
  const nextRound = unit.roundsStarted + 1;
  const showStart = onStartUnit !== undefined && !unit.done && nextRound <= GROUP_STAGE_ROUNDS;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SectionHeading as="h3">{unit.label}</SectionHeading>
          <UnitProgressBadge unit={unit} reported={progress.reported} total={progress.total} />
          {unit.paired ? <Badge variant="outline">One cross-group match each</Badge> : null}
        </div>
        {showStart ? (
          unit.canStartNextRound ? (
            <StartGroupRoundButton
              roundNumber={nextRound}
              scopeLabel={unit.label}
              disabled={false}
              pending={starting}
              onConfirm={() => onStartUnit(unit)}
            />
          ) : (
            <span className="text-muted-foreground text-sm">
              {missing} result{missing === 1 ? "" : "s"} missing
            </span>
          )
        ) : null}
      </div>
      {currentPods.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {currentPods.map((pod) => (
            <PodCard
              key={pod.id}
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
              nameById={podNames(currentPods)}
              canEnter={canEnterResult}
              crossGroup={isCrossGroupPod(pod, labelByPlayer)}
              onSubmit={onSubmitResult}
              onSubmitPlayerResult={onSubmitPlayerResult}
            />
          ))}
        </div>
      ) : null}
      {earlier.length > 0 ? (
        <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
          {earlier.map((entry) => (
            <li key={entry.roundNumber} className="truncate">
              {roundSummaryLine(entry.roundNumber, entry.pods)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// Named module-level default: an inline arrow makes the React Compiler bail.
const rawSlug = (slug: string): string => slug;

function podNames(pods: readonly PodResponse[]): Map<string, string> {
  return new Map(
    pods.flatMap((pod) => pod.members.map((member) => [member.playerId, member.displayName])),
  );
}
