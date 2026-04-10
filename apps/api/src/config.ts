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

    appBaseUrl: env.BETTER_AUTH_URL ?? "",

    logRequests: env.LOG_REQUESTS === "true",
    logRequestBodies: env.LOG_REQUEST_BODIES === "true",
    logResponseBodies: env.LOG_RESPONSE_BODIES === "true",

    cron: {
      tcgplayerSchedule: env.CRON_TCGPLAYER,
      cardmarketSchedule: env.CRON_CARDMARKET,
      cardtraderSchedule: env.CRON_CARDTRADER,
      changelogSchedule: env.CRON_CHANGELOG,
    },

    changelogPath: env.CHANGELOG_PATH || "apps/web/src/CHANGELOG.md",
  } as const;
}

export function validateConfig(env: Record<string, string | undefined>): void {
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;
  const isProd = env.APP_ENV === "production";
  const requiredInProd = ["CORS_ORIGIN", "BETTER_AUTH_URL"] as const;

  const missing = [
    ...required.filter((name) => !env[name]),
    ...(isProd ? requiredInProd.filter((name) => !env[name]) : []),
  ];

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
