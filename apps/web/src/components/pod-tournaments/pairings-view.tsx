import type {
  PairingWarning,
  PodMemberResponse,
  PodResponse,
  PodRoundResponse,
  PodScoringScheme,
  PodSnapshotPlayer,
  TournamentMatchFormat,
  TournamentPlayMode,
} from "@openrift/shared";
import { buildTeamUnits, collapseTeamPods, computePairingWarnings } from "@openrift/shared";
import {
  ArrowUpDownIcon,
  CheckIcon,
  MapPinIcon,
  PencilIcon,
  RepeatIcon,
  ScaleIcon,
  SwordsIcon,
  UserMinusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardRow } from "@/components/ui/card-list";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { IconChip } from "@/components/ui/icon-chip";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import type { StatStripItem } from "@/components/ui/stat-strip";
import { StatStrip } from "@/components/ui/stat-strip";
import { UserAvatar } from "@/components/user-avatar";
import { groupPodMembersByTeam, teamDisplayName, teamNamesById } from "@/lib/team-display";
import {
  isAllMatchRound,
  isMatchPairing,
  ordinalPlace,
  pairingLabel,
} from "@/lib/tournament-display";
import { cn } from "@/lib/utils";

import { snapshotToPlayers, WarningBadge, WarningList } from "./pairing-warnings";
import { parsePoints, PodResultForm } from "./pod-result-form";
import { formatScore } from "./standings-display";
import { SwissResultForm } from "./swiss-result-form";

interface PodResultEntry {
  playerId: string;
  gamePoints: number;
}

// Default region label: the raw slug (named so the React Compiler can reorder it).
const rawRegionSlug = (slug: string): string => slug;

interface PairingsViewProps {
  rounds: PodRoundResponse[];
  /** 2v2 renders each size-4 pod as a team match (two sides, team results). */
  playMode: TournamentPlayMode;
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
  /** Organizer round-level controls (re-roll / edit), rendered in the round header. */
  renderRoundActions?: (round: PodRoundResponse) => ReactNode;
  /** Empty-state title. Pass `""` to render nothing at all. */
  emptyMessage: string;
  /** Optional empty-state second line. */
  emptyDescription?: string;
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
  playMode,
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
  emptyDescription,
}: PairingsViewProps) {
  if (rounds.length === 0) {
    // The manual pairing editor takes the whole surface over, so it asks for no
    // empty state at all rather than an empty-string title.
    if (emptyMessage === "") {
      return null;
    }
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SwordsIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyMessage}</EmptyTitle>
          {emptyDescription ? <EmptyDescription>{emptyDescription}</EmptyDescription> : null}
        </EmptyHeader>
      </Empty>
    );
  }
  const teamMode = playMode === "2v2";
  const nameById = new Map<string, string>(
    rounds.flatMap((round) => [
      ...round.pods.flatMap((pod) =>
        pod.members.map((member) => [member.playerId, member.displayName] as const),
      ),
      ...round.byes.map((bye) => [bye.playerId, bye.displayName] as const),
    ]),
  );
  // In 2v2 the warnings speak in team ids (the pairing unit), so the name map
  // also resolves teams to their joined member names.
  const memberRows = rounds.flatMap((round) =>
    round.pods.flatMap((pod) =>
      pod.members.map((m) => ({ teamId: m.teamId ?? null, displayName: m.displayName })),
    ),
  );
  const teamNames = teamMode ? teamNamesById(memberRows) : new Map<string, string>();
  for (const [teamId, name] of teamNames) {
    nameById.set(teamId, name);
  }

  return (
    <div className="flex flex-col gap-8">
      {rounds.toReversed().map((round) => {
        // Warnings are organizer-only and only meaningful on the open round, where
        // the snapshot reflects the state the pairing was built from. In 2v2 they
        // are computed over team units — the level the pairing was drawn at — so
        // a team rematch reads as one warning, not four player pairs.
        const players = snapshot ? snapshotToPlayers(snapshot) : [];
        let warnings: PairingWarning[] = [];
        if (showPenalty && snapshot && round.status === "reporting") {
          if (teamMode) {
            const teams = buildTeamUnits(players);
            const { teamPods, invalidPodIndexes } = collapseTeamPods(
              toEnginePods(round),
              teams.teamByPlayer,
            );
            // Indexes stay parallel only with every pod collapsed; a transient
            // invalid pod (mid-drop state) just skips the warnings pass.
            warnings =
              invalidPodIndexes.length === 0
                ? computePairingWarnings(
                    teamPods,
                    teams.units,
                    round.byes.flatMap((bye) => {
                      const teamId = teams.teamByPlayer.get(bye.playerId);
                      return teamId === undefined ? [] : [teamId];
                    }),
                    round.pods.map((pod) => pod.podNumber),
                  )
                : [];
          } else {
            warnings = computePairingWarnings(
              toEnginePods(round),
              players,
              round.byes.map((bye) => bye.playerId),
              round.pods.map((pod) => pod.podNumber),
            );
          }
        }
        const podWarnings = new Map<number, PairingWarning[]>();
        for (const warning of warnings) {
          if (warning.kind === "repeatBye") {
            continue;
          }
          const list = podWarnings.get(warning.podIndex) ?? [];
          list.push(warning);
          podWarnings.set(warning.podIndex, list);
        }
        // Repeat byes are noted on the byed player's own row, not as a list. A
        // 2v2 repeat-bye names the team, so both members' rows carry it.
        const priorByesByPlayer = new Map<string, number>();
        for (const warning of warnings) {
          if (warning.kind !== "repeatBye") {
            continue;
          }
          if (teamMode) {
            for (const player of players) {
              if (player.teamId === warning.playerId) {
                priorByesByPlayer.set(player.id, warning.priorByes);
              }
            }
          } else {
            priorByesByPlayer.set(warning.playerId, warning.priorByes);
          }
        }
        const countLabel = [
          formatPodCount(round, teamMode),
          round.byes.length > 0
            ? `${round.byes.length} bye${round.byes.length === 1 ? "" : "s"}`
            : null,
        ]
          .filter((part) => part !== null)
          .join(" · ");

        return (
          <section key={round.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SectionHeading as="h3">Round {round.roundNumber}</SectionHeading>
                <Badge variant={round.status === "finalized" ? "secondary" : "warning"}>
                  {round.status === "finalized" ? "Finalized" : "Reporting"}
                </Badge>
                <span className="text-muted-foreground text-sm">{countLabel}</span>
              </div>
              {renderRoundActions ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {renderRoundActions(round)}
                </div>
              ) : null}
            </div>
            {showPenalty ? <RoundPenaltyStats round={round} /> : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {round.pods.map((pod, podIndex) => (
                <PodCard
                  key={pod.id}
                  pod={pod}
                  teamMode={teamMode}
                  scheme={scheme}
                  matchFormat={matchFormat}
                  winPoints={winPoints}
                  drawPoints={drawPoints}
                  regionByPlayer={regionByPlayer}
                  regionLabel={regionLabel}
                  showPenalty={showPenalty}
                  warnings={podWarnings.get(podIndex) ?? []}
                  warningsExpanded={warningsExpanded}
                  nameById={nameById}
                  canEnter={canEnterResult(round, pod)}
                  onSubmit={onSubmitResult}
                  onSubmitPlayerResult={onSubmitPlayerResult}
                />
              ))}
            </div>
            {round.byes.length > 0 ? (
              <ByesSection
                byes={round.byes}
                byePoints={byePoints}
                priorByesByPlayer={priorByesByPlayer}
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/**
 * "3 pods" / "4 matches" — an all-1v1 (Swiss) round pairs matches, not pods,
 * and every 2v2 team round is matches throughout.
 * @returns The pod count with the round's noun.
 */
function formatPodCount(round: PodRoundResponse, teamMode: boolean): string {
  const allMatches = teamMode || isAllMatchRound(round.pods.map((pod) => pod.size));
  if (allMatches) {
    return `${round.pods.length} match${round.pods.length === 1 ? "" : "es"}`;
  }
  return `${round.pods.length} pod${round.pods.length === 1 ? "" : "s"}`;
}

/**
 * The round's pairing quality, as the organizer's stat row: how much penalty the
 * engine had to accept, and where it had to accept it.
 * @returns The stat strip.
 */
function RoundPenaltyStats({ round }: { round: PodRoundResponse }) {
  const rematches = round.pods.reduce((sum, pod) => sum + (pod.penalty?.rematchPairs ?? 0), 0);
  const inThreePods = round.pods
    .filter((pod) => pod.size === 3)
    .reduce((sum, pod) => sum + pod.size, 0);
  const largestSpread = round.pods.reduce((max, pod) => Math.max(max, pod.penalty?.spread ?? 0), 0);
  const sameRegionPods = round.pods.filter((pod) => (pod.penalty?.sameRegion ?? 0) > 0).length;
  // An all-matches (Swiss) round has no 3-pod duty to report.
  const allMatches = isAllMatchRound(round.pods.map((pod) => pod.size));

  const items: StatStripItem[] = [
    {
      key: "penalty",
      value: Math.round(round.penaltyTotal ?? 0),
      label: "penalty",
      icon: ScaleIcon,
    },
    {
      key: "rematches",
      value: rematches,
      label: rematches === 1 ? "rematch" : "rematches",
      icon: RepeatIcon,
      iconTone: rematches === 0 ? "green" : "gold",
      tone: rematches === 0 ? "good" : "default",
    },
  ];
  if (!allMatches) {
    items.push({ key: "threePods", value: inThreePods, label: "in 3-pods", icon: UsersIcon });
  }
  if (sameRegionPods > 0) {
    items.push({
      key: "sameRegion",
      value: sameRegionPods,
      label: allMatches
        ? `same-region ${sameRegionPods === 1 ? "match" : "matches"}`
        : `same-region ${sameRegionPods === 1 ? "pod" : "pods"}`,
      icon: MapPinIcon,
      iconTone: "gold",
    });
  }
  const repeatedRegionPods = round.pods.filter(
    (pod) => (pod.penalty?.repeatedRegion ?? 0) > 0,
  ).length;
  if (repeatedRegionPods > 0) {
    items.push({
      key: "repeatedRegion",
      value: repeatedRegionPods,
      label: allMatches
        ? `repeat-region ${repeatedRegionPods === 1 ? "match" : "matches"}`
        : `repeat-region ${repeatedRegionPods === 1 ? "pod" : "pods"}`,
      icon: RepeatIcon,
      iconTone: "gold",
    });
  }
  items.push({
    key: "spread",
    value: largestSpread,
    label: "largest spread",
    icon: ArrowUpDownIcon,
  });

  return <StatStrip items={items} />;
}

/**
 * The round's sat-out players, as a section of their own. A player who has byed
 * before is flagged on their own row — a repeat bye is the thing an organizer
 * wants to catch here.
 * @returns The byes section.
 */
function ByesSection({
  byes,
  byePoints,
  priorByesByPlayer,
}: {
  byes: PodRoundResponse["byes"];
  byePoints: number;
  /** Byes each player had entering this round; organizer-only, open round only. */
  priorByesByPlayer: Map<string, number>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionHeading as="h3" size="sm" icon={UserMinusIcon} count={byes.length}>
        Byes
      </SectionHeading>
      <ul className="flex flex-col gap-1.5">
        {byes.map((bye) => {
          const priorByes = priorByesByPlayer.get(bye.playerId) ?? 0;
          return (
            <CardRow key={bye.playerId}>
              <span className="flex min-w-0 items-center gap-2">
                <UserAvatar name={bye.displayName} size="sm" />
                <span className="truncate font-medium">{bye.displayName}</span>
                {priorByes > 0 ? (
                  <Badge variant="warning">
                    {priorByes} earlier bye{priorByes === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </span>
              <span className="font-semibold tabular-nums">
                {byePoints > 0 ? `+${byePoints} bye` : "sat out · 0"}
              </span>
            </CardRow>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A member's seed in the pod: where they finished and the game points that put
 * them there. One badge rather than two figures at opposite ends of the row —
 * the placement is derived from the game points, so they are one fact, and
 * pairing them frees the row's end for the two point totals.
 *
 * Both halves are optional: an unreported pod has neither, and a pod mid
 * self-entry has game points before anyone has placed.
 *
 * @param placement The 1-based finish within the pod, or null before results.
 * @param gamePoints The member's game points, or null before they are entered.
 * @returns The badge, or null when there is nothing to seed with.
 */
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

/**
 * The pod's fairness internals, nonzero figures only — a clean pairing (no
 * rematches, no spread, no penalty) says nothing at all instead of a row of
 * zeros.
 * @returns The joined summary, or null when every figure is zero.
 */
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

function PodCard({
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
  onSubmit,
  onSubmitPlayerResult,
}: {
  pod: PodResponse;
  /** 2v2: the pod is a team match (two sides of two, one result per side). */
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
  onSubmit: (podId: string, results: PodResultEntry[]) => Promise<void>;
  onSubmitPlayerResult?: (podId: string, playerId: string, gamePoints: number) => Promise<void>;
}) {
  const isMatch = teamMode || isMatchPairing(pod.size);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Per-player self-entry: which member row is open for input, and its draft value.
  const [scoringPlayerId, setScoringPlayerId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState("");
  const reported = pod.resultStatus === "reported";
  const selfEntry = canEnter && onSubmitPlayerResult !== undefined;
  const enteredCount = pod.members.filter((member) => member.gamePoints !== null).length;
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

  // One row per side: a lone player in 1v1 and pods, the whole team in 2v2. A
  // team is one entity here — one name, one score, one points figure — and the
  // shared result lives on the side's first member (teammates mirror it).
  function sideRow(members: PodMemberResponse[]) {
    const lead = members[0];
    if (!lead) {
      return null;
    }
    const name = teamDisplayName(members.map((member) => member.displayName));
    return (
      <li key={lead.teamId ?? lead.playerId} className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {isMatch ? (
            // A match reads like a scoreboard: the side's score in front,
            // the winner evident from comparing the two rows — no
            // placement · Ng pod vocabulary.
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
              onClick={handleSaveScore}
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
            tone={reported ? "green" : "neutral"}
            size="sm"
            shape="round"
          />
          <span>{teamMode ? `Match ${pod.podNumber}` : pairingLabel(pod.size, pod.podNumber)}</span>
          <span className="ml-auto flex items-center gap-2">
            {showPenalty && !warningsExpanded ? (
              <WarningBadge warnings={warnings} nameById={nameById} regionLabel={regionLabel} />
            ) : null}
            <PodStatusBadge
              reported={reported}
              // A team shares one score, so reporting progress counts sides.
              enteredCount={teamMode ? Math.floor(enteredCount / 2) : enteredCount}
              size={teamMode ? 2 : pod.size}
            />
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
                // A quiet divider between the two sides of a team match.
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

/**
 * The pod's reporting state at a glance: green once every score is in, amber
 * while the pod is part-way (someone still owes a score), quiet before anyone
 * has entered anything.
 * @returns The status badge.
 */
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
