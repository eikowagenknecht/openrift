import { parseAppEnv } from "@openrift/shared/app-env";

export function createConfig(env: Record<string, string | undefined>) {
  const appEnv = parseAppEnv(env.APP_ENV);
  return {
    // The deployment environment, reported verbatim to Sentry (see index.ts)
    // so preview errors land in their own environment instead of polluting
    // production.
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

    cron: {
      tcgplayerSchedule: env.CRON_TCGPLAYER,
      cardmarketSchedule: env.CRON_CARDMARKET,
      cardtraderSchedule: env.CRON_CARDTRADER,
      changelogSchedule: env.CRON_CHANGELOG,
      // ADR-030 daily match digest. Defaults to once a day at 08:00 UTC; set
      // CRON_TRADE_DIGEST to an empty string to disable.
      tradeDigestSchedule: env.CRON_TRADE_DIGEST ?? "0 8 * * *",
      // ADR-030 coalesced trade-request flush. Runs every minute by default and
      // sends the follow-up once a sender→recipient burst has settled; set
      // CRON_TRADE_REQUEST_FLUSH to an empty string to disable.
      tradeRequestFlushSchedule: env.CRON_TRADE_REQUEST_FLUSH ?? "* * * * *",
      // ADR-030 coalesced trade-status flush (accepted / declined / cancelled).
      // Runs every minute by default and emails the party who didn't act once an
      // actor→recipient burst has settled; set CRON_TRADE_STATUS_FLUSH to an
      // empty string to disable.
      tradeStatusFlushSchedule: env.CRON_TRADE_STATUS_FLUSH ?? "* * * * *",
      // Meta archive sync. All four are unset by default, so a deployment that
      // has not opted in never reaches the sources; the admin UI's manual
      // triggers are how the sync is exercised there. Suggested production
      // values: each catalogue sync daily, rechecks every ten minutes.
      metaUvsgamesSyncSchedule: env.CRON_META_UVSGAMES_SYNC,
      metaUvsgamesRecheckSchedule: env.CRON_META_UVSGAMES_RECHECK,
      metaPlayloltcgSyncSchedule: env.CRON_META_PLAYLOLTCG_SYNC,
      metaPlayloltcgRecheckSchedule: env.CRON_META_PLAYLOLTCG_RECHECK,
    },

    // The meta sources. Overridable so a test deployment can point at a recorded
    // fixture server instead of the live APIs.
    metaSync: {
      baseUrl: env.META_SYNC_BASE_URL ?? "https://api.riftbound.uvsgames.com",
      playloltcgBaseUrl: env.META_PLAYLOLTCG_BASE_URL ?? "https://lol-api.playloltcg.com",
    },

    discordWebhooks: {
      newPrintings: env.DISCORD_WEBHOOK_NEW_PRINTINGS ?? null,
      changelog: env.DISCORD_WEBHOOK_CHANGELOG ?? null,
    },

    // Shared service secret authenticating the first-party Discord bot's
    // privileged endpoints (group lookups). Unset disables them entirely.
    discordBotApiSecret: env.DISCORD_BOT_API_SECRET ?? null,

    changelogPath: env.CHANGELOG_PATH || "apps/web/src/CHANGELOG.md",

    // Filenames under media/scan/ of the engine-versioned scanner assets.
    // They are uploaded once per engine version (never committed) with a
    // version in the name, because nginx serves /media/ as immutable.
    scan: {
      encoderFile: env.SCAN_ENCODER_FILE ?? "scan-encoder-v2.onnx",
      opencvFile: env.SCAN_OPENCV_FILE ?? "scan-opencv-v1.js",
    },
  } as const;
}

export function validateConfig(env: Record<string, string | undefined>): void {
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;
  // Preview is a prod-style build on a non-canonical domain — enforce the
  // same required vars as production.
  const isProd = parseAppEnv(env.APP_ENV) !== "development";
  const requiredInProd = ["CORS_ORIGIN", "BETTER_AUTH_URL"] as const;

  const missing = [
    ...required.filter((name) => !env[name]),
    ...(isProd ? requiredInProd.filter((name) => !env[name]) : []),
  ];

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // CORS runs with credentials enabled, and matchOrigin reflects the request
  // origin when CORS_ORIGIN is "*" — which would let any website make
  // authenticated requests against a signed-in session. Fail at boot instead.
  if (isProd && env.CORS_ORIGIN?.split(",").some((origin) => origin.trim() === "*")) {
    throw new Error(
      'CORS_ORIGIN must not be "*" outside development: credentialed CORS would reflect any origin. List explicit origins instead.',
    );
  }
}
