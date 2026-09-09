import { swaggerUI } from "@hono/swagger-ui";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { Logger } from "@openrift/shared/logger";
import type { ApiErrorResponse } from "@openrift/shared/types/api/error";
import * as Sentry from "@sentry/bun";
import { isAPIError } from "better-auth/api";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Kysely } from "kysely";
import { z } from "zod";

import { matchOrigin } from "./cors.js";
import type { Database } from "./db/tables.js";
import type { Services } from "./deps.js";
import { createRepos, createServices, createTransact } from "./deps.js";
import type { createEmailSender } from "./email.js";
import { AppError, codeForStatus } from "./errors.js";
import { defaultIo } from "./io.js";
import type { Io } from "./io.js";
import { loadSession } from "./middleware/load-session.js";
import { createMetricsMiddleware } from "./middleware/metrics.js";
import { otelRequestMiddleware } from "./middleware/otel-request.js";
import { requireAdmin } from "./middleware/require-admin.js";
import { versionHeadersMiddleware } from "./middleware/version-headers.js";
import { mountCardSubmissionsMiddleware } from "./modules/candidates/routes/authenticated-card-submissions.js";
import { mountAdminPrintingPostImage } from "./modules/catalog/routes/admin-printing-post-image.js";
import { createPublicChatRoute } from "./modules/chat/routes/public-chat.js";
import { collectionImageRoute } from "./modules/collections/routes/authenticated-collection-image.js";
import { deckImageRoute } from "./modules/decks/routes/authenticated-deck-image.js";
import { listImageRoute } from "./modules/lists/routes/authenticated-list-image.js";
import { mountMetaSubmissionsMiddleware } from "./modules/meta/routes/authenticated-meta-submissions.js";
import { mountScanReportsMiddleware } from "./modules/scan/routes/authenticated-scan-reports.js";
import { tierListImageRoute } from "./modules/stage/routes/authenticated-tier-list-image.js";
import { mountAdminSentryTest } from "./modules/system/routes/admin-sentry-test.js";
import { healthRoute } from "./modules/system/routes/public-health.js";
import { publicOembedRoute } from "./modules/system/routes/public-oembed.js";
import { sentryTunnelRoute } from "./modules/system/routes/public-sentry-tunnel.js";
import { publicShareImagesRoute } from "./modules/system/routes/public-share-images.js";
import {
  SWAGGER_ASSETS_BASE_URL,
  swaggerAssetsRoute,
} from "./modules/system/routes/public-swagger-assets.js";
import type { JobScheduler } from "./modules/system/services/job-scheduler.js";
import { renderPoolStats } from "./modules/system/services/render-pool.js";
import { mountDeckCheckIngestMiddleware } from "./modules/tournaments/routes/public-deck-check-ingest.js";
import { mapAuthError } from "./modules/users/lib/better-auth-error.js";
import { unsubscribeOneClickRoute } from "./modules/users/routes/public-unsubscribe-one-click.js";
import { generateContractOpenAPIDocument } from "./openapi-doc.js";
import { ETAG_PATHS, immutableWhenVersionMatches } from "./orpc/cache-policy.js";
import { buildApiContext } from "./orpc/context.js";
import { createApiHandler } from "./orpc/router.js";
import type { Auth, Config, Variables } from "./types.js";

export interface AppDeps {
  db: Kysely<Database>;
  auth: Auth;
  config: Config;
  log: Logger;
  io?: Io;
  services?: Partial<Services>;
  scheduler?: JobScheduler;
  sendEmail?: ReturnType<typeof createEmailSender>;
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
  const built = createServices(
    deps.sendEmail
      ? {
          sendEmail: deps.sendEmail,
          appBaseUrl: config.appBaseUrl,
          unsubscribeSecret: config.auth.secret,
          log,
        }
      : undefined,
  );
  const services: Services = deps.services ? { ...built, ...deps.services } : built;

  const app = new Hono<{ Variables: Variables }>();

  const repos = createRepos(db);
  const transact = createTransact(db);

  // oRPC encodes handler throws into a Response, so they never reach the Hono `onError` below.
  const apiHandler = createApiHandler(log);

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
        code: ERROR_CODES.VALIDATION_ERROR,
        details: err.issues.map((i) => ({ path: i.path, message: i.message })),
      };
      return c.json(body, 400);
    }

    if (err instanceof HTTPException) {
      const body: ApiErrorResponse = { error: err.message, code: codeForStatus(err.status) };
      return c.json(body, err.status);
    }

    if (err instanceof SyntaxError) {
      return c.json({ error: "Invalid JSON in request body", code: ERROR_CODES.BAD_REQUEST }, 400);
    }

    // better-auth throws better-call's APIError, a plain Error subclass matching none of the branches above.
    if (isAPIError(err)) {
      const { status, code, message, retryAfterSeconds } = mapAuthError(err);
      if (status >= 500) {
        Sentry.captureException(err, { extra: { method: c.req.method, path: c.req.path } });
        log.error({ err, method: c.req.method, path: c.req.path }, "better-auth APIError 5xx");
      }
      const body: ApiErrorResponse = { error: message, code };
      const headers =
        retryAfterSeconds === undefined ? undefined : { "Retry-After": String(retryAfterSeconds) };
      return c.json(body, status as ContentfulStatusCode, headers);
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

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json(
        { error: "Not found", code: ERROR_CODES.NOT_FOUND } satisfies ApiErrorResponse,
        404,
      );
    }
    return c.text("Not Found", 404);
  });

  // Registered before metrics + deps + auth middlewares so they all run inside this span.
  app.use("/api/*", otelRequestMiddleware);

  // Registered after otelRequestMiddleware so exemplars carry the active span's trace ID.
  const { printMetrics, registerMetrics } = createMetricsMiddleware({
    renderStats: renderPoolStats,
  });
  app.use("*", registerMetrics);
  app.get("/metrics", printMetrics);

  // CORS runs first so preflight OPTIONS requests are handled before any other work.
  app.use(
    "/api/*",
    cors({
      credentials: true,
      origin: (origin) => matchOrigin(origin, config.corsOrigin),
      exposeHeaders: ["X-Build-Id", "X-Api-Format"],
    }),
  );

  app.use("/api/*", versionHeadersMiddleware(config.buildId));

  if (config.logRequests) {
    app.use("/api/*", async (c, next) => {
      const start = performance.now();
      const reqSize = Number(c.req.header("content-length") ?? 0);
      await next();
      const ms = (performance.now() - start).toFixed(0);
      // Bun sets Content-Length only when serializing to the socket, downstream of here.
      let resSize = Number(c.res.headers.get("content-length") ?? 0);
      if (config.isDev && resSize === 0) {
        const buffered = await c.res.clone().arrayBuffer();
        resSize = buffered.byteLength;
      }
      const fmtSize = (bytes: number) =>
        bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
      const parts = [`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`];
      if (reqSize > 0) {
        parts.push(`req=${fmtSize(reqSize)}`);
      }
      if (resSize > 0) {
        parts.push(`res=${fmtSize(resSize)}`);
      }
      log.info(parts.join(" "));
    });
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

  app.use("/api/*", async (c, next) => {
    c.set("io", deps.io ?? defaultIo);
    c.set("auth", auth);
    c.set("config", config);
    c.set("repos", repos);
    c.set("services", services);
    c.set("transact", transact);
    c.set("scheduler", deps.scheduler);
    await next();
  });

  // DISABLE_AUTH_RATE_LIMIT lets the e2e harness opt out; auth.setup re-runs in
  // tight succession would otherwise trip the limiter and fail.
  const authRateLimitDisabled = process.env.DISABLE_AUTH_RATE_LIMIT === "1";
  app.use("/api/auth/*", async (c, next) => {
    if (!authRateLimitDisabled && rateLimitedAuthPrefixes.some((p) => c.req.path.startsWith(p))) {
      return authRateLimit(c, next);
    }
    await next();
  });

  // Split into separate .get/.post — app.on() with method arrays + ** wildcards
  // breaks Hono's router when other routes use fixed+param paths (e.g.
  // /copies/move alongside /copies/:id).
  app.get("/api/auth/*", (c) => auth.handler(c.req.raw));
  app.post("/api/auth/*", (c) => auth.handler(c.req.raw));

  const ADMIN_DOC_PREFIX = "/api/admin/";
  const filterPaths = <TDoc extends { paths?: Record<string, unknown> }>(
    doc: TDoc,
    keep: (path: string) => boolean,
  ): TDoc => ({
    ...doc,
    paths: Object.fromEntries(Object.entries(doc.paths ?? {}).filter(([path]) => keep(path))),
  });

  const publicDocInfo = {
    title: "OpenRift API",
    version: "1.0.0",
    description: [
      "**Authentication:** This API uses session cookies (Better Auth).",
      "Auth endpoints are not in this spec, they are proxied from `/api/auth/*`.",
      "Admin endpoints live in a separate spec at `/api/admin/doc`.",
      "",
      "To try authenticated endpoints in Swagger UI: sign in via the web app,",
      "then open this page on the API origin in the same browser.",
    ].join("\n"),
  } as const;
  const adminDocInfo = {
    title: "OpenRift Admin API",
    version: "1.0.0",
    description: "Admin-only operations, mounted under `/api/admin/v1` (require an admin session).",
  } as const;

  const buildDoc = async (info: { title: string; version: string; description: string }) => {
    const contractDoc = await generateContractOpenAPIDocument();
    return {
      ...contractDoc,
      openapi: "3.1.0",
      info,
      components: {
        ...contractDoc.components,
        securitySchemes: {
          ...contractDoc.components?.securitySchemes,
          cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
          bearerAuth: { type: "http", scheme: "bearer" },
          // Same cookie as cookieAuth; the requireAdmin middleware on /api/admin/v1/* enforces the role.
          adminAuth: {
            type: "apiKey",
            in: "cookie",
            name: "better-auth.session_token",
            description: "Session cookie of a user with the admin role.",
          },
        },
      },
    };
  };

  app.get("/api/doc", async (c) => {
    const doc = await buildDoc(publicDocInfo);
    return c.json(filterPaths(doc, (path) => !path.startsWith(ADMIN_DOC_PREFIX)));
  });
  // Admin doc + UI are intentionally public (no requireAdmin in front): every operation
  // under /api/admin/v1 is still gated by the admin middleware on that sub-app.
  app.get("/api/admin/doc", async (c) => {
    const doc = await buildDoc(adminDocInfo);
    return c.json(filterPaths(doc, (path) => path.startsWith(ADMIN_DOC_PREFIX)));
  });
  // baseUrl must not point at the default jsDelivr CDN: the site CSP blocks it.
  app.get("/api/ui", swaggerUI({ url: "/api/doc", baseUrl: SWAGGER_ASSETS_BASE_URL }));
  app.get("/api/admin/ui", swaggerUI({ url: "/api/admin/doc", baseUrl: SWAGGER_ASSETS_BASE_URL }));

  // Registered before the oRPC catch-all so these plain-Hono routes win the path match.
  mountAdminSentryTest(app);
  mountAdminPrintingPostImage(app);
  app
    .route("/api", healthRoute)
    .route("/api", swaggerAssetsRoute)
    .route("/api/v1", publicShareImagesRoute)
    .route("/api/v1", publicOembedRoute)
    .route("/api/v1", createPublicChatRoute())
    .route("/api/v1", sentryTunnelRoute)
    .route("/api/v1", unsubscribeOneClickRoute)
    .route("/api/v1", listImageRoute)
    .route("/api/v1", collectionImageRoute)
    .route("/api/v1", deckImageRoute)
    .route("/api/v1", tierListImageRoute);

  app.use("/api/admin/v1/*", requireAdmin);
  app.use("/api/v1/feature-flags", loadSession);
  app.use("/api/v1/users/share/*", loadSession);
  // These return a different body per auth state on the same URL; loadSession sets
  // `Vary: Cookie` so a shared cache can't conflate the responses.
  app.use("/api/v1/friend-groups/preview", loadSession);
  app.use("/api/v1/tournaments/submit/*", loadSession);
  app.use("/api/v1/tournaments/staff-invite/*", loadSession);
  mountDeckCheckIngestMiddleware(app);
  mountCardSubmissionsMiddleware(app);
  mountScanReportsMiddleware(app);
  mountMetaSubmissionsMiddleware(app);
  for (const path of ETAG_PATHS) {
    // immutableWhenVersionMatches reads the ETag header etag() sets, so it must run
    // after etag()'s post-processing despite being registered first.
    app.use(path, immutableWhenVersionMatches);
    app.use(path, etag());
  }

  app.all("/api/*", async (c, next) => {
    const apiContext = buildApiContext(c);
    // oRPC matches on the contract's declared method, so a HEAD never matches a GET route.
    // RFC 9110 defines HEAD as GET without a body, so run it as GET and drop the body.
    const isHead = c.req.method === "HEAD";
    const request = isHead
      ? new Request(c.req.raw.url, { method: "GET", headers: c.req.raw.headers })
      : c.req.raw;
    const { matched, response } = await apiHandler.handle(request, { context: apiContext });
    if (!matched || !response) {
      return next();
    }
    // The method guard keeps a private mutation sharing a cacheable prefix (e.g. POST
    // /decks/share/{token}/clone under the public /decks/share/ read) from being cached.
    if (response.ok && (c.req.method === "GET" || isHead) && apiContext.cacheControl) {
      response.headers.set("Cache-Control", apiContext.cacheControl);
    }
    // Must be set before `etag()` sees the response, or etag() hashes the body instead.
    if (
      response.ok &&
      (c.req.method === "GET" || isHead) &&
      apiContext.response.etag !== undefined
    ) {
      response.headers.set("ETag", `"${apiContext.response.etag}"`);
    }
    if (apiContext.retryAfterSeconds !== undefined) {
      response.headers.set("Retry-After", String(apiContext.retryAfterSeconds));
    }
    if (!isHead) {
      return response;
    }
    // Cancel the unread body so the stream isn't left dangling.
    void response.body?.cancel();
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  });

  return app;
}
