import type { PairingWarning } from "@openrift/shared/pairing/warnings";
import type {
  PodMemberResponse,
  PodResponse,
  PodScoringScheme,
} from "@openrift/shared/types/api/pod-tournament";
import type { TournamentMatchFormat } from "@openrift/shared/types/api/tournament";
import { CheckIcon, PencilIcon, SwordsIcon, UsersIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconChip } from "@/components/ui/icon-chip";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { isWalkoverPod } from "@/features/tournaments/lib/group-cut-units";
import { groupPodMembersByTeam, teamDisplayName } from "@/features/tournaments/lib/team-display";
import {
  isMatchPairing,
  ordinalPlace,
  pairingLabel,
} from "@/features/tournaments/lib/tournament-display";
import { cn } from "@/lib/utils";

import { WarningBadge, WarningList } from "./pairing-warnings";
import { parsePoints, PodResultForm } from "./pod-result-form";
import { formatScore } from "./standings-display";
import { SwissResultForm } from "./swiss-result-form";

interface PodResultEntry {
  playerId: string;
  gamePoints: number;
}

function MemberSeedBadge({
  placement,
  gamePoints,
}: {
  placement: number | null;
  gamePoints: number | null;
}) {
  if (placement === null && gamePoints === null) {
    return null;
  }
  return (
    <Badge variant="secondary" className="shrink-0 tabular-nums">
      {placement !== null && (
        <span title={`Finished ${ordinalPlace(placement)} in the pod`}>{placement}</span>
      )}
      {placement !== null && gamePoints !== null ? (
        <span aria-hidden="true" className="text-muted-foreground/60">
          ·
        </span>
      ) : null}
      {gamePoints !== null && (
        <span className="text-muted-foreground" title={`${gamePoints} game points`}>
          {gamePoints}g
        </span>
      )}
    </Badge>
  );
}

// Omits zero-value figures: a clean pairing renders nothing.
function podPenaltySummary(penalty: NonNullable<PodResponse["penalty"]>): string | null {
  const parts: string[] = [];
  if (penalty.rematchPairs > 0) {
    parts.push(`${penalty.rematchPairs} rematch${penalty.rematchPairs === 1 ? "" : "es"}`);
  }
  if (penalty.spread > 0) {
    parts.push(`spread ${penalty.spread}`);
  }
  if (Math.round(penalty.total) > 0) {
    parts.push(`penalty ${Math.round(penalty.total)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function PodCard({
  pod,
  teamMode,
  scheme,
  matchFormat,
  winPoints,
  drawPoints,
  regionByPlayer,
  regionLabel,
  showPenalty,
  warnings,
  warningsExpanded,
  nameById,
  canEnter,
  crossGroup = false,
  title,
  renderMemberLeading,
  renderMemberBadge,
  onSubmit,
  onSubmitPlayerResult,
}: {
  pod: PodResponse;
  teamMode: boolean;
  scheme: PodScoringScheme;
  matchFormat: TournamentMatchFormat;
  winPoints: number;
  drawPoints: number;
  regionByPlayer?: Map<string, string | null>;
  regionLabel: (slug: string) => string;
  showPenalty: boolean;
  warnings: PairingWarning[];
  warningsExpanded: boolean;
  nameById: Map<string, string>;
  canEnter: boolean;
  /** The paired 3-player groups' shared match. */
  crossGroup?: boolean;
  title?: string;
  /** Rendered before the player's face; the bracket puts the seed pill here. */
  renderMemberLeading?: (playerId: string) => ReactNode;
  renderMemberBadge?: (playerId: string) => ReactNode;
  onSubmit: (podId: string, results: PodResultEntry[]) => Promise<void>;
  onSubmitPlayerResult?: (podId: string, playerId: string, gamePoints: number) => Promise<void>;
}) {
  const isMatch = teamMode || isMatchPairing(pod.size);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scoringPlayerId, setScoringPlayerId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState("");
  const reported = pod.resultStatus === "reported";
  const selfEntry = canEnter && onSubmitPlayerResult !== undefined;
  const enteredCount = pod.members.filter((member) => member.gamePoints !== null).length;
  const walkover = isWalkoverPod(pod);
  const penaltySummary = pod.penalty ? podPenaltySummary(pod.penalty) : null;

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

  // One row per side. In 2v2 the result lives on the side's first member and
  // teammates mirror it; a team never scores independently per player.
  function sideRow(members: PodMemberResponse[]) {
    const lead = members[0];
    if (!lead) {
      return null;
    }
    const name = teamDisplayName(members.map((member) => member.displayName));
    return (
      <li key={lead.teamId ?? lead.playerId} className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {renderMemberLeading?.(lead.playerId)}
          {isMatch ? (
            lead.gamePoints === null ? null : (
              <Badge
                variant="secondary"
                className="shrink-0 tabular-nums"
                title={`${lead.gamePoints} game points`}
              >
                {lead.gamePoints}
              </Badge>
            )
          ) : (
            <MemberSeedBadge placement={lead.placement} gamePoints={lead.gamePoints} />
          )}
          <UserAvatar name={name} size="sm" />
          <span className="truncate font-medium">{name}</span>
          {regionByPlayer?.get(lead.playerId) ? (
            <Badge variant="outline" className="shrink-0">
              {regionLabel(regionByPlayer.get(lead.playerId) ?? "")}
            </Badge>
          ) : null}
          {renderMemberBadge?.(lead.playerId)}
        </span>
        {selfEntry && scoringPlayerId === lead.playerId ? (
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
              aria-label={`Game points for ${name}`}
              className="h-7 w-16 tabular-nums"
            />
            <Button
              size="icon-sm"
              onClick={() => void handleSaveScore()}
              disabled={saving || parsePoints(scoreDraft) === null}
              aria-label={`Save score for ${name}`}
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
          // shrink-0: without it a long name squeezes this cluster
          // until the numbers wrap mid-figure.
          <span className="flex shrink-0 items-center gap-2 tabular-nums">
            {lead.points !== null && (
              <span
                className="font-semibold"
                title={`${formatScore(lead.points)} points from this round`}
              >
                +{formatScore(lead.points)}
              </span>
            )}
            {selfEntry ? (
              lead.gamePoints === null ? (
                <Button variant="secondary" size="xs" onClick={() => startScoring(lead)}>
                  Add score
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => startScoring(lead)}
                  aria-label={`Edit score for ${name}`}
                >
                  <PencilIcon />
                </Button>
              )
            ) : null}
          </span>
        )}
      </li>
    );
  }

  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2">
          <IconChip
            icon={isMatch ? SwordsIcon : UsersIcon}
            tone={reported ? "success" : "neutral"}
            size="sm"
            shape="round"
          />
          <span>
            {title ?? (teamMode ? `Match ${pod.podNumber}` : pairingLabel(pod.size, pod.podNumber))}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {crossGroup ? <Badge variant="info">Cross-group</Badge> : null}
            {showPenalty && !warningsExpanded ? (
              <WarningBadge warnings={warnings} nameById={nameById} regionLabel={regionLabel} />
            ) : null}
            {walkover ? (
              <Badge variant="muted">Walkover</Badge>
            ) : (
              <PodStatusBadge
                reported={reported}
                // A team shares one score, so reporting progress counts sides.
                enteredCount={teamMode ? Math.floor(enteredCount / 2) : enteredCount}
                size={teamMode ? 2 : pod.size}
              />
            )}
          </span>
        </CardTitle>
        {showPenalty && penaltySummary ? (
          <p className="text-muted-foreground text-sm">{penaltySummary}</p>
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
              teamMatch={teamMode}
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
              {(teamMode
                ? groupPodMembersByTeam(pod.members)
                : pod.members.map((member) => [member])
              ).flatMap((group, groupIndex) => [
                ...(teamMode && groupIndex > 0
                  ? [
                      <li
                        key={`vs-${groupIndex}`}
                        aria-hidden="true"
                        className="text-muted-foreground/60 py-0.5 text-center text-xs font-medium tracking-wide uppercase"
                      >
                        vs
                      </li>,
                    ]
                  : []),
                sideRow(group),
              ])}
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

function PodStatusBadge({
  reported,
  enteredCount,
  size,
}: {
  reported: boolean;
  enteredCount: number;
  size: number;
}) {
  if (reported) {
    return <Badge variant="success">Reported</Badge>;
  }
  return (
    <Badge variant={enteredCount > 0 ? "warning" : "muted"}>
      {enteredCount} of {size} in
    </Badge>
  );
}
