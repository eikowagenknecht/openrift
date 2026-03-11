import { migrate } from "@openrift/shared/db/migrate";
import { refreshCardmarketPrices } from "@openrift/shared/services/refresh-cardmarket-prices";
import { refreshTcgplayerPrices } from "@openrift/shared/services/refresh-tcgplayer-prices";
import { Cron } from "croner";

import { cronJobs } from "./cron-jobs.js";
import { db } from "./db.js";

console.log("Starting API server...");

// ── 1. Run migrations (blocks until complete) ───────────────────────────────

console.log("Running migrations...");
await migrate(db);

// ── 2. Register cron jobs (non-blocking timers) ─────────────────────────────

if (process.env.CRON_ENABLED === "true") {
  cronJobs.tcgplayer = new Cron(
    process.env.CRON_TCGPLAYER || "0 6 * * *",
    { protect: true },
    async () => {
      try {
        console.log("[cron] Starting TCGPlayer price refresh...");
        await refreshTcgplayerPrices(db);
        console.log("[cron] TCGPlayer price refresh complete.");
      } catch (error) {
        console.error("[cron] TCGPlayer price refresh failed:", error);
      }
    },
  );

  cronJobs.cardmarket = new Cron(
    process.env.CRON_CARDMARKET || "15 6 * * *",
    { protect: true },
    async () => {
      try {
        console.log("[cron] Starting Cardmarket price refresh...");
        await refreshCardmarketPrices(db);
        console.log("[cron] Cardmarket price refresh complete.");
      } catch (error) {
        console.error("[cron] Cardmarket price refresh failed:", error);
      }
    },
  );

  console.log(
    `Cron jobs registered: TCGPlayer (${process.env.CRON_TCGPLAYER || "0 6 * * *"}), ` +
      `Cardmarket (${process.env.CRON_CARDMARKET || "15 6 * * *"})`,
  );
}

// ── 3. Start server ─────────────────────────────────────────────────────────

const { app } = await import("./app.js");

const port = Number(process.env.PORT ?? 3000);

Bun.serve({ fetch: app.fetch, port });
console.log(`API server listening on http://localhost:${port}`);

export { app };
