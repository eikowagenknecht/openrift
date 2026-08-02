// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash, timingSafeEqual } from "node:crypto";

import { ERROR_CODES } from "@openrift/shared";
import type {
  DiscordBotAllTradeChannelsResponse,
  DiscordBotRedeemLinkResponse,
  DiscordBotTradeChannelsResponse,
  DiscordBotTradelistHoldersResponse,
} from "@openrift/shared/contracts";
import { discordBotContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

/**
 * Rejects the call unless it carries the configured bot service secret as
 * `Authorization: Bearer <secret>`. Hash-then-compare keeps the comparison
 * constant-time without leaking length. An unset secret disables the
 * endpoints entirely (every call 401s).
 */
function requireBotSecret(context: ApiContext): void {
  const expected = context.config.discordBotApiSecret;
  const header = context.reqHeader("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  if (!expected || !provided) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Missing or unknown bot secret");
  }
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(providedHash, expectedHash)) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Missing or unknown bot secret");
  }
}

const os = implement(discordBotContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the first-party Discord bot's privileged reads. Both
 * are `meta: "bearer"` procedures gated by {@link requireBotSecret}; the
 * guild→group link table (migration 217) provides the actual scoping. The
 * holders response deliberately carries display names, per-printing counts and
 * the names of the shared lists only — no account ids, copy conditions, notes,
 * or pricing preferences leave the API.
 */
export const discordBotRouter = {
  redeemLink: os.redeemLink.handler(
    async ({ input, context }): Promise<DiscordBotRedeemLinkResponse> => {
      requireBotSecret(context);
      const result = await context.repos.friendGroupDiscordLinks.redeemCode({
        code: input.code,
        guildId: input.guildId,
        guildName: input.guildName?.trim() || null,
      });
      if (result.status === "unknown-code") {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Unknown or expired link code");
      }
      if (result.status === "guild-taken") {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Guild is already linked to another group");
      }
      const linked = await context.repos.friendGroupDiscordLinks.findByGuildId(input.guildId);
      if (!linked) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Unknown or expired link code");
      }
      return { groupSlug: linked.groupSlug, groupName: linked.groupName };
    },
  ),

  tradelistHolders: os.tradelistHolders.handler(
    async ({ input, context }): Promise<DiscordBotTradelistHoldersResponse> => {
      requireBotSecret(context);
      const linked = await context.repos.friendGroupDiscordLinks.findByGuildId(input.guildId);
      if (!linked) {
        return { linked: false, groupName: null, holders: [] };
      }
      const holders = await context.repos.friendGroupMatches.tradelistHoldersForCard({
        groupId: linked.groupId,
        cardId: input.cardId,
      });
      return {
        linked: true,
        groupName: linked.groupName,
        holders: holders.map((holder) => ({
          userName: holder.userName,
          quantity: holder.quantity,
          printings: holder.printings,
        })),
      };
    },
  ),

  setTradeChannel: os.setTradeChannel.handler(
    async ({ input, context }): Promise<DiscordBotTradeChannelsResponse> => {
      requireBotSecret(context);
      const channelIds = await context.repos.friendGroupDiscordLinks.setTradeChannel({
        guildId: input.guildId,
        channelId: input.channelId,
        enabled: input.enabled,
      });
      if (!channelIds) {
        return { linked: false, channelIds: [] };
      }
      return { linked: true, channelIds };
    },
  ),

  tradeChannels: os.tradeChannels.handler(
    async ({ context }): Promise<DiscordBotAllTradeChannelsResponse> => {
      requireBotSecret(context);
      const guilds = await context.repos.friendGroupDiscordLinks.listTradeChannels();
      return { guilds };
    },
  ),
};
