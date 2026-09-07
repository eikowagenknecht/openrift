import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { FriendGroupRole } from "@openrift/shared/types/api/friend-group";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Group, GroupMember } from "../repositories/friend-groups.js";

export interface GroupContext {
  group: Group;
  membership: GroupMember;
}

/** Resolves rename aliases (`previous_slug`) too, so old bookmarks and email links keep working. */
export async function loadGroupForMember(
  repos: Repos,
  slug: string,
  viewerId: string,
): Promise<GroupContext> {
  const group = await repos.friendGroups.getBySlugOrPrevious(slug);
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
  admin: 1,
  owner: 2,
};

const ROLE_MINIMUM_MESSAGE: Record<FriendGroupRole, string> = {
  member: "Members only",
  admin: "Admins only",
  owner: "Owner only",
};

export function hasRole(role: FriendGroupRole, minimum: FriendGroupRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Throws 403 unless the membership meets the minimum role. */
export function requireRole(membership: GroupMember, minimum: FriendGroupRole): void {
  if (!hasRole(membership.role, minimum)) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, ROLE_MINIMUM_MESSAGE[minimum]);
  }
}
