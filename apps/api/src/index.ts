import { createLogger } from "@openrift/shared/logger";
import { Cron } from "croner";

import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { createConfig, validateConfig } from "./config.js";
import { cronJobs } from "./cron-jobs.js";
import { createDb } from "./db/connect.js";
import { migrate } from "./db/migrate.js";
import { createRepos } from "./deps.js";
import { createEmailSender } from "./email.js";
import {
  refreshCardmarketPrices,
  refreshCardtraderPrices,
  refreshTcgplayerPrices,
} from "./services/price-refresh/index.js";
import { validateWellKnownSlugs } from "./services/validate-well-known.js";

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

// ── 2. Validate well-known reference data ──────────────────────────────────

log.info("Validating well-known slugs");
await validateWellKnownSlugs(db);

// ── 3. Register cron jobs (non-blocking timers) ─────────────────────────────

if (config.cron.enabled) {
  const repos = createRepos(db);
  const tcgLog = log.child({ service: "tcgplayer" });
  const cmLog = log.child({ service: "cardmarket" });

  const tcgSchedule = config.cron.tcgplayerSchedule;
  const cmSchedule = config.cron.cardmarketSchedule;

  cronJobs.tcgplayer = new Cron(tcgSchedule, { protect: true }, async () => {
    try {
      tcgLog.info("Starting price refresh");
      await refreshTcgplayerPrices(globalThis.fetch, repos, tcgLog);
      tcgLog.info("Price refresh complete");
    } catch (error) {
      tcgLog.error(error, "Price refresh failed");
    }
  });
  tcgLog.info(`Cron registered (${tcgSchedule})`);

  cronJobs.cardmarket = new Cron(cmSchedule, { protect: true }, async () => {
    try {
      cmLog.info("Starting price refresh");
      await refreshCardmarketPrices(globalThis.fetch, repos, cmLog);
      cmLog.info("Price refresh complete");
    } catch (error) {
      cmLog.error(error, "Price refresh failed");
    }
  });
  cmLog.info(`Cron registered (${cmSchedule})`);

  if (config.cardtraderApiToken) {
    const ctLog = log.child({ service: "cardtrader" });
    const ctSchedule = config.cron.cardtraderSchedule;

    cronJobs.cardtrader = new Cron(ctSchedule, { protect: true }, async () => {
      try {
        ctLog.info("Starting price refresh");
        await refreshCardtraderPrices(globalThis.fetch, repos, ctLog, config.cardtraderApiToken);
        ctLog.info("Price refresh complete");
      } catch (error) {
        ctLog.error(error, "Price refresh failed");
      }
    });
    ctLog.info(`Cron registered (${ctSchedule})`);
  }
}

// ── 4. Start server ─────────────────────────────────────────────────────────

const app = createApp({ db, auth, config, log });

Bun.serve({ fetch: app.fetch, port: config.port });
log.info(`API server listening on http://localhost:${config.port}`);

export { app };
