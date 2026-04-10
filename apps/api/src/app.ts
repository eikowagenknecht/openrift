import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiErrorResponse } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";
import * as Sentry from "@sentry/bun";
import { rateLimiter } from "hono-rate-limiter";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Kysely } from "kysely";
import { z } from "zod";

import { matchOrigin } from "./cors.js";
import type { Database } from "./db/index.js";
import type { Services } from "./deps.js";
import { createRepos, createTransact, services as defaultServices } from "./deps.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { defaultIo } from "./io.js";
import type { Io } from "./io.js";
import { adminRoute } from "./routes/admin/index.js";
import { collectionEventsRoute } from "./routes/authenticated/collection-events.js";
import { collectionsRoute } from "./routes/authenticated/collections.js";
import { copiesRoute } from "./routes/authenticated/copies.js";
import { decksRoute } from "./routes/authenticated/decks.js";
import { preferencesRoute } from "./routes/authenticated/preferences.js";
import { shoppingListRoute } from "./routes/authenticated/shopping-list.js";
import { tradeListsRoute } from "./routes/authenticated/trade-lists.js";
import { wishListsRoute } from "./routes/authenticated/wish-lists.js";
import { cardsRoute } from "./routes/public/cards.js";
import { catalogRoute } from "./routes/public/catalog.js";
import { featureFlagsRoute } from "./routes/public/feature-flags.js";
import { healthRoute } from "./routes/public/health.js";
import { initRoute } from "./routes/public/init.js";
import { pricesRoute } from "./routes/public/prices.js";
import { rulesRoute } from "./routes/public/rules.js";
import { setsRoute } from "./routes/public/sets.js";
import { siteSettingsRoute } from "./routes/public/site-settings.js";
import { sitemapDataRoute } from "./routes/public/sitemap.js";
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

  const app = new OpenAPIHono<{ Variables: Variables }>();

  // ── Global error handler ────────────────────────────────────────────────
  // Normalizes all thrown errors into a consistent { error, code, details? } JSON shape.
  // In dev mode, details (stack traces, Zod issues) are included for debugging.
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono's onError API takes a callback
  app.onError((err, c) => {
    if (err instanceof AppError) {
      if (err.status >= 500) {
        Sentry.captureException(err, { extra: { method: c.req.method, path: c.req.path } });
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
      return c.json({ error: "Invalid JSON in request body", code: ERROR_CODES.BAD_REQUEST }, 400);
    }

    Sentry.captureException(err, { extra: { method: c.req.method, path: c.req.path } });
    log.error({ err, method: c.req.method, path: c.req.path }, "Unhandled error");
    const body: ApiErrorResponse = {
      error: "Internal server error",
      code: ERROR_CODES.INTERNAL_ERROR,
    };
    if (config.isDev) {
      body.details = { message: err.message, stack: err.stack };
    }
    return c.json(body, 500);
  });

  // ── Global middleware ───────────────────────────────────────────────────
  // CORS runs first so preflight OPTIONS requests are handled before any other work.
  app.use(
    "/api/*",
    cors({
      credentials: true,
      origin: (origin) => matchOrigin(origin, config.corsOrigin),
    }),
  );

  if (config.logRequests) {
    app.use("/api/*", logger());
  }

  const MAX_BODY_LOG_BYTES = 10_000;
  const truncateBody = (text: string) =>
    text.length > MAX_BODY_LOG_BYTES
      ? `${text.slice(0, MAX_BODY_LOG_BYTES)}... [truncated ${text.length - MAX_BODY_LOG_BYTES} bytes]`
      : text;
  const isTextualContentType = (contentType: string) =>
    contentType.includes("json") ||
    contentType.includes("text") ||
    contentType.includes("urlencoded");

  if (config.logRequestBodies) {
    app.use("/api/*", async (c, next) => {
      const method = c.req.method;
      const path = c.req.path;
      const hasBody = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
      // Skip auth endpoints to avoid logging credentials (passwords, OTPs, tokens).
      if (hasBody && !path.startsWith("/api/auth/")) {
        const contentType = c.req.header("content-type") ?? "";
        if (isTextualContentType(contentType)) {
          try {
            const text = await c.req.raw.clone().text();
            if (text.length > 0) {
              log.info({ method, path, body: truncateBody(text) }, "Request body");
            }
          } catch (error) {
            log.warn({ err: error, method, path }, "Failed to read request body for logging");
          }
        }
      }
      await next();
    });
  }

  if (config.logResponseBodies) {
    app.use("/api/*", async (c, next) => {
      await next();
      const method = c.req.method;
      const path = c.req.path;
      // Skip auth endpoints to avoid logging session tokens/cookies in responses.
      if (path.startsWith("/api/auth/")) {
        return;
      }
      const contentType = c.res.headers.get("content-type") ?? "";
      if (!isTextualContentType(contentType)) {
        return;
      }
      try {
        const text = await c.res.clone().text();
        if (text.length > 0) {
          log.info(
            { method, path, status: c.res.status, body: truncateBody(text) },
            "Response body",
          );
        }
      } catch (error) {
        log.warn({ err: error, method, path }, "Failed to read response body for logging");
      }
    });
  }

  // Make shared dependencies (repos, services, etc.) available via c.get() in all routes.
  app.use("/api/*", async (c, next) => {
    c.set("io", deps.io ?? defaultIo);
    c.set("auth", auth);
    c.set("config", config);
    c.set("repos", createRepos(db));
    c.set("services", services);
    c.set("transact", createTransact(db));
    await next();
  });

  // ── Auth ────────────────────────────────────────────────────────────────
  // Apply rate limiting only to sensitive auth endpoints (sign-in, sign-up, etc.).
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

  // Resolve the current user session (if any) so routes can access c.get("user").
  // Runs on all /api/* routes — public routes simply see user as null.
  app.use("/api/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    await next();
  });

  // ── OpenAPI spec & Swagger UI ──────────────────────────────────────────
  app.doc("/api/doc", {
    openapi: "3.1.0",
    info: {
      title: "OpenRift API",
      version: "1.0.0",
      description: [
        "**Authentication:** This API uses session cookies (Better Auth).",
        "Auth endpoints are not in this spec, they are proxied from `/api/auth/*`.",
        "",
        "To try authenticated endpoints in Swagger UI: sign in via the web app,",
        "then open this page on the API origin in the same browser.",
      ].join("\n"),
    },
  });
  app.get("/api/ui", swaggerUI({ url: "/api/doc" }));

  // Route registrations are chained so TypeScript preserves the full route
  // type map — the frontend RPC client (`AppType`) depends on this.
  return (
    app
      // ── Infrastructure (unversioned) ──────────────────────────────────────
      .route("/api", healthRoute)

      // ── Public routes (no auth required) ─────────────────────────────────
      .route("/api/v1", catalogRoute)
      .route("/api/v1", cardsRoute)
      .route("/api/v1", setsRoute)
      .route("/api/v1", sitemapDataRoute)
      .route("/api/v1", pricesRoute)
      .route("/api/v1", featureFlagsRoute)
      .route("/api/v1", initRoute)
      .route("/api/v1", siteSettingsRoute)
      .route("/api/v1", rulesRoute)

      // ── Authenticated routes (require a valid session) ──────────────────
      .route("/api/v1", collectionsRoute)
      .route("/api/v1", copiesRoute)
      .route("/api/v1", collectionEventsRoute)
      .route("/api/v1", decksRoute)
      .route("/api/v1", preferencesRoute)
      .route("/api/v1", wishListsRoute)
      .route("/api/v1", tradeListsRoute)
      .route("/api/v1", shoppingListRoute)

      // ── Admin routes (require admin role) ────────────────────────────────
      .route("/api/v1", adminRoute)
  );
}
