export interface BotEnv {
  token: string;
  apiUrl: string;
  siteUrl: string;
  apiSecret: string | null;
  tradeScanMode: "log" | "reply";
}

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
    // Anything other than an explicit "reply" stays quiet: a typo in this var
    // must not be what makes the bot start posting on its own.
    tradeScanMode: env.DISCORD_TRADE_SCAN_MODE === "reply" ? "reply" : "log",
  };
}
