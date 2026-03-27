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
import { createRepos, createTransact, services as defaultServices } from "./deps.js";
import { AppError } from "./errors.js";
import { defaultIo } from "./io.js";
import type { Io } from "./io.js";
import { adminRoute } from "./routes/admin/index.js";
import { acquisitionSourcesRoute } from "./routes/authenticated/acquisition-sources.js";
import { activitiesRoute } from "./routes/authenticated/activities.js";
import { collectionsRoute } from "./routes/authenticated/collections.js";
import { copiesRoute } from "./routes/authenticated/copies.js";
import { decksRoute } from "./routes/authenticated/decks.js";
import { preferencesRoute } from "./routes/authenticated/preferences.js";
import { shoppingListRoute } from "./routes/authenticated/shopping-list.js";
import { tradeListsRoute } from "./routes/authenticated/trade-lists.js";
import { wishListsRoute } from "./routes/authenticated/wish-lists.js";
import { catalogRoute } from "./routes/public/catalog.js";
import { featureFlagsRoute } from "./routes/public/feature-flags.js";
import { healthRoute } from "./routes/public/health.js";
import { keywordStylesRoute } from "./routes/public/keyword-styles.js";
import { pricesRoute } from "./routes/public/prices.js";
import { siteSettingsRoute } from "./routes/public/site-settings.js";
import type { Auth, Config, Variables } from "./types.js";

export interface AppDeps {
  db: Kysely<Database>;
  auth: Auth;
  config: Config;
  log: Logger;
  io?: Io;
  services?: Partial<Services>;
}

/** 10 requests per minute per IP for sensitive auth endpoints */
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

    // ── Global error handler ────────────────────────────────────────────────
    // Normalizes all thrown errors into a consistent { error, code, details? } JSON shape.
    // In dev mode, details (stack traces, Zod issues) are included for debugging.
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
          details: err.issues.map((i) => ({ path: i.path, message: i.message })),
        };
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

    // ── Global middleware ───────────────────────────────────────────────────
    // CORS runs first so preflight OPTIONS requests are handled before any other work.
    .use(
      "/api/*",
      cors({
        credentials: true,
        origin: (origin) => matchOrigin(origin, config.corsOrigin),
      }),
    )

    // Make shared dependencies (repos, services, etc.) available via c.get() in all routes.
    .use("/api/*", async (c, next) => {
      c.set("io", deps.io ?? defaultIo);
      c.set("auth", auth);
      c.set("config", config);
      c.set("repos", createRepos(db));
      c.set("services", services);
      c.set("transact", createTransact(db));
      await next();
    })

    // ── Auth ────────────────────────────────────────────────────────────────
    // Apply rate limiting only to sensitive auth endpoints (sign-in, sign-up, etc.).
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

    // Resolve the current user session (if any) so routes can access c.get("user").
    // Runs on all /api/* routes — public routes simply see user as null.
    .use("/api/*", async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      c.set("user", session?.user ?? null);
      c.set("session", session?.session ?? null);
      await next();
    })

    // ── Infrastructure (unversioned) ────────────────────────────────────────
    .route("/api", healthRoute)

    // ── Public routes (no auth required) ───────────────────────────────────
    .route("/api/v1", catalogRoute)
    .route("/api/v1", pricesRoute)
    .route("/api/v1", featureFlagsRoute)
    .route("/api/v1", keywordStylesRoute)
    .route("/api/v1", siteSettingsRoute)

    // ── Authenticated routes (require a valid session) ────────────────────
    .route("/api/v1", collectionsRoute)
    .route("/api/v1", acquisitionSourcesRoute)
    .route("/api/v1", copiesRoute)
    .route("/api/v1", activitiesRoute)
    .route("/api/v1", decksRoute)
    .route("/api/v1", preferencesRoute)
    .route("/api/v1", wishListsRoute)
    .route("/api/v1", tradeListsRoute)
    .route("/api/v1", shoppingListRoute)

    // ── Admin routes (require admin role) ────────────────────────────────
    .route("/api/v1", adminRoute);

  return app;
}
