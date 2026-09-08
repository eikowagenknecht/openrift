import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  FriendGroupDiscordLinkCodeResponse,
  FriendGroupDiscordLinksResponse,
} from "@openrift/shared/types/api/friend-group";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { generateShareToken } from "../../../lib/share-token.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { loadGroupForMember, requireRole } from "../lib/group-access.js";

/** Discord link codes are one-shot and short-lived — 15 minutes to run /link. */
const DISCORD_LINK_CODE_TTL_MS = 15 * 60 * 1000;

const os = implement(friendGroupsContract).$context<ApiContext>().use(requireAuthedUser);

export const friendGroupsDiscordRouter = {
  // Linking a server is the group's consent that the bot may name members and
  // their shared-tradelist cards in replies there, so the whole surface is
  // admin-gated like the join code.
  createDiscordLinkCode: os.createDiscordLinkCode.handler(
    async ({ input, context }): Promise<FriendGroupDiscordLinkCodeResponse> => {
      const ctx = await loadGroupForMember(context.repos, input.slug, context.userId);
      requireRole(ctx.membership, "admin");

      const code = generateShareToken();
      const codeExpiresAt = new Date(Date.now() + DISCORD_LINK_CODE_TTL_MS);
      await context.repos.friendGroupDiscordLinks.createPendingLink({
        groupId: ctx.group.id,
        createdByUserId: context.userId,
        code,
        codeExpiresAt,
      });
      return { code, expiresAt: codeExpiresAt.toISOString() };
    },
  ),

  listDiscordLinks: os.listDiscordLinks.handler(
    async ({ input, context }): Promise<FriendGroupDiscordLinksResponse> => {
      const ctx = await loadGroupForMember(context.repos, input.slug, context.userId);
      requireRole(ctx.membership, "admin");

      const links = await context.repos.friendGroupDiscordLinks.listLinks(ctx.group.id);
      return {
        items: links.flatMap((link) =>
          link.guildId === null || link.linkedAt === null
            ? []
            : [
                {
                  id: link.id,
                  guildId: link.guildId,
                  guildName: link.guildName,
                  linkedAt: link.linkedAt.toISOString(),
                },
              ],
        ),
      };
    },
  ),

  deleteDiscordLink: os.deleteDiscordLink.handler(async ({ input, context }): Promise<void> => {
    const ctx = await loadGroupForMember(context.repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");

    const deleted = await context.repos.friendGroupDiscordLinks.deleteLink(
      ctx.group.id,
      input.linkId,
    );
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Link not found");
    }
  }),
};
