import type { OrganizationRole } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Organization, OrganizationMember } from "../repositories/organizations.js";
import type { Tournament, TournamentParticipant } from "../repositories/tournaments.js";
import {
  isHost,
  loadParticipant,
  loadTournament,
  requireHost,
  requireManage,
  requireStaff,
  resolveOrgHost,
} from "./tournament-access.js";

const TOURNAMENT_ID = "c0000000-0001-4000-a000-000000000001";
const ORG_ID = "b0000000-0001-4000-a000-000000000001";
const USER_ID = "a0000000-0001-4000-a000-000000000001";
const OTHER_USER_ID = "a0000000-0001-4000-a000-000000000002";

/** @returns A minimal tournament row, cast the way the invariants suite does, since these gates only read the host columns. */
function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: TOURNAMENT_ID,
    hostType: "user",
    hostUserId: USER_ID,
    hostOrgId: null,
    ...overrides,
  } as unknown as Tournament;
}

function participant(overrides: Partial<TournamentParticipant> = {}): TournamentParticipant {
  return {
    id: "p1",
    tournamentId: TOURNAMENT_ID,
    ...overrides,
  } as unknown as TournamentParticipant;
}

function org(): Organization {
  return {
    id: ORG_ID,
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function membership(role: OrganizationRole): OrganizationMember {
  return { orgId: ORG_ID, userId: USER_ID, role, joinedAt: new Date() };
}

function makeRepos(options: {
  tournament?: Tournament;
  isHostOrStaff?: boolean;
  org?: Organization;
  membership?: OrganizationMember;
  participant?: TournamentParticipant;
}) {
  const findById = vi.fn().mockResolvedValue(options.tournament);
  const isHostOrStaff = vi.fn().mockResolvedValue(options.isHostOrStaff ?? false);
  const findParticipantById = vi.fn().mockResolvedValue(options.participant);
  const findOrgById = vi.fn().mockResolvedValue(options.org);
  const getMembership = vi.fn().mockResolvedValue(options.membership);
  const repos = {
    tournaments: { findById, isHostOrStaff, findParticipantById },
    organizations: { findById: findOrgById, findBySlug: vi.fn(), getMembership },
  } as unknown as Repos;
  return { repos, findById, isHostOrStaff, findParticipantById, findOrgById, getMembership };
}

describe("loadTournament", () => {
  it("returns the tournament when found", async () => {
    const row = tournament();
    const { repos, findById } = makeRepos({ tournament: row });
    await expect(loadTournament(repos, TOURNAMENT_ID)).resolves.toBe(row);
    expect(findById).toHaveBeenCalledWith(TOURNAMENT_ID);
  });

  it("throws 404 when the tournament is missing", async () => {
    const { repos } = makeRepos({});
    await expect(loadTournament(repos, TOURNAMENT_ID)).rejects.toMatchObject({
      status: 404,
      message: "Tournament not found",
    });
  });
});

describe("isHost", () => {
  it("passes when the hosting user matches", async () => {
    const { repos, getMembership } = makeRepos({});
    const row = tournament({ hostType: "user", hostUserId: USER_ID });
    await expect(isHost(repos, row, USER_ID)).resolves.toBe(true);
    expect(getMembership).not.toHaveBeenCalled();
  });

  it("fails when the hosting user differs", async () => {
    const { repos } = makeRepos({});
    const row = tournament({ hostType: "user", hostUserId: USER_ID });
    await expect(isHost(repos, row, OTHER_USER_ID)).resolves.toBe(false);
  });

  it("passes for an org owner", async () => {
    const { repos } = makeRepos({ membership: membership("owner") });
    const row = tournament({ hostType: "organization", hostUserId: null, hostOrgId: ORG_ID });
    await expect(isHost(repos, row, USER_ID)).resolves.toBe(true);
  });

  it("passes for an org manager", async () => {
    const { repos } = makeRepos({ membership: membership("manager") });
    const row = tournament({ hostType: "organization", hostUserId: null, hostOrgId: ORG_ID });
    await expect(isHost(repos, row, USER_ID)).resolves.toBe(true);
  });

  it("fails for an org judge, who carries no host authority", async () => {
    const { repos } = makeRepos({ membership: membership("judge") });
    const row = tournament({ hostType: "organization", hostUserId: null, hostOrgId: ORG_ID });
    await expect(isHost(repos, row, USER_ID)).resolves.toBe(false);
  });

  it("fails when the user has no membership at all", async () => {
    const { repos } = makeRepos({});
    const row = tournament({ hostType: "organization", hostUserId: null, hostOrgId: ORG_ID });
    await expect(isHost(repos, row, USER_ID)).resolves.toBe(false);
  });

  it("fails when the org host has no hostOrgId set", async () => {
    const { repos, getMembership } = makeRepos({});
    const row = tournament({ hostType: "organization", hostUserId: null, hostOrgId: null });
    await expect(isHost(repos, row, USER_ID)).resolves.toBe(false);
    expect(getMembership).not.toHaveBeenCalled();
  });
});

describe("resolveOrgHost", () => {
  it("returns host columns for a manager", async () => {
    const { repos } = makeRepos({ org: org(), membership: membership("manager") });
    await expect(resolveOrgHost(repos, ORG_ID, USER_ID)).resolves.toEqual({
      hostType: "organization",
      hostUserId: null,
      hostOrgId: ORG_ID,
    });
  });

  it("returns host columns for an owner", async () => {
    const { repos } = makeRepos({ org: org(), membership: membership("owner") });
    await expect(resolveOrgHost(repos, ORG_ID, USER_ID)).resolves.toEqual({
      hostType: "organization",
      hostUserId: null,
      hostOrgId: ORG_ID,
    });
  });

  it("throws 404 with the host-specific message when the org is missing", async () => {
    const { repos } = makeRepos({});
    await expect(resolveOrgHost(repos, ORG_ID, USER_ID)).rejects.toMatchObject({
      status: 404,
      message: "Host organization not found",
    });
  });

  it("throws 403 for a judge, same as requireOrgRole's manager gate", async () => {
    const { repos } = makeRepos({ org: org(), membership: membership("judge") });
    await expect(resolveOrgHost(repos, ORG_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
      message: "Owner or manager only",
    });
  });

  it("throws 403 for a non-member", async () => {
    const { repos } = makeRepos({ org: org() });
    await expect(resolveOrgHost(repos, ORG_ID, USER_ID)).rejects.toBeInstanceOf(AppError);
  });
});

describe("requireManage", () => {
  it("resolves when the caller is host or organizer", async () => {
    const { repos, isHostOrStaff } = makeRepos({ isHostOrStaff: true });
    const row = tournament();
    await expect(requireManage(repos, row, USER_ID)).resolves.toBeUndefined();
    expect(isHostOrStaff).toHaveBeenCalledWith(TOURNAMENT_ID, USER_ID, ["organizer"]);
  });

  it("throws 403 with the manage-only message otherwise", async () => {
    const { repos } = makeRepos({ isHostOrStaff: false });
    const row = tournament();
    await expect(requireManage(repos, row, USER_ID)).rejects.toMatchObject({
      status: 403,
      message: "Host or organizer only",
    });
  });
});

describe("requireStaff", () => {
  it("resolves when the caller is host, organizer, or judge", async () => {
    const { repos, isHostOrStaff } = makeRepos({ isHostOrStaff: true });
    const row = tournament();
    await expect(requireStaff(repos, row, USER_ID)).resolves.toBeUndefined();
    expect(isHostOrStaff).toHaveBeenCalledWith(TOURNAMENT_ID, USER_ID, ["organizer", "judge"]);
  });

  it("throws 403 with the staff-only message otherwise", async () => {
    const { repos } = makeRepos({ isHostOrStaff: false });
    const row = tournament();
    await expect(requireStaff(repos, row, USER_ID)).rejects.toMatchObject({
      status: 403,
      message: "Host, organizer, or judge only",
    });
  });
});

describe("requireHost", () => {
  it("resolves for the hosting user", async () => {
    const { repos } = makeRepos({});
    const row = tournament({ hostType: "user", hostUserId: USER_ID });
    await expect(requireHost(repos, row, USER_ID)).resolves.toBeUndefined();
  });

  it("throws 403 with the host-only message for a non-host", async () => {
    const { repos } = makeRepos({});
    const row = tournament({ hostType: "user", hostUserId: USER_ID });
    await expect(requireHost(repos, row, OTHER_USER_ID)).rejects.toMatchObject({
      status: 403,
      message: "Host only",
    });
  });

  it("throws 403 for an org judge (host-only excludes implicit judge staff)", async () => {
    const { repos } = makeRepos({ membership: membership("judge") });
    const row = tournament({ hostType: "organization", hostUserId: null, hostOrgId: ORG_ID });
    await expect(requireHost(repos, row, USER_ID)).rejects.toMatchObject({ status: 403 });
  });
});

describe("loadParticipant", () => {
  it("returns the participant when it belongs to the tournament", async () => {
    const row = participant({ id: "p1", tournamentId: TOURNAMENT_ID });
    const { repos, findParticipantById } = makeRepos({ participant: row });
    await expect(loadParticipant(repos, TOURNAMENT_ID, "p1")).resolves.toBe(row);
    expect(findParticipantById).toHaveBeenCalledWith("p1");
  });

  it("throws 404 when no participant has that id", async () => {
    const { repos } = makeRepos({});
    await expect(loadParticipant(repos, TOURNAMENT_ID, "missing")).rejects.toMatchObject({
      status: 404,
      message: "Participant not found",
    });
  });

  it("throws 404 when the participant belongs to a different tournament", async () => {
    const row = participant({ id: "p1", tournamentId: "some-other-tournament" });
    const { repos } = makeRepos({ participant: row });
    await expect(loadParticipant(repos, TOURNAMENT_ID, "p1")).rejects.toMatchObject({
      status: 404,
      message: "Participant not found",
    });
  });
});
