import { parseAppEnv } from "@openrift/shared/app-env";

export function createConfig(env: Record<string, string | undefined>) {
  const appEnv = parseAppEnv(env.APP_ENV);
  return {
    appEnv,
    isDev: appEnv === "development",
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

    sentryDsn: env.SENTRY_DSN_API ?? "",
    sentryDsnSsr: env.SENTRY_DSN_SSR ?? "",

    buildId: env.BUILD_ID ?? "",

    cardtraderApiToken: env.CARDTRADER_API_TOKEN ?? "",

    cloudflare:
      env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ZONE_ID
        ? { apiToken: env.CLOUDFLARE_API_TOKEN, zoneId: env.CLOUDFLARE_ZONE_ID }
        : undefined,

    appBaseUrl: env.BETTER_AUTH_URL ?? "",

    logRequests: env.LOG_REQUESTS === "true",
    logRequestBodies: env.LOG_REQUEST_BODIES === "true",
    logResponseBodies: env.LOG_RESPONSE_BODIES === "true",

    metaSync: {
      baseUrl: env.META_SYNC_BASE_URL ?? "https://api.riftbound.uvsgames.com",
      playloltcgBaseUrl: env.META_PLAYLOLTCG_BASE_URL ?? "https://lol-api.playloltcg.com",
      topdeckBaseUrl: env.META_TOPDECK_BASE_URL ?? "https://topdeck.gg/api/",
      topdeckApiKey: env.TOPDECK_API_KEY ?? null,
    },

    discordWebhooks: {
      newPrintings: env.DISCORD_WEBHOOK_NEW_PRINTINGS ?? null,
      changelog: env.DISCORD_WEBHOOK_CHANGELOG ?? null,
    },

    discordBotApiSecret: env.DISCORD_BOT_API_SECRET ?? null,

    changelogPath: env.CHANGELOG_PATH || "apps/web/src/CHANGELOG.md",

    scan: {
      encoderFile: env.SCAN_ENCODER_FILE ?? "scan-encoder-v2.onnx",
      opencvFile: env.SCAN_OPENCV_FILE ?? "scan-opencv-v1.js",
    },
  } as const;
}

export function validateConfig(env: Record<string, string | undefined>): void {
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;
  // Preview is a prod-style build, so it needs the same required vars as production.
  const isProd = parseAppEnv(env.APP_ENV) !== "development";
  const requiredInProd = ["CORS_ORIGIN", "BETTER_AUTH_URL"] as const;

  const missing = [
    ...required.filter((name) => !env[name]),
    ...(isProd ? requiredInProd.filter((name) => !env[name]) : []),
  ];

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Credentialed CORS with origin "*" reflects the request origin, letting any
  // website make authenticated requests against a signed-in session.
  if (isProd && env.CORS_ORIGIN?.split(",").some((origin) => origin.trim() === "*")) {
    throw new Error(
      'CORS_ORIGIN must not be "*" outside development: credentialed CORS would reflect any origin. List explicit origins instead.',
    );
  }
}
