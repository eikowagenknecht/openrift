import type { PodResponse, PodRoundResponse } from "@openrift/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { PodResultForm } from "./pod-result-form";
import { formatScore } from "./standings-table";

interface Placement {
  playerId: string;
  placement: number;
}

interface PairingsViewProps {
  rounds: PodRoundResponse[];
  /** Current standings score per player, for context in the pod cards. */
  scoresByPlayer: Map<string, number>;
  /** Organizer view: show the fairness internals (penalty, rematches, spread). */
  showPenalty: boolean;
  /** Whether the given pod may be scored right now (e.g. its round is reporting). */
  canEnterResult: (round: PodRoundResponse, pod: PodResponse) => boolean;
  onSubmitResult: (podId: string, placements: Placement[]) => Promise<void>;
  /** Organizer round-level controls (finalize / re-roll), rendered in the round header. */
  renderRoundActions?: (round: PodRoundResponse) => ReactNode;
  emptyMessage: string;
}

export function PairingsView({
  rounds,
  scoresByPlayer,
  showPenalty,
  canEnterResult,
  onSubmitResult,
  renderRoundActions,
  emptyMessage,
}: PairingsViewProps) {
  if (rounds.length === 0) {
    return <p className="text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="flex flex-col gap-8">
      {rounds.toReversed().map((round) => (
        <section key={round.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Round {round.roundNumber}</h3>
              <Badge variant={round.status === "finalized" ? "secondary" : "default"}>
                {round.status === "finalized" ? "Finalized" : "Reporting"}
              </Badge>
            </div>
            {renderRoundActions ? (
              <div className="flex items-center gap-2">{renderRoundActions(round)}</div>
            ) : null}
          </div>
          {showPenalty ? <RoundPenaltySummary round={round} /> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {round.pods.map((pod) => (
              <PodCard
                key={pod.id}
                pod={pod}
                scoresByPlayer={scoresByPlayer}
                showPenalty={showPenalty}
                canEnter={canEnterResult(round, pod)}
                onSubmit={onSubmitResult}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RoundPenaltySummary({ round }: { round: PodRoundResponse }) {
  const rematches = round.pods.reduce((sum, pod) => sum + (pod.penalty?.rematchPairs ?? 0), 0);
  const inThreePods = round.pods
    .filter((pod) => pod.size === 3)
    .reduce((sum, pod) => sum + pod.size, 0);
  const largestSpread = round.pods.reduce((max, pod) => Math.max(max, pod.penalty?.spread ?? 0), 0);
  return (
    <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span>Penalty {Math.round(round.penaltyTotal ?? 0)}</span>
      <span>
        {rematches} rematch{rematches === 1 ? "" : "es"}
      </span>
      <span>{inThreePods} in 3-pods</span>
      <span>Largest spread {largestSpread}</span>
    </p>
  );
}

function PodCard({
  pod,
  scoresByPlayer,
  showPenalty,
  canEnter,
  onSubmit,
}: {
  pod: PodResponse;
  scoresByPlayer: Map<string, number>;
  showPenalty: boolean;
  canEnter: boolean;
  onSubmit: (podId: string, placements: Placement[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const reported = pod.resultStatus === "reported";

  async function handleSubmit(placements: Placement[]) {
    setSaving(true);
    try {
      await onSubmit(pod.id, placements);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Pod {pod.podNumber}</span>
          <span className="text-muted-foreground font-normal">{pod.size} players</span>
        </CardTitle>
        {showPenalty && pod.penalty ? (
          <p className="text-muted-foreground text-sm">
            {pod.penalty.rematchPairs} rematch{pod.penalty.rematchPairs === 1 ? "" : "es"} · spread{" "}
            {pod.penalty.spread} · penalty {Math.round(pod.penalty.total)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editing ? (
          <PodResultForm
            pod={pod}
            onSubmit={handleSubmit}
            submitting={saving}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {pod.members.map((member) => (
                <li key={member.playerId} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {member.placement !== null && (
                      <Badge variant="secondary" className="tabular-nums">
                        {member.placement}
                      </Badge>
                    )}
                    <span className="font-medium">{member.displayName}</span>
                    {showPenalty ? (
                      <span className="text-muted-foreground tabular-nums">
                        {formatScore(scoresByPlayer.get(member.playerId) ?? 0)} pts
                      </span>
                    ) : null}
                  </span>
                  {member.points !== null && (
                    <span className="font-semibold tabular-nums">
                      +{formatScore(member.points)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {canEnter ? (
              <Button
                variant={reported ? "destructive" : "secondary"}
                size="sm"
                className={cn("self-end")}
                onClick={() => setEditing(true)}
              >
                {reported ? "Edit result" : "Enter result"}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
