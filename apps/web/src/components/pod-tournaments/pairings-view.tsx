import type {
  PairingWarning,
  PodMemberResponse,
  PodResponse,
  PodRoundResponse,
  PodScoringScheme,
  PodSnapshotPlayer,
  TournamentMatchFormat,
} from "@openrift/shared";
import { computePairingWarnings } from "@openrift/shared";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { snapshotToPlayers, WarningBadge, WarningList } from "./pairing-warnings";
import { parsePoints, PodResultForm } from "./pod-result-form";
import { formatScore } from "./standings-table";
import { SwissResultForm } from "./swiss-result-form";

interface PodResultEntry {
  playerId: string;
  gamePoints: number;
}

// Default region label: the raw slug (named so the React Compiler can reorder it).
const rawRegionSlug = (slug: string): string => slug;

interface PairingsViewProps {
  rounds: PodRoundResponse[];
  /** Current standings score per player, for context in the pod cards. */
  scoresByPlayer: Map<string, number>;
  /** The active scheme, so the result form previews the right points. */
  scheme: PodScoringScheme;
  /** Score points a sat-out (bye) game is worth, shown on the byes card. */
  byePoints: number;
  /** Swiss result entry: which scoreline presets a match offers. */
  matchFormat: TournamentMatchFormat;
  /** Swiss match points, for the result form's preview. */
  winPoints: number;
  drawPoints: number;
  /** Region per player (when the region layer is on), rendered as chips. */
  regionByPlayer?: Map<string, string | null>;
  /** Region slug -> display label; defaults to the raw slug. */
  regionLabel?: (slug: string) => string;
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
  onSubmitResult: (podId: string, results: PodResultEntry[]) => Promise<void>;
  /**
   * Per-player self-reporting (participant link): when present, each member row
   * offers inline entry of that player's own game points, and the pod completes
   * once everyone has entered theirs.
   */
  onSubmitPlayerResult?: (podId: string, playerId: string, gamePoints: number) => Promise<void>;
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
  byePoints,
  matchFormat,
  winPoints,
  drawPoints,
  regionByPlayer,
  regionLabel = rawRegionSlug,
  showPenalty,
  snapshot,
  warningsExpanded = true,
  canEnterResult,
  onSubmitResult,
  onSubmitPlayerResult,
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
                <Heading as="h3">Round {round.roundNumber}</Heading>
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
                  matchFormat={matchFormat}
                  winPoints={winPoints}
                  drawPoints={drawPoints}
                  regionByPlayer={regionByPlayer}
                  regionLabel={regionLabel}
                  scoresByPlayer={scoresByPlayer}
                  showPenalty={showPenalty}
                  warnings={podWarnings.get(podIndex) ?? []}
                  warningsExpanded={warningsExpanded}
                  nameById={nameById}
                  canEnter={canEnterResult(round, pod)}
                  onSubmit={onSubmitResult}
                  onSubmitPlayerResult={onSubmitPlayerResult}
                />
              ))}
              {round.byes.length > 0 ? (
                <ByesCard
                  byes={round.byes}
                  byePoints={byePoints}
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
  const sameRegionPods = round.pods.filter((pod) => (pod.penalty?.sameRegion ?? 0) > 0).length;
  // An all-matches (Swiss) round has no 3-pod duty to report.
  const allMatches = round.pods.length > 0 && round.pods.every((pod) => pod.size === 2);
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>Penalty {Math.round(round.penaltyTotal ?? 0)}</span>
      <span>
        {rematches} rematch{rematches === 1 ? "" : "es"}
      </span>
      {allMatches ? null : <span>{inThreePods} in 3-pods</span>}
      {sameRegionPods > 0 ? (
        <span>
          {sameRegionPods} same-region{" "}
          {allMatches
            ? sameRegionPods === 1
              ? "match"
              : "matches"
            : sameRegionPods === 1
              ? "pod"
              : "pods"}
        </span>
      ) : null}
      <span>Largest spread {largestSpread}</span>
    </p>
  );
}

function ByesCard({
  byes,
  byePoints,
  warnings,
  warningsExpanded,
  nameById,
  showPenalty,
}: {
  byes: PodRoundResponse["byes"];
  byePoints: number;
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
              <span className="font-semibold tabular-nums">
                {byePoints > 0 ? `+${byePoints} bye` : "sat out · 0"}
              </span>
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
  matchFormat,
  winPoints,
  drawPoints,
  regionByPlayer,
  regionLabel,
  scoresByPlayer,
  showPenalty,
  warnings,
  warningsExpanded,
  nameById,
  canEnter,
  onSubmit,
  onSubmitPlayerResult,
}: {
  pod: PodResponse;
  scheme: PodScoringScheme;
  matchFormat: TournamentMatchFormat;
  winPoints: number;
  drawPoints: number;
  regionByPlayer?: Map<string, string | null>;
  regionLabel: (slug: string) => string;
  scoresByPlayer: Map<string, number>;
  showPenalty: boolean;
  warnings: PairingWarning[];
  warningsExpanded: boolean;
  nameById: Map<string, string>;
  canEnter: boolean;
  onSubmit: (podId: string, results: PodResultEntry[]) => Promise<void>;
  onSubmitPlayerResult?: (podId: string, playerId: string, gamePoints: number) => Promise<void>;
}) {
  const isMatch = pod.size === 2;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Per-player self-entry: which member row is open for input, and its draft value.
  const [scoringPlayerId, setScoringPlayerId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState("");
  const reported = pod.resultStatus === "reported";
  const selfEntry = canEnter && onSubmitPlayerResult !== undefined;
  const enteredCount = pod.members.filter((member) => member.gamePoints !== null).length;

  async function handleSubmit(results: PodResultEntry[]) {
    setSaving(true);
    // React Compiler can't yet lower try/finally, so reset `saving` in both the
    // success and error paths and rethrow to preserve the original propagation.
    try {
      await onSubmit(pod.id, results);
      setEditing(false);
    } catch (error) {
      setSaving(false);
      throw error;
    }
    setSaving(false);
  }

  function startScoring(member: PodMemberResponse) {
    setScoringPlayerId(member.playerId);
    setScoreDraft(member.gamePoints === null ? "" : String(member.gamePoints));
  }

  async function handleSaveScore() {
    const parsed = parsePoints(scoreDraft);
    if (parsed === null || scoringPlayerId === null || !onSubmitPlayerResult) {
      return;
    }
    setSaving(true);
    // Same try/catch shape as handleSubmit (no try/finally under React Compiler).
    try {
      await onSubmitPlayerResult(pod.id, scoringPlayerId, parsed);
      setScoringPlayerId(null);
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
          <span>{isMatch ? `Match ${pod.podNumber}` : `Pod ${pod.podNumber}`}</span>
          <span className="flex items-center gap-2">
            {showPenalty && !warningsExpanded ? (
              <WarningBadge warnings={warnings} nameById={nameById} regionLabel={regionLabel} />
            ) : null}
            {!reported && enteredCount > 0 ? (
              <span className="text-muted-foreground font-normal">
                {enteredCount} of {pod.size} scores in
              </span>
            ) : isMatch ? null : (
              <span className="text-muted-foreground font-normal">{pod.size} players</span>
            )}
          </span>
        </CardTitle>
        {showPenalty && pod.penalty ? (
          <p className="text-muted-foreground text-sm">
            {pod.penalty.rematchPairs} rematch{pod.penalty.rematchPairs === 1 ? "" : "es"} · spread{" "}
            {pod.penalty.spread} · penalty {Math.round(pod.penalty.total)}
          </p>
        ) : null}
        {showPenalty && warningsExpanded ? (
          <WarningList warnings={warnings} nameById={nameById} regionLabel={regionLabel} />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editing ? (
          isMatch ? (
            <SwissResultForm
              pod={pod}
              matchFormat={matchFormat}
              winPoints={winPoints}
              drawPoints={drawPoints}
              onSubmit={handleSubmit}
              submitting={saving}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <PodResultForm
              pod={pod}
              scheme={scheme}
              onSubmit={handleSubmit}
              submitting={saving}
              onCancel={() => setEditing(false)}
            />
          )
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
                    {regionByPlayer?.get(member.playerId) ? (
                      <Badge variant="outline">
                        {regionLabel(regionByPlayer.get(member.playerId) ?? "")}
                      </Badge>
                    ) : null}
                    {showPenalty ? (
                      <span className="text-muted-foreground tabular-nums">
                        {formatScore(scoresByPlayer.get(member.playerId) ?? 0)} pts
                      </span>
                    ) : null}
                  </span>
                  {selfEntry && scoringPlayerId === member.playerId ? (
                    <span className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the input appears from the tapped "Add score" button; focusing it is the point of the tap
                        autoFocus
                        value={scoreDraft}
                        onChange={(event) => setScoreDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void handleSaveScore();
                          }
                        }}
                        aria-label={`Game points for ${member.displayName}`}
                        className="h-7 w-16 tabular-nums"
                      />
                      <Button
                        size="icon-sm"
                        onClick={handleSaveScore}
                        disabled={saving || parsePoints(scoreDraft) === null}
                        aria-label={`Save score for ${member.displayName}`}
                      >
                        <CheckIcon />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setScoringPlayerId(null)}
                        disabled={saving}
                        aria-label="Cancel score entry"
                      >
                        <XIcon />
                      </Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 tabular-nums">
                      {member.gamePoints !== null && (
                        <span className="text-muted-foreground">{member.gamePoints} game</span>
                      )}
                      {member.points !== null && (
                        <span className="font-semibold">+{formatScore(member.points)}</span>
                      )}
                      {selfEntry ? (
                        member.gamePoints === null ? (
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => startScoring(member)}
                          >
                            Add score
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => startScoring(member)}
                            aria-label={`Edit score for ${member.displayName}`}
                          >
                            <PencilIcon />
                          </Button>
                        )
                      ) : null}
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
                {reported ? "Edit result" : selfEntry ? "Enter all scores" : "Enter result"}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
