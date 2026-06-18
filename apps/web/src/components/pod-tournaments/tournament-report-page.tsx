import type { PodReportResponse } from "@openrift/shared";
import { toast } from "sonner";

import { useSubmitReportResult } from "@/hooks/use-pod-tournaments";

import { PairingsView } from "./pairings-view";

// All rounds for the participant, newest-first. The open reporting round's pods
// offer inline result entry (the token's one write); past rounds are read-only.
export function ReportRoundsContent({ token, data }: { token: string; data: PodReportResponse }) {
  const submitResult = useSubmitReportResult(token);
  const scoresByPlayer = new Map(data.standings.map((row) => [row.playerId, row.score]));
  const hasOpenRound = data.rounds.some((round) => round.status === "reporting");

  async function submit(podId: string, results: { playerId: string; gamePoints: number }[]) {
    try {
      await submitResult.mutateAsync({ podId, results });
      toast.success("Result submitted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save result");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {hasOpenRound ? (
        <p className="text-muted-foreground text-sm">
          Find your pod in the current round and enter the game points for each player. Places and
          points are worked out automatically.
        </p>
      ) : null}
      <PairingsView
        rounds={data.rounds}
        scoresByPlayer={scoresByPlayer}
        scheme={data.scoringScheme}
        byePoints={data.byePoints}
        showPenalty={false}
        canEnterResult={(round) => round.status === "reporting"}
        onSubmitResult={submit}
        emptyMessage="No rounds yet."
      />
    </div>
  );
}
