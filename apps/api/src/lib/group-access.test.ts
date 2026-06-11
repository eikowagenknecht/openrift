import type { FriendGroupRole } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import type { GroupMember } from "../repositories/friend-groups.js";
import { hasRole, requireRole, ROLE_RANK } from "./group-access.js";

function membership(role: FriendGroupRole): GroupMember {
  return {
    groupId: "g1",
    userId: "u1",
    role,
    nickname: null,
    joinedAt: new Date(),
  };
}

describe("hasRole", () => {
  it("orders the hierarchy owner > admin > judge > member", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.judge);
    expect(ROLE_RANK.judge).toBeGreaterThan(ROLE_RANK.member);
  });

  it("passes when the role meets the minimum", () => {
    expect(hasRole("judge", "judge")).toBe(true);
    expect(hasRole("admin", "judge")).toBe(true);
    expect(hasRole("owner", "judge")).toBe(true);
    expect(hasRole("owner", "owner")).toBe(true);
    expect(hasRole("member", "member")).toBe(true);
  });

  it("fails when the role is below the minimum", () => {
    expect(hasRole("member", "judge")).toBe(false);
    expect(hasRole("judge", "admin")).toBe(false);
    expect(hasRole("admin", "owner")).toBe(false);
  });
});

describe("requireRole", () => {
  it("passes a judge for a judge minimum", () => {
    expect(() => requireRole(membership("judge"), "judge")).not.toThrow();
  });

  it("rejects a judge for an admin minimum with 403", () => {
    try {
      requireRole(membership("judge"), "admin");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(403);
    }
  });

  it("rejects a member for every elevated minimum", () => {
    expect(() => requireRole(membership("member"), "judge")).toThrow(AppError);
    expect(() => requireRole(membership("member"), "admin")).toThrow(AppError);
    expect(() => requireRole(membership("member"), "owner")).toThrow(AppError);
  });

  it("accepts every role for a member minimum", () => {
    for (const role of ["owner", "admin", "judge", "member"] as const) {
      expect(() => requireRole(membership(role), "member")).not.toThrow();
    }
  });
});
