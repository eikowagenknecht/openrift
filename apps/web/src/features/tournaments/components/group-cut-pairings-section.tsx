import { GROUP_STAGE_ROUNDS } from "@openrift/shared/pairing/group-cut-types";
import type { PodTournamentDetailResponse } from "@openrift/shared/types/api/pod-tournament";
import { LayoutGridIcon } from "lucide-react";

import { ActionBand } from "@/components/ui/action-band";
import { Button } from "@/components/ui/button";
import {
  useFinalizeTournamentRound,
  useRerollTournamentRound,
  useStartGroupRound,
  useStartGroupStageRound,
  useSubmitTournamentResult,
} from "@/features/tournaments/hooks/use-tournament-run";
import { cutRounds } from "@/features/tournaments/lib/cut-bracket-display";
import { groupUnits } from "@/features/tournaments/lib/group-cut-units";
import { runReportedMutation } from "@/lib/run-reported-mutation";

import { CutBracketView } from "./cut-bracket-view";
import { CutGenerateBand, NextCutRoundBand } from "./cut-generate-band";
import { GenerateGroupsBand } from "./group-generate-band";
import { GroupStageSections } from "./group-stage-sections";
import { CompletedRoundsBand, OpenRoundBand } from "./round-state-band";
import { StartGroupRoundButton } from "./start-group-round-button";

export function GroupCutPairingsSection({
  id,
  data,
  staff,
}: {
  id: string;
  data: PodTournamentDetailResponse;
  staff: boolean;
}) {
  const submitResult = useSubmitTournamentResult();
  const startGroupRound = useStartGroupRound();
  const startGroupStageRound = useStartGroupStageRound();
  const finalizeRound = useFinalizeTournamentRound();
  const rerollRound = useRerollTournamentRound();

  const tournament = data.tournament;
  const groupStage = data.groupStage;
  const completed = tournament.status === "completed";

  if (data.rounds.length === 0 || groupStage === null || groupStage.groups.length === 0) {
    if (!staff) {
      return <p className="text-muted-foreground">The groups have not been drawn yet.</p>;
    }
    return <GenerateGroupsBand id={id} legendTiebreak={tournament.legendTiebreak} />;
  }

  const units = groupUnits(groupStage.groups);
  const bracketRounds = cutRounds(data.rounds);
  const openCutRound = bracketRounds.find((round) => round.status === "reporting");
  const lastCutRound = bracketRounds.at(-1);
  const nextCutRoundNumber = (lastCutRound?.roundNumber ?? GROUP_STAGE_ROUNDS) + 1;
  const bracketDone = bracketRounds.length > 0 && lastCutRound?.pods.length === 1;
  const lockstepReady = units.every((unit) => unit.canStartNextRound);
  const lockstepRound = Math.min(...units.map((unit) => unit.roundsStarted)) + 1;
  const showLockstepStart =
    staff &&
    !tournament.groupsSelfPaced &&
    !groupStage.stageComplete &&
    lockstepRound <= GROUP_STAGE_ROUNDS;
  const canRerollGroups =
    staff && !groupStage.cutGenerated && units.every((unit) => unit.roundsStarted <= 1);

  return (
    <div className="flex flex-col gap-6">
      {completed ? (
        <CompletedRoundsBand
          finalizedCount={data.rounds.filter((round) => round.status === "finalized").length}
        />
      ) : openCutRound ? (
        <OpenRoundBand
          round={openCutRound}
          suggested={0}
          finalizing={finalizeRound.isPending}
          onFinalize={() =>
            void runReportedMutation(() =>
              finalizeRound.mutateAsync({ id, roundNumber: openCutRound.roundNumber }),
            )
          }
        />
      ) : staff ? (
        groupStage.cutGenerated ? (
          bracketDone ? null : (
            <NextCutRoundBand
              id={id}
              cutSize={tournament.cutSize}
              nextRoundNumber={nextCutRoundNumber}
            />
          )
        ) : (
          <CutGenerateBand
            id={id}
            cutSize={tournament.cutSize}
            groupStage={groupStage}
            shares={data.legendMetaShares}
            staff={staff}
          />
        )
      ) : null}

      {showLockstepStart ? (
        <ActionBand
          icon={LayoutGridIcon}
          accent={lockstepReady}
          label={`Round ${lockstepRound}`}
          value={units.length}
          sub="groups start together"
          action={
            <StartGroupRoundButton
              roundNumber={lockstepRound}
              scopeLabel="all groups"
              disabled={!lockstepReady}
              pending={startGroupStageRound.isPending}
              size="default"
              onConfirm={() =>
                void runReportedMutation(() => startGroupStageRound.mutateAsync({ id }))
              }
            />
          }
        />
      ) : null}

      {bracketRounds.length > 0 ? (
        <CutBracketView
          rounds={bracketRounds}
          cutSize={tournament.cutSize}
          groupStage={groupStage}
          scheme={tournament.scoringScheme}
          matchFormat={tournament.matchFormat}
          winPoints={tournament.winPoints}
          drawPoints={tournament.drawPoints}
          canEnterResult={(round) => !completed && round.status === "reporting"}
          onSubmitResult={(podId, results) =>
            runReportedMutation(() => submitResult.mutateAsync({ id, podId, results }))
          }
        />
      ) : null}

      {canRerollGroups ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="destructive"
            disabled={rerollRound.isPending}
            onClick={() =>
              void runReportedMutation(() => rerollRound.mutateAsync({ id, roundNumber: 1 }))
            }
          >
            Re-draw groups
          </Button>
        </div>
      ) : null}

      <GroupStageSections
        groupStage={groupStage}
        rounds={data.rounds}
        scheme={tournament.scoringScheme}
        matchFormat={tournament.matchFormat}
        winPoints={tournament.winPoints}
        drawPoints={tournament.drawPoints}
        canEnterResult={!completed}
        onSubmitResult={(podId, results) =>
          runReportedMutation(() => submitResult.mutateAsync({ id, podId, results }))
        }
        onStartUnit={
          staff && tournament.groupsSelfPaced
            ? (unit) =>
                void runReportedMutation(() =>
                  startGroupRound.mutateAsync({ id, groupId: unit.groups[0]?.id ?? "" }),
                )
            : undefined
        }
        starting={startGroupRound.isPending}
      />
    </div>
  );
}
