export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",

  corsOrigin: process.env.CORS_ORIGIN,

  auth: {
    secret: process.env.BETTER_AUTH_SECRET ?? "",
    adminEmail: process.env.ADMIN_EMAIL,
    google:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
        : undefined,
    discord:
      process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
        ? {
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
          }
        : undefined,
  },

  smtp: {
    configured: Boolean(process.env.SMTP_HOST),
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || "465"),
    secure: process.env.SMTP_SECURE !== "false",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },

  cron: {
    enabled: process.env.CRON_ENABLED === "true",
    tcgplayerSchedule: process.env.CRON_TCGPLAYER || "0 6 * * *",
    cardmarketSchedule: process.env.CRON_CARDMARKET || "15 6 * * *",
  },
} as const;

export function validateConfig(): void {
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
