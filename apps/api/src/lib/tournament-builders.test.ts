import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type { OrganizationMemberWithName } from "../repositories/organizations.js";
import type {
  Tournament,
  TournamentParticipantWithUser,
  TournamentStaffWithName,
} from "../repositories/tournaments.js";
import { buildParticipantList, buildStaffList } from "./tournament-builders.js";

/**
 * Coverage for `resolveStaff` (unexported) runs through `buildStaffList`,
 * which is a thin `{ items }` wrapper around it — see the module's own
 * comment. Field-level row → response mapping (ISO timestamps, claim-token
 * visibility, etc.) is `tournament-presenters.test.ts`'s job; these tests
 * cover the orchestration: which rows surface, in what order, and with what
 * derived role.
 */

const TOURNAMENT_ID = "c0000000-0001-4000-a000-000000000001";
const ORG_ID = "b0000000-0001-4000-a000-000000000001";

function tournamentWithHost(hostType: "user" | "organization", hostOrgId: string | null = null) {
  return { id: TOURNAMENT_ID, hostType, hostOrgId } as unknown as Tournament;
}

function staffGrant(overrides: Partial<TournamentStaffWithName> = {}): TournamentStaffWithName {
  return {
    userId: "u-grant",
    name: "Grant User",
    role: "judge",
    addedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function orgMember(
  overrides: Partial<OrganizationMemberWithName> = {},
): OrganizationMemberWithName {
  return {
    userId: "u-member",
    name: "Member User",
    role: "judge",
    joinedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function participantRow(
  overrides: Partial<TournamentParticipantWithUser> = {},
): TournamentParticipantWithUser {
  return {
    id: "p1",
    tournamentId: TOURNAMENT_ID,
    userId: null,
    userName: null,
    displayName: "Player One",
    riotId: null,
    status: "active",
    droppedAfterRound: null,
    seed: null,
    teamId: null,
    region: null,
    fixedTable: null,
    claimSource: null,
    claimToken: "claim-token-1",
    claimedAt: null,
    claimBlockedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeRepos(options: {
  staff?: TournamentStaffWithName[];
  members?: OrganizationMemberWithName[];
  participants?: TournamentParticipantWithUser[];
}) {
  const listStaffWithNames = vi.fn().mockResolvedValue(options.staff ?? []);
  const listParticipantsWithUser = vi.fn().mockResolvedValue(options.participants ?? []);
  const listMembers = vi.fn().mockResolvedValue(options.members ?? []);
  const repos = {
    tournaments: { listStaffWithNames, listParticipantsWithUser },
    organizations: { listMembers },
  } as unknown as Repos;
  return { repos, listStaffWithNames, listParticipantsWithUser, listMembers };
}

describe("buildStaffList", () => {
  it("returns explicit grants unchanged when the host is a user", async () => {
    const grants = [staffGrant({ userId: "u1", role: "organizer" })];
    const { repos, listMembers } = makeRepos({ staff: grants });
    const result = await buildStaffList(repos, tournamentWithHost("user"));
    expect(result.items).toEqual([
      expect.objectContaining({ userId: "u1", role: "organizer", source: "grant", orgRole: null }),
    ]);
    expect(listMembers).not.toHaveBeenCalled();
  });

  it("falls back to grants when the org host has no hostOrgId (defensive)", async () => {
    const grants = [staffGrant({ userId: "u1" })];
    const { repos, listMembers } = makeRepos({ staff: grants });
    const result = await buildStaffList(repos, tournamentWithHost("organization", null));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ userId: "u1", source: "grant" });
    expect(listMembers).not.toHaveBeenCalled();
  });

  it("returns an empty list when there are no grants and no org host", async () => {
    const { repos } = makeRepos({});
    const result = await buildStaffList(repos, tournamentWithHost("user"));
    expect(result.items).toEqual([]);
  });

  it("maps org owner and manager to organizer, and judge to judge", async () => {
    const members = [
      orgMember({ userId: "u-owner", role: "owner" }),
      orgMember({ userId: "u-manager", role: "manager" }),
      orgMember({ userId: "u-judge", role: "judge" }),
    ];
    const { repos } = makeRepos({ members });
    const result = await buildStaffList(repos, tournamentWithHost("organization", ORG_ID));
    expect(result.items).toEqual([
      expect.objectContaining({
        userId: "u-owner",
        role: "organizer",
        source: "organization",
        orgRole: "owner",
      }),
      expect.objectContaining({
        userId: "u-manager",
        role: "organizer",
        source: "organization",
        orgRole: "manager",
      }),
      expect.objectContaining({
        userId: "u-judge",
        role: "judge",
        source: "organization",
        orgRole: "judge",
      }),
    ]);
  });

  it("dedupes a grant for a user who is also an org member, listing them once from the org", async () => {
    const members = [orgMember({ userId: "u1", role: "owner" })];
    const grants = [
      staffGrant({ userId: "u1", role: "judge" }),
      staffGrant({ userId: "u2", role: "organizer" }),
    ];
    const { repos } = makeRepos({ members, staff: grants });
    const result = await buildStaffList(repos, tournamentWithHost("organization", ORG_ID));
    expect(result.items.map((item) => item.userId)).toEqual(["u1", "u2"]);
    expect(result.items[0]).toMatchObject({
      userId: "u1",
      source: "organization",
      role: "organizer",
    });
    expect(result.items[1]).toMatchObject({ userId: "u2", source: "grant", role: "organizer" });
  });

  it("puts every org row before every grant row, regardless of grant order", async () => {
    const members = [orgMember({ userId: "u-org", role: "judge" })];
    const grants = [staffGrant({ userId: "u-grant-a" }), staffGrant({ userId: "u-grant-b" })];
    const { repos } = makeRepos({ members, staff: grants });
    const result = await buildStaffList(repos, tournamentWithHost("organization", ORG_ID));
    expect(result.items.map((item) => item.userId)).toEqual(["u-org", "u-grant-a", "u-grant-b"]);
  });
});

describe("buildParticipantList", () => {
  it("returns an empty list when the tournament has no participants", async () => {
    const { repos, listParticipantsWithUser } = makeRepos({});
    const result = await buildParticipantList(repos, TOURNAMENT_ID);
    expect(result.items).toEqual([]);
    expect(listParticipantsWithUser).toHaveBeenCalledWith(TOURNAMENT_ID);
  });

  it("maps a walk-in participant with no matching linked user", async () => {
    const row = participantRow({
      id: "p1",
      userId: null,
      userName: null,
      displayName: "Walk-in Wendy",
    });
    const { repos } = makeRepos({ participants: [row] });
    const result = await buildParticipantList(repos, TOURNAMENT_ID);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "p1",
        userId: null,
        userName: null,
        displayName: "Walk-in Wendy",
      }),
    ]);
  });

  it("carries every participant through in the repo's order, linked or not", async () => {
    const linked = participantRow({ id: "p1", userId: "u1", userName: "Alice" });
    const walkIn = participantRow({
      id: "p2",
      userId: null,
      userName: null,
      displayName: "Walk-in",
    });
    const { repos } = makeRepos({ participants: [linked, walkIn] });
    const result = await buildParticipantList(repos, TOURNAMENT_ID);
    expect(result.items.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(result.items[0]).toMatchObject({ userId: "u1", userName: "Alice" });
    expect(result.items[1]).toMatchObject({ userId: null, userName: null });
  });
});
