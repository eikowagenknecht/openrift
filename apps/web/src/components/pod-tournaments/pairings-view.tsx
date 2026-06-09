import type {
  PairingWarning,
  PodResponse,
  PodRoundResponse,
  PodScoringScheme,
  PodSnapshotPlayer,
} from "@openrift/shared";
import { computePairingWarnings } from "@openrift/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { snapshotToPlayers, WarningBadge, WarningList } from "./pairing-warnings";
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
  /** The active scheme, so the result form previews the right points. */
  scheme: PodScoringScheme;
  /** Organizer view: show the fairness internals (penalty, rematches, spread, warnings). */
  showPenalty: boolean;
  /**
   * Per-player aggregates entering the open round (organizer-only). When present,
   * the reporting round shows advisory warnings (rematch / 3-pod / spread / bye).
   */
  snapshot?: PodSnapshotPlayer[] | null;
  /** Warnings written out per pod (`true`) vs a compact header icon (`false`). Default `true`. */
  warningsExpanded?: boolean;
  /** Whether the given pod may be scored right now (e.g. its round is reporting). */
  canEnterResult: (round: PodRoundResponse, pod: PodResponse) => boolean;
  onSubmitResult: (podId: string, placements: Placement[]) => Promise<void>;
  /** Organizer round-level controls (finalize / re-roll / edit), rendered in the round header. */
  renderRoundActions?: (round: PodRoundResponse) => ReactNode;
  emptyMessage: string;
}

// Engine pods from a stored round (members in order); index aligns with round.pods.
function toEnginePods(round: PodRoundResponse) {
  return round.pods.map((pod) => ({
    size: pod.size,
    playerIds: pod.members.map((member) => member.playerId),
  }));
}

export function PairingsView({
  rounds,
  scoresByPlayer,
  scheme,
  showPenalty,
  snapshot,
  warningsExpanded = true,
  canEnterResult,
  onSubmitResult,
  renderRoundActions,
  emptyMessage,
}: PairingsViewProps) {
  if (rounds.length === 0) {
    return <p className="text-muted-foreground">{emptyMessage}</p>;
  }
  const nameById = new Map<string, string>(
    rounds.flatMap((round) => [
      ...round.pods.flatMap((pod) =>
        pod.members.map((member) => [member.playerId, member.displayName] as const),
      ),
      ...round.byes.map((bye) => [bye.playerId, bye.displayName] as const),
    ]),
  );

  return (
    <div className="flex flex-col gap-8">
      {rounds.toReversed().map((round) => {
        // Warnings are organizer-only and only meaningful on the open round, where
        // the snapshot reflects the state the pairing was built from.
        const warnings =
          showPenalty && snapshot && round.status === "reporting"
            ? computePairingWarnings(
                toEnginePods(round),
                snapshotToPlayers(snapshot),
                round.byes.map((bye) => bye.playerId),
              )
            : [];
        const podWarnings = new Map<number, PairingWarning[]>();
        for (const warning of warnings) {
          if (warning.kind === "repeatBye") {
            continue;
          }
          const list = podWarnings.get(warning.podIndex) ?? [];
          list.push(warning);
          podWarnings.set(warning.podIndex, list);
        }
        const byeWarnings = warnings.filter((warning) => warning.kind === "repeatBye");

        return (
          <section key={round.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">Round {round.roundNumber}</h3>
                <Badge variant={round.status === "finalized" ? "secondary" : "default"}>
                  {round.status === "finalized" ? "Finalized" : "Reporting"}
                </Badge>
              </div>
              {renderRoundActions ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {renderRoundActions(round)}
                </div>
              ) : null}
            </div>
            {showPenalty ? <RoundPenaltySummary round={round} /> : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {round.pods.map((pod, podIndex) => (
                <PodCard
                  key={pod.id}
                  pod={pod}
                  scheme={scheme}
                  scoresByPlayer={scoresByPlayer}
                  showPenalty={showPenalty}
                  warnings={podWarnings.get(podIndex) ?? []}
                  warningsExpanded={warningsExpanded}
                  nameById={nameById}
                  canEnter={canEnterResult(round, pod)}
                  onSubmit={onSubmitResult}
                />
              ))}
              {round.byes.length > 0 ? (
                <ByesCard
                  byes={round.byes}
                  warnings={byeWarnings}
                  warningsExpanded={warningsExpanded}
                  nameById={nameById}
                  showPenalty={showPenalty}
                />
              ) : null}
            </div>
          </section>
        );
      })}
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
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>Penalty {Math.round(round.penaltyTotal ?? 0)}</span>
      <span>
        {rematches} rematch{rematches === 1 ? "" : "es"}
      </span>
      <span>{inThreePods} in 3-pods</span>
      <span>Largest spread {largestSpread}</span>
    </p>
  );
}

function ByesCard({
  byes,
  warnings,
  warningsExpanded,
  nameById,
  showPenalty,
}: {
  byes: PodRoundResponse["byes"];
  warnings: PairingWarning[];
  warningsExpanded: boolean;
  nameById: Map<string, string>;
  showPenalty: boolean;
}) {
  return (
    <Card className="gap-3 border-dashed">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Byes</span>
          {showPenalty && !warningsExpanded ? (
            <WarningBadge warnings={warnings} nameById={nameById} />
          ) : null}
        </CardTitle>
        {showPenalty && warningsExpanded ? (
          <WarningList warnings={warnings} nameById={nameById} />
        ) : null}
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {byes.map((bye) => (
            <li key={bye.playerId} className="flex items-center justify-between gap-2">
              <span className="font-medium">{bye.displayName}</span>
              <span className="font-semibold tabular-nums">+3 bye</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PodCard({
  pod,
  scheme,
  scoresByPlayer,
  showPenalty,
  warnings,
  warningsExpanded,
  nameById,
  canEnter,
  onSubmit,
}: {
  pod: PodResponse;
  scheme: PodScoringScheme;
  scoresByPlayer: Map<string, number>;
  showPenalty: boolean;
  warnings: PairingWarning[];
  warningsExpanded: boolean;
  nameById: Map<string, string>;
  canEnter: boolean;
  onSubmit: (podId: string, placements: Placement[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const reported = pod.resultStatus === "reported";

  async function handleSubmit(placements: Placement[]) {
    setSaving(true);
    // React Compiler can't yet lower try/finally, so reset `saving` in both the
    // success and error paths and rethrow to preserve the original propagation.
    try {
      await onSubmit(pod.id, placements);
      setEditing(false);
    } catch (error) {
      setSaving(false);
      throw error;
    }
    setSaving(false);
  }

  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Pod {pod.podNumber}</span>
          <span className="flex items-center gap-2">
            {showPenalty && !warningsExpanded ? (
              <WarningBadge warnings={warnings} nameById={nameById} />
            ) : null}
            <span className="text-muted-foreground font-normal">{pod.size} players</span>
          </span>
        </CardTitle>
        {showPenalty && pod.penalty ? (
          <p className="text-muted-foreground text-sm">
            {pod.penalty.rematchPairs} rematch{pod.penalty.rematchPairs === 1 ? "" : "es"} · spread{" "}
            {pod.penalty.spread} · penalty {Math.round(pod.penalty.total)}
          </p>
        ) : null}
        {showPenalty && warningsExpanded ? (
          <WarningList warnings={warnings} nameById={nameById} />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editing ? (
          <PodResultForm
            pod={pod}
            scheme={scheme}
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
