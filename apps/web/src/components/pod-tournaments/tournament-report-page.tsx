import type { PodReportResponse } from "@openrift/shared";
import { toast } from "sonner";

import { useRegionLabel } from "@/hooks/use-region-label";
import {
  useSubmitTournamentReportPlayerResult,
  useSubmitTournamentReportResult,
} from "@/hooks/use-tournaments";

import { PairingsView } from "./pairings-view";

// All rounds for the participant, newest-first. The open reporting round's pods
// offer inline result entry — each player their own score, or a whole pod at
// once; past rounds are read-only.
export function ReportRoundsContent({ token, data }: { token: string; data: PodReportResponse }) {
  const submitResult = useSubmitTournamentReportResult(token);
  const submitPlayerResult = useSubmitTournamentReportPlayerResult(token);
  const regionLabel = useRegionLabel();
  const regionByPlayer = data.regionsEnabled
    ? new Map(data.standings.map((row) => [row.playerId, row.region]))
    : undefined;
  const swiss = data.pairingStyle === "swiss";
  const hasOpenRound = data.rounds.some((round) => round.status === "reporting");
  // The follow-only link resolves the report but can't enter results.
  const canSubmit = data.canSubmit;

  async function submit(podId: string, results: { playerId: string; gamePoints: number }[]) {
    try {
      await submitResult.mutateAsync({ podId, results });
      toast.success("Result submitted");
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  async function submitPlayer(podId: string, playerId: string, gamePoints: number) {
    try {
      await submitPlayerResult.mutateAsync({ podId, playerId, gamePoints });
      toast.success("Score saved");
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
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
