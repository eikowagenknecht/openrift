import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const discordBotRedeemLinkSchema = z.object({
  code: z.string().min(1).max(64),
  /** Discord guild snowflake (64-bit int as text). */
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
    /** Names of the shared lists the copies sit on, alphabetical. */
    listNames: z.array(z.string()),
  })
  .openapi("DiscordBotTradelistHolderPrinting");

export const discordBotTradelistHolderSchema = z
  .object({
    /** Display name only — the bot never sees account ids. */
    userName: z.string().nullable(),
    quantity: z.number().int().positive(),
    /** The same copies split by printing, most copies first. */
    printings: z.array(discordBotTradelistHolderPrintingSchema),
  })
  .openapi("DiscordBotTradelistHolder");

export const discordBotTradelistHoldersResponseSchema = z
  .object({
    /** False when the guild has no linked group; holders is then empty. */
    linked: z.boolean(),
    groupName: z.string().nullable(),
    holders: z.array(discordBotTradelistHolderSchema),
  })
  .openapi("DiscordBotTradelistHoldersResponse");

const TAG = "Discord Bot";

/**
 * oRPC contract for the first-party Discord bot's privileged reads (mounted at
 * `/api/v1/discord-bot`). Both procedures are `meta: "bearer"`: they
 * authenticate off `Authorization: Bearer <secret>` against the single
 * `DISCORD_BOT_API_SECRET` service secret (constant-time compare in the
 * handler), not a session — the guild→group link table does the scoping. When
 * the secret is unset on the server, every call 401s. Domain codes:
 * `redeemLink` → NOT_FOUND (unknown or expired code), CONFLICT (guild already
 * linked to another group).
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
};

export type DiscordBotContract = typeof discordBotContract;
export type DiscordBotRedeemLinkResponse = z.infer<typeof discordBotRedeemLinkResponseSchema>;
export type DiscordBotTradelistHoldersResponse = z.infer<
  typeof discordBotTradelistHoldersResponseSchema
>;
