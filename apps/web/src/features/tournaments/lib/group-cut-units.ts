import type {
  GroupStageGroupView,
  PodResponse,
  PodRoundResponse,
} from "@openrift/shared/types/api/pod-tournament";

export interface GroupUnit {
  key: string;
  label: string;
  groups: GroupStageGroupView[];
  playerIds: string[];
  roundsStarted: number;
  currentRoundReported: boolean;
  canStartNextRound: boolean;
  done: boolean;
  paired: boolean;
}

function unitLabel(labels: readonly string[]): string {
  return `Group ${labels.join(" · ")}`;
}

export function groupUnits(groups: readonly GroupStageGroupView[]): GroupUnit[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const taken = new Set<string>();
  const units: GroupUnit[] = [];
  for (const group of groups) {
    if (taken.has(group.id)) {
      continue;
    }
    taken.add(group.id);
    const partner = group.pairedGroupId === null ? undefined : byId.get(group.pairedGroupId);
    const members = partner === undefined ? [group] : [group, partner];
    if (partner) {
      taken.add(partner.id);
    }
    units.push({
      key: members.map((member) => member.id).join("+"),
      label: unitLabel(members.map((member) => member.label)),
      groups: members,
      playerIds: members.flatMap((member) => member.playerIds),
      roundsStarted: Math.max(...members.map((member) => member.roundsStarted)),
      currentRoundReported: members.every((member) => member.currentRoundReported),
      canStartNextRound: members.every((member) => member.canStartNextRound),
      done: members.every((member) => member.done),
      paired: members.length > 1,
    });
  }
  return units;
}

/** "Group C (round 2), Group D · E (round 3)": the groups the cut waits on. */
export function waitingUnitsLabel(units: readonly GroupUnit[]): string | null {
  const waiting = units.filter((unit) => !unit.done);
  if (waiting.length === 0) {
    return null;
  }
  return waiting
    .map((unit) => `${unit.label} (round ${Math.max(unit.roundsStarted, 1)})`)
    .join(", ");
}

export function groupLabelByPlayer(groups: readonly GroupStageGroupView[]): Map<string, string> {
  const byPlayer = new Map<string, string>();
  for (const group of groups) {
    for (const playerId of group.playerIds) {
      byPlayer.set(playerId, group.label);
    }
  }
  return byPlayer;
}

export function podsOfUnit(round: PodRoundResponse, unit: GroupUnit): PodResponse[] {
  const inUnit = new Set(unit.playerIds);
  return round.pods.filter((pod) => pod.members.some((member) => inUnit.has(member.playerId)));
}

/** The two players sit in different groups, which only the paired pair does. */
export function isCrossGroupPod(pod: PodResponse, labelByPlayer: Map<string, string>): boolean {
  const labels = new Set(
    pod.members.flatMap((member) => {
      const label = labelByPlayer.get(member.playerId);
      return label === undefined ? [] : [label];
    }),
  );
  return labels.size > 1;
}

/** A forfeit: placements decide the match and no games were played. */
export function isWalkoverPod(pod: PodResponse): boolean {
  return (
    pod.members.length > 0 &&
    pod.members.every((member) => member.placement !== null && member.gamePoints === null)
  );
}

/** "Ashe 2-0 Braum", "Ashe def. Braum" on a walkover, "Ashe vs Braum" unplayed. */
export function podScoreLine(pod: PodResponse): string {
  const ordered = pod.members.toSorted(
    (left, right) => (left.placement ?? 99) - (right.placement ?? 99),
  );
  const [first, second] = ordered;
  if (!first || !second) {
    return ordered.map((member) => member.displayName).join(" vs ");
  }
  if (first.placement === null) {
    return `${first.displayName} vs ${second.displayName}`;
  }
  if (isWalkoverPod(pod)) {
    return first.placement === second.placement
      ? `${first.displayName} and ${second.displayName} both forfeited`
      : `${first.displayName} def. ${second.displayName}`;
  }
  return `${first.displayName} ${first.gamePoints ?? 0}-${second.gamePoints ?? 0} ${second.displayName}`;
}

/** "Round 1 · Ashe 2-0 Braum · Caitlyn 2-1 Darius" */
export function roundSummaryLine(roundNumber: number, pods: readonly PodResponse[]): string {
  return [
    `Round ${roundNumber}`,
    ...pods
      .toSorted((left, right) => left.podNumber - right.podNumber)
      .map((pod) => podScoreLine(pod)),
  ].join(" · ");
}

export function unitReportProgress(pods: readonly PodResponse[]): {
  reported: number;
  total: number;
} {
  return {
    reported: pods.filter((pod) => pod.resultStatus === "reported").length,
    total: pods.length,
  };
}
