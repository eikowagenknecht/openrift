export interface BotEnv {
  /** Discord bot token from the developer portal's Bot tab. */
  token: string;
  /** Base URL of the OpenRift API, e.g. `http://api:3000` inside compose. */
  apiUrl: string;
  /** Public site origin used for card links and embed image URLs. */
  siteUrl: string;
  /**
   * Shared service secret for the API's privileged bot endpoints (group
   * linking, tradelist lookups). Null disables those features: /link isn't
   * registered and card replies carry no tradelist info.
   */
  apiSecret: string | null;
}

/**
 * Reads the bot's configuration from the environment. The localhost fallbacks
 * mirror the web app's `getSiteUrl()`: a missing var fails loudly in dev
 * instead of silently pointing at prod.
 *
 * @returns The resolved bot environment.
 * @throws {Error} When `DISCORD_BOT_TOKEN` is missing.
 */
export function readBotEnv(env: Record<string, string | undefined> = process.env): BotEnv {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not set");
  }
  return {
    token,
    apiUrl: env.API_INTERNAL_URL ?? "http://localhost:3000",
    siteUrl: env.SITE_URL ?? "http://localhost:5173",
    apiSecret: env.DISCORD_BOT_API_SECRET ?? null,
  };
}
