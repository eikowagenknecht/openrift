import { ERROR_CODES } from "@openrift/shared";
import type { FriendGroupRole } from "@openrift/shared";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Group, GroupMember } from "../repositories/friend-groups.js";

export interface GroupContext {
  group: Group;
  membership: GroupMember;
}

/**
 * Loads the group by slug + the viewer's membership; 404 if either missing.
 * @returns The matched group and the viewer's membership row.
 */
export async function loadGroupForMember(
  repos: Repos,
  slug: string,
  viewerId: string,
): Promise<GroupContext> {
  const group = await repos.friendGroups.getBySlug(slug);
  if (!group) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
  }
  const membership = await repos.friendGroups.getMembership(group.id, viewerId);
  if (!membership) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
  }
  return { group, membership };
}

/** Higher rank = more power; a check passes when the member's rank meets the minimum. */
export const ROLE_RANK: Record<FriendGroupRole, number> = {
  member: 0,
  judge: 1,
  admin: 2,
  owner: 3,
};

const ROLE_MINIMUM_MESSAGE: Record<FriendGroupRole, string> = {
  member: "Members only",
  judge: "Judges only",
  admin: "Admins only",
  owner: "Owner only",
};

/**
 * Rank comparison for the linear role hierarchy (owner > admin > judge > member).
 * @returns True when `role` meets or exceeds `minimum`.
 */
export function hasRole(role: FriendGroupRole, minimum: FriendGroupRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Throws 403 unless the membership meets the minimum role. */
export function requireRole(membership: GroupMember, minimum: FriendGroupRole): void {
  if (!hasRole(membership.role, minimum)) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, ROLE_MINIMUM_MESSAGE[minimum]);
  }
}
