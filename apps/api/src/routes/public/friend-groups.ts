import type { FriendGroupJoinPreviewResponse } from "@openrift/shared";
import { publicFriendGroupsContract } from "@openrift/shared/contracts/public-friend-groups";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(publicFriendGroupsContract).$context<ApiContext>().use(requireUser);

/**
 * The anonymous group-code preview behind `/groups/join?code=…`, so someone
 * following an invite link reads the group's name before signing in.
 */
export const publicFriendGroupsRouter = {
  joinPreview: os.joinPreview.handler(
    async ({ input, context, errors }): Promise<FriendGroupJoinPreviewResponse> => {
      const { friendGroups } = context.repos;

      const group = await friendGroups.getByCode(input.code);
      if (!group) {
        throw errors.NOT_FOUND({ message: "Group not found" });
      }

      const viewer = await context.loadUser();
      const [members, existingMembership, existingInvite] = await Promise.all([
        friendGroups.listMembers(group.id),
        viewer ? friendGroups.getMembership(group.id, viewer.id) : undefined,
        viewer ? friendGroups.getInvite(group.id, viewer.id) : undefined,
      ]);

      const viewerStatus = existingMembership ? "member" : existingInvite ? "pending" : "available";

      return {
        id: group.id,
        slug: group.slug,
        name: group.name,
        description: group.description,
        memberCount: members.length,
        viewerStatus,
      };
    },
  ),
};
