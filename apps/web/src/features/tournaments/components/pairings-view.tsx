import { buildTeamUnits, collapseTeamPods } from "@openrift/shared/pairing/team-units";
import type { PairingWarning } from "@openrift/shared/pairing/warnings";
import { computePairingWarnings } from "@openrift/shared/pairing/warnings";
import type {
  PodResponse,
  PodRoundResponse,
  PodScoringScheme,
  PodSnapshotPlayer,
} from "@openrift/shared/types/api/pod-tournament";
import type {
  TournamentMatchFormat,
  TournamentPlayMode,
} from "@openrift/shared/types/api/tournament";
import {
  ArrowUpDownIcon,
  MapPinIcon,
  RepeatIcon,
  ScaleIcon,
  SwordsIcon,
  UserMinusIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { CardRow } from "@/components/ui/card-list";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SectionHeading } from "@/components/ui/section-heading";
import type { StatStripItem } from "@/components/ui/stat-strip";
import { StatStrip } from "@/components/ui/stat-strip";
import { UserAvatar } from "@/components/user-avatar";
import { teamNamesById } from "@/features/tournaments/lib/team-display";
import { isAllMatchRound } from "@/features/tournaments/lib/tournament-display";

import { snapshotToPlayers } from "./pairing-warnings";
import { PodCard } from "./pod-card";

interface PodResultEntry {
  playerId: string;
  gamePoints: number;
}

// Named so the React Compiler can reorder it.
const rawRegionSlug = (slug: string): string => slug;

interface PairingsViewProps {
  rounds: PodRoundResponse[];
  playMode: TournamentPlayMode;
  scheme: PodScoringScheme;
  byePoints: number;
  matchFormat: TournamentMatchFormat;
  winPoints: number;
  drawPoints: number;
  regionByPlayer?: Map<string, string | null>;
  regionLabel?: (slug: string) => string;
  showPenalty: boolean;
  snapshot?: PodSnapshotPlayer[] | null;
  warningsExpanded?: boolean;
  canEnterResult: (round: PodRoundResponse, pod: PodResponse) => boolean;
  onSubmitResult: (podId: string, results: PodResultEntry[]) => Promise<void>;
  onSubmitPlayerResult?: (podId: string, playerId: string, gamePoints: number) => Promise<void>;
  renderRoundActions?: (round: PodRoundResponse) => ReactNode;
  emptyMessage: string;
  emptyDescription?: string;
}

// Members are in the same order as round.pods; index aligns with round.pods.
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
    // An empty-string title renders nothing at all.
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
        // Warnings only apply to the open round, and in 2v2 are computed over
        // team units, so a team rematch is one warning, not four player pairs.
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

// "3 pods" / "4 matches" — an all-1v1 (Swiss) round pairs matches, not pods,
// and every 2v2 team round is matches throughout.
function formatPodCount(round: PodRoundResponse, teamMode: boolean): string {
  const allMatches = teamMode || isAllMatchRound(round.pods.map((pod) => pod.size));
  if (allMatches) {
    return `${round.pods.length} match${round.pods.length === 1 ? "" : "es"}`;
  }
  return `${round.pods.length} pod${round.pods.length === 1 ? "" : "s"}`;
}

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
      iconTone: rematches === 0 ? "success" : "gold",
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

function ByesSection({
  byes,
  byePoints,
  priorByesByPlayer,
}: {
  byes: PodRoundResponse["byes"];
  byePoints: number;
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
