import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { sql } from "kysely";
import { z } from "zod/v4";

import { auth } from "./auth.js";
import { config } from "./config.js";
import { matchOrigin } from "./cors.js";
import { db } from "./db.js";
import { AppError } from "./errors.js";
import { activitiesRoute } from "./routes/activities.js";
import { adminRoute } from "./routes/admin/index.js";
import { cardsRoute } from "./routes/cards.js";
import { collectionsRoute } from "./routes/collections.js";
import { copiesRoute } from "./routes/copies.js";
import { decksRoute } from "./routes/decks.js";
import { shoppingListRoute } from "./routes/shopping-list.js";
import { sourcesRoute } from "./routes/sources.js";
import { tradeListsRoute } from "./routes/trade-lists.js";
import { wishListsRoute } from "./routes/wish-lists.js";
import type { Variables } from "./types.js";

const app = new Hono<{ Variables: Variables }>();

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono's onError API takes a callback
app.onError((err, c) => {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = { error: err.message, code: err.code };
    if (err.details !== undefined) {
      body.details = err.details;
    }
    return c.json(body, err.status as ContentfulStatusCode);
  }

  if (err instanceof z.ZodError) {
    return c.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR", details: err.issues },
      400,
    );
  }

  if (err instanceof SyntaxError) {
    return c.json({ error: "Invalid JSON in request body", code: "BAD_REQUEST" }, 400);
  }

  console.error(err);
  return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
});

app.use(
  "/api/*",
  cors({
    credentials: true,
    origin: (origin) => matchOrigin(origin, config.corsOrigin),
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

// Split into separate .get/.post — app.on() with method arrays + ** wildcards
// breaks Hono's router when other routes use fixed+param paths (e.g. /copies/count
// alongside /copies/:id).
app.get("/api/auth/*", (c) => auth.handler(c.req.raw));
app.post("/api/auth/*", (c) => auth.handler(c.req.raw));

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
app.route("/api", collectionsRoute);
app.route("/api", sourcesRoute);
app.route("/api", copiesRoute);
app.route("/api", activitiesRoute);
app.route("/api", decksRoute);
app.route("/api", wishListsRoute);
app.route("/api", tradeListsRoute);
app.route("/api", shoppingListRoute);

export { app };
