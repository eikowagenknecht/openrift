import { createDb } from "@openrift/shared/db/connect";
import { migrate } from "@openrift/shared/db/migrate";
import { createLogger } from "@openrift/shared/logger";
import {
  refreshCardmarketPrices,
  refreshTcgplayerPrices,
} from "@openrift/shared/services/price-refresh";
import { Cron } from "croner";

import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { createConfig, validateConfig } from "./config.js";
import { cronJobs } from "./cron-jobs.js";
import { createEmailSender } from "./email.js";

// ── Composition root ──────────────────────────────────────────────────────────

const env = process.env as Record<string, string | undefined>;
validateConfig(env);
const config = createConfig(env);

const { db, dialect } = createDb(config.databaseUrl);
const sendEmail = createEmailSender(config.smtp);
const auth = createAuth({ config, db, dialect, sendEmail });

const log = createLogger("api");
log.info("Starting API server");

// ── 1. Run migrations (blocks until complete) ───────────────────────────────

log.info("Running migrations");
await migrate(db, log.child({ service: "migrate" }));

// ── 2. Register cron jobs (non-blocking timers) ─────────────────────────────

if (config.cron.enabled) {
  const tcgLog = log.child({ service: "tcgplayer" });
  const cmLog = log.child({ service: "cardmarket" });

  const tcgSchedule = config.cron.tcgplayerSchedule;
  const cmSchedule = config.cron.cardmarketSchedule;

  cronJobs.tcgplayer = new Cron(tcgSchedule, { protect: true }, async () => {
    try {
      tcgLog.info("Starting price refresh");
      await refreshTcgplayerPrices(db, tcgLog);
      tcgLog.info("Price refresh complete");
    } catch (error) {
      tcgLog.error(error, "Price refresh failed");
    }
  });
  tcgLog.info(`Cron registered (${tcgSchedule})`);

  cronJobs.cardmarket = new Cron(cmSchedule, { protect: true }, async () => {
    try {
      cmLog.info("Starting price refresh");
      await refreshCardmarketPrices(db, cmLog);
      cmLog.info("Price refresh complete");
    } catch (error) {
      cmLog.error(error, "Price refresh failed");
    }
  });
  cmLog.info(`Cron registered (${cmSchedule})`);
}

// ── 3. Start server ─────────────────────────────────────────────────────────

const app = createApp({ db, auth, config });

Bun.serve({ fetch: app.fetch, port: config.port });
log.info(`API server listening on http://localhost:${config.port}`);

export { app };
