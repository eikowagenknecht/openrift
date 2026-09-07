import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const discordBotRedeemLinkSchema = z.object({
  code: z.string().min(1).max(64),
  guildId: z.string().min(1).max(32),
  guildName: z.string().max(200).nullish(),
});

export const discordBotRedeemLinkResponseSchema = z
  .object({
    groupSlug: z.string(),
    groupName: z.string(),
  })
  .openapi("DiscordBotRedeemLinkResponse");

export const discordBotTradelistHolderPrintingSchema = z
  .object({
    printingId: z.uuid(),
    quantity: z.number().int().positive(),
    listNames: z.array(z.string()),
  })
  .openapi("DiscordBotTradelistHolderPrinting");

export const discordBotTradelistHolderSchema = z
  .object({
    userName: z.string().nullable(),
    quantity: z.number().int().positive(),
    printings: z.array(discordBotTradelistHolderPrintingSchema),
  })
  .openapi("DiscordBotTradelistHolder");

export const discordBotTradelistHoldersResponseSchema = z
  .object({
    linked: z.boolean(),
    groupName: z.string().nullable(),
    holders: z.array(discordBotTradelistHolderSchema),
  })
  .openapi("DiscordBotTradelistHoldersResponse");

export const discordBotSetTradeChannelSchema = z.object({
  guildId: z.string().min(1).max(32),
  channelId: z.string().min(1).max(32),
  enabled: z.boolean(),
});

export const discordBotTradeChannelsResponseSchema = z
  .object({
    linked: z.boolean(),
    channelIds: z.array(z.string()),
  })
  .openapi("DiscordBotTradeChannelsResponse");

export const discordBotAllTradeChannelsResponseSchema = z
  .object({
    guilds: z.array(z.object({ guildId: z.string(), channelIds: z.array(z.string()) })),
  })
  .openapi("DiscordBotAllTradeChannelsResponse");

const TAG = "Discord Bot";

/**
 * Bearer auth against the single `DISCORD_BOT_API_SECRET` service secret, not a
 * session. Every call 401s when the secret is unset on the server.
 */
export const discordBotContract = {
  redeemLink: oc
    .route({
      method: "POST",
      path: "/api/v1/discord-bot/links",
      tags: [TAG],
      description:
        "Redeems a one-time link code generated in a friend group's settings, " +
        "binding the Discord guild to that group. Called by the bot's /link command.",
    })
    .meta({ auth: "bearer" })
    .input(discordBotRedeemLinkSchema)
    .errors({
      NOT_FOUND: { message: "Unknown or expired link code" },
      CONFLICT: { message: "Guild is already linked to another group" },
    })
    .output(discordBotRedeemLinkResponseSchema),
  tradelistHolders: oc
    .route({
      method: "GET",
      path: "/api/v1/discord-bot/guilds/{guildId}/cards/{cardId}/tradelist-holders",
      tags: [TAG],
      description:
        "Which members of the guild's linked group offer the card on a tradelist " +
        "shared with that group. Unlinked guilds get `linked: false`, never an error.",
    })
    .meta({ auth: "bearer" })
    .input(z.object({ guildId: z.string().min(1).max(32), cardId: z.uuid() }))
    .output(discordBotTradelistHoldersResponseSchema),
  setTradeChannel: oc
    .route({
      method: "POST",
      path: "/api/v1/discord-bot/guilds/{guildId}/trade-channels",
      tags: [TAG],
      description:
        "Opts one channel of a linked guild in or out of card-name scanning. " +
        "Called by the bot's /tradechannel command; unlinked guilds get `linked: false`.",
    })
    .meta({ auth: "bearer" })
    .input(discordBotSetTradeChannelSchema)
    .output(discordBotTradeChannelsResponseSchema),
  tradeChannels: oc
    .route({
      method: "GET",
      path: "/api/v1/discord-bot/trade-channels",
      tags: [TAG],
      description:
        "Every linked guild that has trade channels. The bot caches this in memory " +
        "and refreshes it periodically, since scanning is decided per message.",
    })
    .meta({ auth: "bearer" })
    .input(z.object({}))
    .output(discordBotAllTradeChannelsResponseSchema),
};

export type DiscordBotContract = typeof discordBotContract;
export type DiscordBotRedeemLinkResponse = z.infer<typeof discordBotRedeemLinkResponseSchema>;
export type DiscordBotTradelistHoldersResponse = z.infer<
  typeof discordBotTradelistHoldersResponseSchema
>;
export type DiscordBotTradeChannelsResponse = z.infer<typeof discordBotTradeChannelsResponseSchema>;
export type DiscordBotAllTradeChannelsResponse = z.infer<
  typeof discordBotAllTradeChannelsResponseSchema
>;
