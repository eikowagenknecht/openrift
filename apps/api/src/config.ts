export function createConfig(env: Record<string, string | undefined>) {
  return {
    isDev: (env.APP_ENV ?? "development") !== "production",
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? "",

    corsOrigin: env.CORS_ORIGIN,

    auth: {
      secret: env.BETTER_AUTH_SECRET ?? "",
      adminEmail: env.ADMIN_EMAIL,
      google:
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
          : undefined,
      discord:
        env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
          ? {
              clientId: env.DISCORD_CLIENT_ID,
              clientSecret: env.DISCORD_CLIENT_SECRET,
            }
          : undefined,
    },

    smtp: {
      configured: Boolean(env.SMTP_HOST),
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || "465"),
      secure: env.SMTP_SECURE !== "false",
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    },

    sentryDsn: env.SENTRY_DSN ?? "",

    cardtraderApiToken: env.CARDTRADER_API_TOKEN ?? "",

    logRequests: env.LOG_REQUESTS === "true",

    cron: {
      enabled: env.CRON_ENABLED === "true",
      tcgplayerSchedule: env.CRON_TCGPLAYER || "0 6 * * *",
      cardmarketSchedule: env.CRON_CARDMARKET || "15 6 * * *",
      cardtraderSchedule: env.CRON_CARDTRADER || "30 6 * * *",
    },
  } as const;
}

export function validateConfig(env: Record<string, string | undefined>): void {
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
