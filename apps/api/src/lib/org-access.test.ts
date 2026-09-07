import type { OrganizationRole } from "@openrift/shared/types/api/tournament";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Organization, OrganizationMember } from "../repositories/organizations.js";
import {
  assertNotLastOwner,
  hasOrgRole,
  loadOrg,
  ORG_ROLE_RANK,
  requireOrgRole,
} from "./org-access.js";

const ORG_ID = "b0000000-0001-4000-a000-000000000001";
const USER_ID = "a0000000-0001-4000-a000-000000000001";

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
  byId?: Organization;
  bySlug?: Organization;
  membership?: OrganizationMember;
  owners?: number;
}) {
  const findById = vi.fn().mockResolvedValue(options.byId);
  const findBySlug = vi.fn().mockResolvedValue(options.bySlug);
  const getMembership = vi.fn().mockResolvedValue(options.membership);
  const lockForUpdate = vi.fn().mockResolvedValue(undefined);
  const countOwners = vi.fn().mockResolvedValue(options.owners ?? 0);
  const repos = {
    organizations: { findById, findBySlug, getMembership, lockForUpdate, countOwners },
  } as unknown as Repos;
  return { repos, findById, findBySlug, getMembership, lockForUpdate, countOwners };
}

describe("hasOrgRole", () => {
  it("orders the hierarchy owner > manager > judge", () => {
    expect(ORG_ROLE_RANK.owner).toBeGreaterThan(ORG_ROLE_RANK.manager);
    expect(ORG_ROLE_RANK.manager).toBeGreaterThan(ORG_ROLE_RANK.judge);
  });

  it("passes when the role meets the minimum", () => {
    expect(hasOrgRole("manager", "manager")).toBe(true);
    expect(hasOrgRole("owner", "manager")).toBe(true);
    expect(hasOrgRole("owner", "owner")).toBe(true);
    expect(hasOrgRole("judge", "judge")).toBe(true);
  });

  it("fails when the role is below the minimum", () => {
    expect(hasOrgRole("judge", "manager")).toBe(false);
    expect(hasOrgRole("manager", "owner")).toBe(false);
  });
});

describe("loadOrg", () => {
  it("looks a uuid up by id", async () => {
    const { repos, findById, findBySlug } = makeRepos({ byId: org() });
    await expect(loadOrg(repos, ORG_ID)).resolves.toMatchObject({ id: ORG_ID });
    expect(findById).toHaveBeenCalledWith(ORG_ID);
    expect(findBySlug).not.toHaveBeenCalled();
  });

  it("looks a non-uuid up by slug, so a slug never reaches the uuid column", async () => {
    const { repos, findById, findBySlug } = makeRepos({ bySlug: org() });
    await expect(loadOrg(repos, "summoner-skirmish")).resolves.toMatchObject({ id: ORG_ID });
    expect(findBySlug).toHaveBeenCalledWith("summoner-skirmish");
    expect(findById).not.toHaveBeenCalled();
  });

  it("throws 404 when the org is missing", async () => {
    const { repos } = makeRepos({});
    await expect(loadOrg(repos, ORG_ID)).rejects.toMatchObject({
      status: 404,
      message: "Organization not found",
    });
  });

  it("uses the caller's 404 message when given one", async () => {
    const { repos } = makeRepos({});
    await expect(loadOrg(repos, ORG_ID, "Host organization not found")).rejects.toMatchObject({
      message: "Host organization not found",
    });
  });
});

describe("requireOrgRole", () => {
  it("returns the membership when it meets the minimum", async () => {
    const { repos } = makeRepos({ membership: membership("manager") });
    await expect(requireOrgRole(repos, ORG_ID, USER_ID, "manager")).resolves.toMatchObject({
      role: "manager",
    });
  });

  it("accepts an owner for a manager minimum", async () => {
    const { repos } = makeRepos({ membership: membership("owner") });
    await expect(requireOrgRole(repos, ORG_ID, USER_ID, "manager")).resolves.toMatchObject({
      role: "owner",
    });
  });

  it("rejects a judge for a manager minimum with 403", async () => {
    const { repos } = makeRepos({ membership: membership("judge") });
    await expect(requireOrgRole(repos, ORG_ID, USER_ID, "manager")).rejects.toMatchObject({
      status: 403,
      message: "Owner or manager only",
    });
  });

  it("rejects a manager for an owner minimum with 403", async () => {
    const { repos } = makeRepos({ membership: membership("manager") });
    await expect(requireOrgRole(repos, ORG_ID, USER_ID, "owner")).rejects.toMatchObject({
      status: 403,
      message: "Owner only",
    });
  });

  it("rejects a non-member with 403, not a crash", async () => {
    const { repos } = makeRepos({});
    await expect(requireOrgRole(repos, ORG_ID, USER_ID, "judge")).rejects.toBeInstanceOf(AppError);
    await expect(requireOrgRole(repos, ORG_ID, USER_ID, "judge")).rejects.toMatchObject({
      status: 403,
      message: "Organization members only",
    });
  });
});

describe("assertNotLastOwner", () => {
  it("passes when another owner remains", async () => {
    const { repos, lockForUpdate } = makeRepos({ owners: 2 });
    await expect(assertNotLastOwner(repos, ORG_ID)).resolves.toBeUndefined();
    expect(lockForUpdate).toHaveBeenCalledWith(ORG_ID);
  });

  it("throws 400 for the last owner", async () => {
    const { repos } = makeRepos({ owners: 1 });
    await expect(assertNotLastOwner(repos, ORG_ID)).rejects.toMatchObject({
      status: 400,
      message: "An organization must keep at least one owner",
    });
  });

  it("throws 400 when the count is already zero", async () => {
    const { repos } = makeRepos({ owners: 0 });
    await expect(assertNotLastOwner(repos, ORG_ID)).rejects.toBeInstanceOf(AppError);
  });

  it("takes the row lock before counting, so a concurrent demotion can't race it", async () => {
    const calls: string[] = [];
    const { repos, lockForUpdate, countOwners } = makeRepos({ owners: 2 });
    lockForUpdate.mockImplementation(async () => {
      calls.push("lock");
    });
    countOwners.mockImplementation(async () => {
      calls.push("count");
      return 2;
    });
    await assertNotLastOwner(repos, ORG_ID);
    expect(calls).toEqual(["lock", "count"]);
  });
});
