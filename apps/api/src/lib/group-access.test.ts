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
    joinedAt: new Date(),
  };
}

describe("hasRole", () => {
  it("orders the hierarchy owner > admin > member", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.member);
  });

  it("passes when the role meets the minimum", () => {
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole("owner", "owner")).toBe(true);
    expect(hasRole("member", "member")).toBe(true);
  });

  it("fails when the role is below the minimum", () => {
    expect(hasRole("member", "admin")).toBe(false);
    expect(hasRole("admin", "owner")).toBe(false);
  });
});

describe("requireRole", () => {
  it("passes an admin for an admin minimum", () => {
    expect(() => requireRole(membership("admin"), "admin")).not.toThrow();
  });

  it("rejects a member for an admin minimum with 403", () => {
    try {
      requireRole(membership("member"), "admin");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(403);
    }
  });

  it("rejects a member for every elevated minimum", () => {
    expect(() => requireRole(membership("member"), "admin")).toThrow(AppError);
    expect(() => requireRole(membership("member"), "owner")).toThrow(AppError);
  });

  it("accepts every role for a member minimum", () => {
    for (const role of ["owner", "admin", "member"] as const) {
      expect(() => requireRole(membership(role), "member")).not.toThrow();
    }
  });
});
