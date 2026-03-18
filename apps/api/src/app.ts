import type { ApiErrorResponse } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Kysely } from "kysely";
import { z } from "zod/v4";

import { matchOrigin } from "./cors.js";
import type { Database } from "./db/index.js";
import type { Services } from "./deps.js";
import { createRepos, services as defaultServices } from "./deps.js";
import { AppError } from "./errors.js";
import { defaultIo } from "./io.js";
import type { Io } from "./io.js";
import { activitiesRoute } from "./routes/activities.js";
import { adminRoute } from "./routes/admin/index.js";
import { catalogRoute } from "./routes/catalog.js";
import { collectionsRoute } from "./routes/collections.js";
import { copiesRoute } from "./routes/copies.js";
import { decksRoute } from "./routes/decks.js";
import { featureFlagsRoute } from "./routes/feature-flags.js";
import { healthRoute } from "./routes/health.js";
import { pricesRoute } from "./routes/prices.js";
import { shoppingListRoute } from "./routes/shopping-list.js";
import { sourcesRoute } from "./routes/sources.js";
import { tradeListsRoute } from "./routes/trade-lists.js";
import { wishListsRoute } from "./routes/wish-lists.js";
import type { Auth, Config, Variables } from "./types.js";

export interface AppDeps {
  db: Kysely<Database>;
  auth: Auth;
  config: Config;
  log: Logger;
  io?: Io;
  services?: Partial<Services>;
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
  const { db, auth, config, log } = deps;
  const services: Services = deps.services
    ? { ...defaultServices, ...deps.services }
    : defaultServices;

  const app = new Hono<{ Variables: Variables }>()

    // ── Inject dependencies into every request context ───────────────────────
    .use("/api/*", async (c, next) => {
      c.set("db", db);
      c.set("io", deps.io ?? defaultIo);
      c.set("auth", auth);
      c.set("config", config);
      c.set("repos", createRepos(db));
      c.set("services", services);
      await next();
    })

    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono's onError API takes a callback
    .onError((err, c) => {
      if (err instanceof AppError) {
        if (err.status >= 500) {
          log.error({ err, method: c.req.method, path: c.req.path }, "AppError 5xx");
        }
        const body: ApiErrorResponse = { error: err.message, code: err.code };
        if (config.isDev && err.details !== undefined) {
          body.details = err.details;
        }
        return c.json(body, err.status as ContentfulStatusCode);
      }

      if (err instanceof z.ZodError) {
        const body: ApiErrorResponse = {
          error: "Invalid request body",
          code: "VALIDATION_ERROR",
        };
        if (config.isDev) {
          body.details = err.issues;
        }
        return c.json(body, 400);
      }

      if (err instanceof HTTPException) {
        const body: ApiErrorResponse = { error: err.message, code: "HTTP_ERROR" };
        return c.json(body, err.status);
      }

      if (err instanceof SyntaxError) {
        return c.json({ error: "Invalid JSON in request body", code: "BAD_REQUEST" }, 400);
      }

      log.error({ err, method: c.req.method, path: c.req.path }, "Unhandled error");
      const body: ApiErrorResponse = {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      };
      if (config.isDev) {
        body.details = { message: err.message, stack: err.stack };
      }
      return c.json(body, 500);
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

    .route("/api", healthRoute)
    .route("/api", catalogRoute)
    .route("/api", pricesRoute)
    .route("/api", featureFlagsRoute)
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
