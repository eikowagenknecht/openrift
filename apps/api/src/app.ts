import type { Database } from "@openrift/shared/db";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Kysely } from "kysely";
import { z } from "zod/v4";

import { matchOrigin } from "./cors.js";
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
import type { Auth, Config, Variables } from "./types.js";

export interface AppDeps {
  db: Kysely<Database>;
  auth: Auth;
  config: Config;
}

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

export function createApp(deps: AppDeps) {
  const { db, auth, config } = deps;

  const app = new Hono<{ Variables: Variables }>()

    // ── Inject dependencies into every request context ───────────────────────
    .use("/api/*", async (c, next) => {
      c.set("db", db);
      c.set("auth", auth);
      c.set("config", config);
      await next();
    })

    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono's onError API takes a callback
    .onError((err, c) => {
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
    })

    .use(
      "/api/*",
      cors({
        credentials: true,
        origin: (origin) => matchOrigin(origin, config.corsOrigin),
      }),
    )

    .use("/api/auth/*", async (c, next) => {
      if (rateLimitedAuthPrefixes.some((p) => c.req.path.startsWith(p))) {
        return authRateLimit(c, next);
      }
      await next();
    })

    // Split into separate .get/.post — app.on() with method arrays + ** wildcards
    // breaks Hono's router when other routes use fixed+param paths (e.g. /copies/count
    // alongside /copies/:id).
    .get("/api/auth/*", (c) => auth.handler(c.req.raw))
    .post("/api/auth/*", (c) => auth.handler(c.req.raw))

    .use("/api/*", async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      c.set("user", session?.user ?? null);
      c.set("session", session?.session ?? null);
      await next();
    })

    .get("/api/health", async (c) => {
      try {
        await db.selectNoFrom((eb) => eb.lit(1).as("one")).execute();
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
    })

    .route("/api", cardsRoute)
    .route("/api", adminRoute)
    .route("/api", collectionsRoute)
    .route("/api", sourcesRoute)
    .route("/api", copiesRoute)
    .route("/api", activitiesRoute)
    .route("/api", decksRoute)
    .route("/api", wishListsRoute)
    .route("/api", tradeListsRoute)
    .route("/api", shoppingListRoute);

  return app;
}
