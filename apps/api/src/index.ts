import { migrate } from "@openrift/shared/db/migrate";
import { createLogger } from "@openrift/shared/logger";
import { refreshCardmarketPrices } from "@openrift/shared/services/refresh-cardmarket-prices";
import { refreshTcgplayerPrices } from "@openrift/shared/services/refresh-tcgplayer-prices";
import { Cron } from "croner";

import { cronJobs } from "./cron-jobs.js";
import { db } from "./db.js";

const DEFAULT_PORT = 3000;
const DEFAULT_TCG_SCHEDULE = "0 6 * * *";
const DEFAULT_CM_SCHEDULE = "15 6 * * *";

const log = createLogger("api");

log.info("Starting API server");

// ── 1. Run migrations (blocks until complete) ───────────────────────────────

log.info("Running migrations");
await migrate(db, log.child({ service: "migrate" }));

// ── 2. Register cron jobs (non-blocking timers) ─────────────────────────────

if (process.env.CRON_ENABLED === "true") {
  const tcgLog = log.child({ service: "tcgplayer" });
  const cmLog = log.child({ service: "cardmarket" });

  const tcgSchedule = process.env.CRON_TCGPLAYER || DEFAULT_TCG_SCHEDULE;
  const cmSchedule = process.env.CRON_CARDMARKET || DEFAULT_CM_SCHEDULE;

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

const { app } = await import("./app.js");

const port = Number(process.env.PORT ?? DEFAULT_PORT);

Bun.serve({ fetch: app.fetch, port });
log.info(`API server listening on http://localhost:${port}`);

export { app };
