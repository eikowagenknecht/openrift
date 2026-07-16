import { suggestedRoundCount } from "@openrift/shared";
import type { PodTournamentDetailResponse } from "@openrift/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  useFinalizeTournamentRound,
  useRerollTournamentRound,
  useSubmitTournamentResult,
} from "@/hooks/use-tournaments";

import { GenerateRoundControls } from "./generate-round-controls";
import { PairingsView } from "./pairings-view";
import { PodPairingEditor } from "./pod-pairing-editor";

export function PodPairingsSection({
  id,
  data,
  regionLabel,
}: {
  id: string;
  data: PodTournamentDetailResponse;
  /** Region slug -> display label, from the custom-tag vocabulary. */
  regionLabel?: (slug: string) => string;
}) {
  const rerollRound = useRerollTournamentRound();
  const finalizeRound = useFinalizeTournamentRound();
  const submitResult = useSubmitTournamentResult();
  const [editingRound, setEditingRound] = useState<number | null>(null);
  const [warningsExpanded, setWarningsExpanded] = useState(true);

  const scoresByPlayer = new Map(data.standings.map((row) => [row.playerId, row.score]));
  const isSwiss = data.tournament.pairingStyle === "swiss";
  const regionByPlayer = data.tournament.regionsEnabled
    ? new Map(data.standings.map((row) => [row.playerId, row.region]))
    : undefined;
  const openRound = data.rounds.find((round) => round.status === "reporting");
  const completed = data.tournament.status === "completed";
  const finalizedCount = data.rounds.filter((round) => round.status === "finalized").length;
  const activeCount = data.players.filter((player) => player.status === "active").length;
  const suggested = suggestedRoundCount(activeCount);
  const reachedSuggestion = suggested > 0 && finalizedCount >= suggested;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  // The manual editor takes over the open round; the rest of the history stays visible.
  const editing = editingRound !== null && openRound?.roundNumber === editingRound;
  const shownRounds = editing
    ? data.rounds.filter((round) => round.status === "finalized")
    : data.rounds;

  return (
    <div className="flex flex-col gap-4">
      {completed ? (
        <p className="text-muted-foreground text-sm">
          This tournament is over (read-only). Reopen it in Settings to make changes.
        </p>
      ) : suggested > 0 ? (
        <p className="text-muted-foreground text-sm">
          Swiss suggests about {suggested} round{suggested === 1 ? "" : "s"} for {activeCount}{" "}
          active player{activeCount === 1 ? "" : "s"}; {finalizedCount} finalized so far.
        </p>
      ) : null}
      {!openRound && !completed ? (
        <GenerateRoundControls
          id={id}
          players={data.players}
          standings={data.standings}
          isFirstRound={data.rounds.length === 0}
          reachedSuggestion={reachedSuggestion}
          suggested={suggested}
          swissAutoBye={isSwiss && activeCount % 2 === 1}
        />
      ) : null}
      {finalizedCount > 1 ? (
        <p className="text-muted-foreground text-sm">
          Editing a finalized round fixes scores, but it does not redraw pods that later rounds
          already used.
        </p>
      ) : null}
      {editing && openRound && data.openRoundSnapshot ? (
        <PodPairingEditor
          id={id}
          round={openRound}
          snapshot={data.openRoundSnapshot}
          mode={isSwiss ? "swiss" : "pod"}
          regionLabel={regionLabel}
          onClose={() => setEditingRound(null)}
        />
      ) : null}
      <PairingsView
        rounds={shownRounds}
        scoresByPlayer={scoresByPlayer}
        scheme={data.tournament.scoringScheme}
        byePoints={data.tournament.byePoints}
        matchFormat={data.tournament.matchFormat}
        winPoints={data.tournament.winPoints}
        drawPoints={data.tournament.drawPoints}
        regionByPlayer={regionByPlayer}
        regionLabel={regionLabel}
        showPenalty
        snapshot={data.openRoundSnapshot}
        warningsExpanded={warningsExpanded}
        canEnterResult={() => !completed}
        onSubmitResult={(podId, results) =>
          run(() => submitResult.mutateAsync({ id, podId, results }))
        }
        renderRoundActions={(round) => {
          if (round.status !== "reporting") {
            return null;
          }
          const allReported = round.pods.every((pod) => pod.resultStatus === "reported");
          const anyReported = round.pods.some((pod) => pod.resultStatus === "reported");
          return (
            <>
              <Toggle
                size="sm"
                variant="outline"
                pressed={warningsExpanded}
                onPressedChange={setWarningsExpanded}
                aria-label={warningsExpanded ? "Show warnings as icons" : "Show warnings in full"}
              >
                <TriangleAlertIcon />
                {warningsExpanded ? "Warnings: full" : "Warnings: icons"}
              </Toggle>
              <Button
                size="sm"
                variant="outline"
                disabled={anyReported}
                onClick={() => setEditingRound(round.roundNumber)}
              >
                Edit pairing
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={anyReported || rerollRound.isPending}
                onClick={() =>
                  void run(() => rerollRound.mutateAsync({ id, roundNumber: round.roundNumber }))
                }
              >
                Re-roll
              </Button>
              <Button
                size="sm"
                disabled={!allReported || finalizeRound.isPending}
                onClick={() =>
                  void run(() => finalizeRound.mutateAsync({ id, roundNumber: round.roundNumber }))
                }
              >
                Finalize round
              </Button>
            </>
          );
        }}
        emptyMessage={editing ? "" : "No rounds yet. Generate the first round to begin."}
      />
    </div>
  );
}
