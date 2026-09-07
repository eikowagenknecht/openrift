// A team has no stored name: the pair of member display names is the
// identity. Every surface groups per-player rows into team rows through
// these helpers so the grouping rules can't drift apart.

import type { PodMemberResponse, PodStandingRow } from "@openrift/shared/types/api/pod-tournament";

export function teamDisplayName(memberNames: readonly string[]): string {
  return memberNames.join(" & ");
}

export function groupPodMembersByTeam(members: PodMemberResponse[]): PodMemberResponse[][] {
  const groups = new Map<string, PodMemberResponse[]>();
  for (const [index, member] of members.entries()) {
    const key = member.teamId ?? `solo-${index}`;
    const group = groups.get(key) ?? [];
    group.push(member);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function teamNamesById(
  rows: readonly { teamId: string | null; displayName: string }[],
): Map<string, string> {
  const names = new Map<string, string[]>();
  for (const row of rows) {
    if (row.teamId === null) {
      continue;
    }
    const list = names.get(row.teamId) ?? [];
    list.push(row.displayName);
    names.set(row.teamId, list);
  }
  return new Map([...names.entries()].map(([teamId, list]) => [teamId, teamDisplayName(list)]));
}

// Fixed teams share every stat by construction, so the first row of each team
// stands for the pair; only the display name changes.
export function collapseTeamStandings(standings: readonly PodStandingRow[]): PodStandingRow[] {
  const names = teamNamesById(standings);
  const seenTeams = new Set<string>();
  const rows: PodStandingRow[] = [];
  for (const row of standings) {
    if (row.teamId === null) {
      rows.push(row);
      continue;
    }
    if (seenTeams.has(row.teamId)) {
      continue;
    }
    seenTeams.add(row.teamId);
    rows.push({ ...row, displayName: names.get(row.teamId) ?? row.displayName });
  }
  return rows;
}
