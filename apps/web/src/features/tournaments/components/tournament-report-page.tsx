import type { PodReportResponse } from "@openrift/shared/types/api/pod-tournament";
import { toast } from "sonner";

import {
  useStartReportGroupRound,
  useSubmitTournamentReportPlayerResult,
  useSubmitTournamentReportResult,
} from "@/features/tournaments/hooks/use-tournament-run";
import { cutRounds } from "@/features/tournaments/lib/cut-bracket-display";
import { useRegionLabel } from "@/hooks/use-region-label";
import { runReportedMutation } from "@/lib/run-reported-mutation";

import { CutBracketView } from "./cut-bracket-view";
import { GroupStageSections } from "./group-stage-sections";
import { PairingsView } from "./pairings-view";

export function ReportRoundsContent({ token, data }: { token: string; data: PodReportResponse }) {
  const submitResult = useSubmitTournamentReportResult(token);
  const submitPlayerResult = useSubmitTournamentReportPlayerResult(token);
  const startGroupRound = useStartReportGroupRound(token);
  const regionLabel = useRegionLabel();
  const regionByPlayer = data.regionsEnabled
    ? new Map(data.standings.map((row) => [row.playerId, row.region]))
    : undefined;
  const swiss = data.pairingStyle === "swiss";
  const hasOpenRound = data.rounds.some((round) => round.status === "reporting");
  const canSubmit = data.canSubmit;
  const groupStage = data.groupStage;

  async function submit(podId: string, results: { playerId: string; gamePoints: number }[]) {
    try {
      await submitResult.mutateAsync({ podId, results });
      toast.success("Result submitted");
    } catch {
      // Reported by the global mutation error toast.
    }
  }

  async function submitPlayer(podId: string, playerId: string, gamePoints: number) {
    try {
      await submitPlayerResult.mutateAsync({ podId, playerId, gamePoints });
      toast.success("Score saved");
    } catch {
      // Reported by the global mutation error toast.
    }
  }

  if (data.format === "group_cut" && groupStage !== null && groupStage.groups.length > 0) {
    const bracketRounds = cutRounds(data.rounds);
    return (
      <div className="flex flex-col gap-6">
        {canSubmit ? (
          <p className="text-muted-foreground text-sm">
            Enter your games won next to your name. Points are worked out automatically.
          </p>
        ) : null}
        {bracketRounds.length > 0 ? (
          <CutBracketView
            rounds={bracketRounds}
            cutSize={data.cutSize}
            groupStage={groupStage}
            scheme={data.scoringScheme}
            matchFormat={data.matchFormat}
            winPoints={data.winPoints}
            drawPoints={data.drawPoints}
            canEnterResult={(round) => canSubmit && round.status === "reporting"}
            onSubmitResult={submit}
            onSubmitPlayerResult={canSubmit ? submitPlayer : undefined}
          />
        ) : null}
        <GroupStageSections
          groupStage={groupStage}
          rounds={data.rounds}
          scheme={data.scoringScheme}
          matchFormat={data.matchFormat}
          winPoints={data.winPoints}
          drawPoints={data.drawPoints}
          canEnterResult={canSubmit}
          onSubmitResult={submit}
          onSubmitPlayerResult={canSubmit ? submitPlayer : undefined}
          onStartUnit={
            canSubmit && data.groupsSelfPaced
              ? (unit) =>
                  void runReportedMutation(() =>
                    startGroupRound.mutateAsync({ groupId: unit.groups[0]?.id ?? "" }),
                  )
              : undefined
          }
          starting={startGroupRound.isPending}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasOpenRound && canSubmit ? (
        <p className="text-muted-foreground text-sm">
          {data.playMode === "2v2"
            ? "Enter your team's games won. Points are worked out automatically."
            : swiss
              ? "Enter your games won next to your name. Points are worked out automatically."
              : "Enter your game points next to your name. Places are worked out automatically."}
        </p>
      ) : null}
      <PairingsView
        rounds={data.rounds}
        playMode={data.playMode}
        scheme={data.scoringScheme}
        byePoints={data.byePoints}
        matchFormat={data.matchFormat}
        winPoints={data.winPoints}
        drawPoints={data.drawPoints}
        regionByPlayer={regionByPlayer}
        regionLabel={regionLabel}
        showPenalty={false}
        canEnterResult={(round) => canSubmit && round.status === "reporting"}
        onSubmitResult={submit}
        onSubmitPlayerResult={canSubmit ? submitPlayer : undefined}
        emptyMessage="No rounds yet."
      />
    </div>
  );
}
