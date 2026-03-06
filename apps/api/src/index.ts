/* oxlint-disable no-console -- server startup logging */

import { migrate } from "@openrift/shared/db/migrate";
import { refreshCardmarketPrices } from "@openrift/shared/db/refresh-cardmarket-prices";
import { refreshTcgplayerPrices } from "@openrift/shared/db/refresh-tcgplayer-prices";
import { Cron } from "croner";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { cors } from "hono/cors";
import { sql } from "kysely";

import { auth } from "./auth.js";
import { matchOrigin } from "./cors.js";
import { cronJobs } from "./cron-jobs.js";
import { db } from "./db.js";
import { adminRoute } from "./routes/admin.js";
import { cardsRoute } from "./routes/cards.js";
import type { Variables } from "./types.js";

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

// ── 3. Hono app setup ───────────────────────────────────────────────────────

const app = new Hono<{ Variables: Variables }>();

app.use(
  "/api/*",
  cors({
    credentials: true,
    origin: (origin) => matchOrigin(origin, process.env.CORS_ORIGIN),
  }),
);

const authRateLimit = rateLimiter<{ Variables: Variables }>({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.req.header("x-real-ip") ?? "unknown",
});

const rateLimitedAuthPrefixes = [
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/auth/email-otp",
  "/api/auth/forget-password",
  "/api/auth/reset-password",
];

app.use("/api/auth/*", async (c, next) => {
  if (rateLimitedAuthPrefixes.some((p) => c.req.path.startsWith(p))) {
    return authRateLimit(c, next);
  }
  await next();
});

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

app.use("/api/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});

app.get("/api/health", async (c) => {
  try {
    await sql`SELECT 1`.execute(db);
  } catch {
    return c.json({ status: "db_unreachable" }, 503);
  }

  try {
    const result = await db.selectFrom("sets").select("id").limit(1).execute();
    if (result.length === 0) {
      return c.json({ status: "db_empty" }, 503);
    }
  } catch {
    return c.json({ status: "db_not_migrated" }, 503);
  }

  return c.json({ status: "ok" });
});

app.route("/api", cardsRoute);
app.route("/api", adminRoute);

const port = Number(process.env.PORT ?? 3000);

Bun.serve({ fetch: app.fetch, port });
console.log(`API server listening on http://localhost:${port}`);

export { app };
