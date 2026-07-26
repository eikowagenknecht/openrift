// Presentation helpers for 2v2 team tournaments. A team has no stored name:
// the pair of member display names IS the identity, joined the same way
// everywhere, and every surface groups per-player rows into team rows through
// these helpers so the grouping rules can't drift apart.

import type { PodMemberResponse, PodStandingRow } from "@openrift/shared";

/**
 * The display name of a team, from its member names.
 * @returns `"Alice & Bob"`.
 */
export function teamDisplayName(memberNames: readonly string[]): string {
  return memberNames.join(" & ");
}

/**
 * Group a pod's members into its two sides for display: one group per team,
 * in first-appearance order. Members without a team (defensive: 1v1 pods, or
 * data from before the teams feature) each form their own group.
 *
 * @param members The pod's members in stored (seat) order.
 * @returns The member groups, sides first-seen first.
 */
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

/**
 * Team display names keyed by team id, from any rows that carry a player name
 * and team. Feeds the warning texts, which reference teams by id in 2v2.
 *
 * @param rows Player rows carrying `teamId` and `displayName`.
 * @returns Team id -> joined member names.
 */
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

/**
 * Collapse per-player standings rows into one row per team for display. Fixed
 * teams share every stat by construction, so the first row of each team stands
 * for the pair; only the display name changes (both members, joined). Rows
 * without a team pass through unchanged, and order is preserved (the API sorts
 * teammates adjacently).
 *
 * @param standings The per-player rows, best first.
 * @returns One row per team (and per teamless player), best first.
 */
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
