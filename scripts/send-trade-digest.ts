import { createConfig } from "../apps/api/src/config.js";
import { createDb } from "../apps/api/src/db/connect.js";
import { createRepos } from "../apps/api/src/deps.js";
import { createEmailSender } from "../apps/api/src/email.js";
import { sendTradeMatchDigest } from "../apps/api/src/services/trade-match-digest.js";

// Runs the daily match digest immediately, without waiting for the cron.
//   bun --env-file=.env run scripts/send-trade-digest.ts [ISO timestamp]
// With no SMTP configured the emails are printed to this console.
type DigestDeps = Parameters<typeof sendTradeMatchDigest>[0];

const env = process.env as Record<string, string | undefined>;
const config = createConfig(env);
const sinceArg = process.argv[2];
const sinceTimestamp = sinceArg ? new Date(sinceArg) : new Date(0);

const { db } = createDb(config.databaseUrl);
const sendEmail = createEmailSender(config.smtp, config.isDev);

// The digest only calls `log.error`, for per-recipient failures.
const log = {
  error: (obj: unknown, msg?: string) => console.error(msg ?? "digest error", obj),
} as unknown as DigestDeps["log"];

const result = await sendTradeMatchDigest({
  repos: createRepos(db),
  log,
  sendEmail,
  appBaseUrl: config.appBaseUrl,
  unsubscribeSecret: config.auth.secret,
  sinceTimestamp,
});

console.log("Digest run complete:", result);
await db.destroy();
