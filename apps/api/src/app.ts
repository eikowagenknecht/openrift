import { swaggerUI } from "@hono/swagger-ui";
import { ERROR_CODES } from "@openrift/shared";
import type { ApiErrorResponse } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";
import * as Sentry from "@sentry/bun";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Kysely } from "kysely";
import { z } from "zod";

import { matchOrigin } from "./cors.js";
import type { Database } from "./db/index.js";
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
import { generateContractOpenAPIDocument } from "./openapi-doc.js";
import { ETAG_PATHS } from "./orpc/cache-policy.js";
import { buildApiContext } from "./orpc/context.js";
import { createApiHandler } from "./orpc/router.js";
import { mountAdminSentryTest } from "./routes/admin/sentry-test.js";
import { mountCardSubmissionsMiddleware } from "./routes/authenticated/card-submissions.js";
import { deckImageRoute } from "./routes/authenticated/deck-image.js";
import { listImageRoute } from "./routes/authenticated/list-image.js";
import { mountDeckCheckIngestMiddleware } from "./routes/public/deck-check-ingest.js";
import { healthRoute } from "./routes/public/health.js";
import { publicOembedRoute } from "./routes/public/oembed.js";
import { sentryTunnelRoute } from "./routes/public/sentry-tunnel.js";
import { publicShareImagesRoute } from "./routes/public/share-images.js";
import { unsubscribeOneClickRoute } from "./routes/public/unsubscribe-one-click.js";
import type { Auth, Config, Variables } from "./types.js";

export interface AppDeps {
  db: Kysely<Database>;
  auth: Auth;
  config: Config;
  log: Logger;
  io?: Io;
  services?: Partial<Services>;
  /** ADR-030: enables the instant trade-request email. Omitted in tests that don't assert mail. */
  sendEmail?: ReturnType<typeof createEmailSender>;
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
  // ADR-030: bind the trade-request email deps into createTrade. Only when an
  // SMTP sender is provided — tests and SMTP-less envs get the plain services.
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

  // Repos and the transaction helper are stateless given a fixed `db`, so build
  // them once at app construction rather than re-instrumenting all ~50 repos on
  // every request. Each instrumented repo method still opens its own OTel span
  // per call; createTransact rebuilds repos against the trx handle inside each
  // transaction, so writes stay transaction-scoped.
  const repos = createRepos(db);
  const transact = createTransact(db);

  // The single oRPC handler for every migrated route. Bound to `log` so its
  // reporting interceptor captures 5xx faults to Sentry + the structured error
  // log (oRPC encodes handler throws into a Response, so they never reach the
  // Hono `onError` below).
  const apiHandler = createApiHandler(log);

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
        code: ERROR_CODES.VALIDATION_ERROR,
        details: err.issues.map((i) => ({ path: i.path, message: i.message })),
      };
      return c.json(body, 400);
    }

    if (err instanceof HTTPException) {
      // Framework-thrown HTTPExceptions carry a status but no code; map the
      // status to the canonical code so the envelope stays uniform.
      const body: ApiErrorResponse = { error: err.message, code: codeForStatus(err.status) };
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

  // Unmatched API routes return the same JSON envelope as every other error,
  // not Hono's default text/plain 404. Non-API paths keep a plain 404.
  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json(
        { error: "Not found", code: ERROR_CODES.NOT_FOUND } satisfies ApiErrorResponse,
        404,
      );
    }
    return c.text("Not Found", 404);
  });

  // Open an OTel `http.server` span per request and activate it in the OTel
  // context, so child spans (notably the Kysely `db.query` spans) inherit it.
  // Registered before metrics + deps + auth middlewares since they all run
  // inside the span (metrics for exemplars, deps/auth for DB queries).
  app.use("/api/*", otelRequestMiddleware);

  // ── Metrics ─────────────────────────────────────────────────────────────
  // Prometheus scrapes /metrics from inside the openrift_default Docker network.
  // The host port for the API is bound to 127.0.0.1 only, so /metrics is not
  // exposed publicly. registerMetrics wraps every request so health checks and
  // /metrics itself are counted; route labels use Hono's matched pattern
  // (e.g. /api/v1/cards/:id) to keep cardinality bounded. Registered after
  // otelRequestMiddleware so the active span is in scope and exemplars carry
  // its trace ID — Grafana surfaces those as clickable jumps into Tempo.
  const { printMetrics, registerMetrics } = createMetricsMiddleware();
  app.use("*", registerMetrics);
  app.get("/metrics", printMetrics);

  // ── Global middleware ───────────────────────────────────────────────────
  // CORS runs first so preflight OPTIONS requests are handled before any other work.
  // exposeHeaders includes X-Build-Id so cross-origin clients (preview env) can
  // read it for stale-bundle detection; same-origin clients see it regardless.
  app.use(
    "/api/*",
    cors({
      credentials: true,
      origin: (origin) => matchOrigin(origin, config.corsOrigin),
      exposeHeaders: ["X-Build-Id", "X-Api-Format"],
    }),
  );

  // X-Build-Id on non-cacheable responses, X-Api-Format on cacheable ones —
  // see middleware/version-headers.ts for why the split matters.
  app.use("/api/*", versionHeadersMiddleware(config.buildId));

  if (config.logRequests) {
    app.use("/api/*", async (c, next) => {
      const start = performance.now();
      // Size from Content-Length headers, not by cloning + buffering the body —
      // logging a request shouldn't read large payloads (e.g. /catalog) in full
      // just to report their size.
      const reqSize = Number(c.req.header("content-length") ?? 0);
      await next();
      const ms = (performance.now() - start).toFixed(0);
      // Response size: Bun sets Content-Length only when it serializes the
      // response to the socket — downstream of this middleware — so for normal
      // c.json()/c.text() responses the header is absent here and prod logs no
      // `res=` size. In dev, buffer a clone to report an accurate size (the
      // observability is worth the cost while developing); in prod, keep the
      // cheap header read and omit the size rather than buffer large payloads
      // like /catalog (~310KB) on every request.
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

  // Make shared dependencies (repos, services, etc.) available via c.get() in all routes.
  app.use("/api/*", async (c, next) => {
    c.set("io", deps.io ?? defaultIo);
    c.set("auth", auth);
    c.set("config", config);
    c.set("repos", repos);
    c.set("services", services);
    c.set("transact", transact);
    await next();
  });

  // ── Auth ────────────────────────────────────────────────────────────────
  // Apply rate limiting only to sensitive auth endpoints (sign-in, sign-up, etc.).
  // DISABLE_AUTH_RATE_LIMIT lets the e2e harness opt out — auth.setup re-runs
  // in tight succession would otherwise trip the limiter and fail.
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

  // Session loading is opt-in per route. Auth-gated middlewares
  // (`requireAuth`, `requireAdmin`) resolve the session themselves;
  // public routes that branch on auth state apply the `loadSession`
  // middleware explicitly. Truly-public routes skip the lookup entirely.

  // ── OpenAPI spec & Swagger UI ──────────────────────────────────────────
  // The public and admin surfaces get separate OpenAPI documents (split by the
  // /api/admin/ path prefix) so the ~140 admin operations don't pollute the
  // public spec. The spec is generated entirely from the shared oRPC contracts
  // (`generateContractOpenAPIDocument`). A few routes are plain Hono and not in
  // the doc on purpose (health, the sentry smoke test). Per-operation `security`
  // is derived from each contract's auth meta (cookie session / bearer key /
  // public) so Swagger UI shows the credential each endpoint needs.
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

  // Build the OpenAPI document from the oRPC contracts, overlaying the doc info
  // and the cookie-session security scheme (Better Auth issues the session in
  // this cookie). Contract schemas are inlined (no `components.schemas`).
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
          // Same session cookie as cookieAuth, but the user must hold the admin
          // role — enforced by the requireAdmin middleware on /api/admin/v1/*.
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

  // Public doc: everything except the admin surface.
  app.get("/api/doc", async (c) => {
    const doc = await buildDoc(publicDocInfo);
    return c.json(filterPaths(doc, (path) => !path.startsWith(ADMIN_DOC_PREFIX)));
  });
  // Admin doc + UI are intentionally public (no requireAdmin in front). They
  // describe the admin surface but grant no access: every operation under
  // /api/admin/v1 is gated by the admin middleware on that sub-app, so the
  // contract is the only thing exposed here. We do not rely on hiding the API
  // shape for security, so publishing it is an accepted trade-off (a browsable
  // admin reference) rather than a leak. Gate these behind requireAdmin if that
  // stance ever changes.
  // Admin doc: only the admin surface.
  app.get("/api/admin/doc", async (c) => {
    const doc = await buildDoc(adminDocInfo);
    return c.json(filterPaths(doc, (path) => path.startsWith(ADMIN_DOC_PREFIX)));
  });
  app.get("/api/ui", swaggerUI({ url: "/api/doc" }));
  app.get("/api/admin/ui", swaggerUI({ url: "/api/admin/doc" }));

  // ── Plain-Hono routes (not oRPC) ──────────────────────────────────────────
  // Binary/HTML/empty responses, external error envelopes, or a deliberate
  // throw (sentry-test) — these don't fit the oRPC JSON model, so they stay
  // Hono. Registered before the oRPC catch-all so they win the path match.
  mountAdminSentryTest(app);
  app
    .route("/api", healthRoute)
    .route("/api/v1", publicShareImagesRoute)
    .route("/api/v1", publicOembedRoute)
    .route("/api/v1", sentryTunnelRoute)
    .route("/api/v1", unsubscribeOneClickRoute)
    .route("/api/v1", listImageRoute)
    .route("/api/v1", deckImageRoute);

  // ── Auth + caching middleware for the oRPC routes ─────────────────────────
  // Auth is enforced per-procedure by the `requireUser` middleware on every
  // router (fail-closed; public procedures opt out via `meta.auth`). The only
  // exceptions handled here as Hono middleware:
  //  - admin uses the clean `/api/admin/v1/*` prefix (no ambiguity);
  //  - the two optional-auth public routes run `loadSession` so they can read
  //    the viewer AND set `Vary: Cookie` for the edge cache (ADR-016);
  //  - `etag()` provides the catalog/prices content version + conditional GETs;
  //  - the deck-check provider push carries a per-key rate limit + 1 MB body
  //    limit (the push itself is a public oRPC procedure with Bearer-key auth).
  app.use("/api/admin/v1/*", requireAdmin);
  app.use("/api/v1/feature-flags", loadSession);
  app.use("/api/v1/users/share/*", loadSession);
  mountDeckCheckIngestMiddleware(app);
  mountCardSubmissionsMiddleware(app);
  for (const path of ETAG_PATHS) {
    app.use(path, etag());
  }

  // ── Single oRPC catch-all (registered LAST) ───────────────────────────────
  // One OpenAPIHandler serves every migrated endpoint. When oRPC has no route
  // for the path we call next() rather than answering here, so later-registered
  // routes still match and the app's JSON-404 notFound handler owns the miss.
  // Cache-Control for the few cacheable public reads is applied here from the
  // directive the cache-control client interceptor resolved off the matched
  // procedure's meta.
  app.all("/api/*", async (c, next) => {
    const apiContext = buildApiContext(c);
    // oRPC matches on the contract's declared method, so a HEAD never matches a
    // GET route and used to fall through to the JSON-404 handler. RFC 9110
    // defines HEAD as GET without a body, so run it as a GET and drop the body.
    // This was invisible in production: the CDN answers HEAD from its stored
    // GET for every cached read, so only the reads it hadn't cached — and any
    // direct origin check — saw the 404.
    const isHead = c.req.method === "HEAD";
    const request = isHead
      ? new Request(c.req.raw.url, { method: "GET", headers: c.req.raw.headers })
      : c.req.raw;
    const { matched, response } = await apiHandler.handle(request, { context: apiContext });
    if (!matched || !response) {
      return next();
    }
    // Only successful safe reads are cacheable. The method guard keeps a private
    // mutation that shares a cacheable prefix (e.g. POST /decks/share/{token}/clone
    // under the public /decks/share/ read) from ever being labelled `public`.
    if (response.ok && (c.req.method === "GET" || isHead) && apiContext.cacheControl) {
      response.headers.set("Cache-Control", apiContext.cacheControl);
    }
    if (!isHead) {
      return response;
    }
    // Headers (including Content-Length) describe what the GET would return,
    // which is what HEAD must report. Cancel the unread body so the stream
    // isn't left dangling.
    void response.body?.cancel();
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  });

  return app;
}
