// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

import { ERROR_CODES } from "@openrift/shared";
import { deckCheckIngestSchema } from "@openrift/shared/schemas";
import type { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";

import { AppError } from "../../errors.js";
import { ingestDeckCheckPush } from "../../services/deck-check-ingest.js";
import type { Variables } from "../../types.js";

const MAX_BODY_BYTES = 1024 * 1024;
const PUSHES_PER_MINUTE = 60;

/**
 * 60 pushes per minute per key. Keyed by the raw Authorization header: an
 * invalid key burns the unauthenticated bucket for that header value, a valid
 * one is per-key by construction.
 */
const ingestRateLimit = rateLimiter<{ Variables: Variables }>({
  windowMs: 60_000,
  limit: PUSHES_PER_MINUTE,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.req.header("authorization") ?? c.req.header("x-real-ip") ?? "unknown",
});

/**
 * Mounts the deck-check provider push (ADR-025) at `POST /api/v1/ingest/deck-check`.
 *
 * This is a plain Hono route (not oRPC) so its error envelope stays
 * `{ error, code }` for external providers: validation errors throw a `ZodError`
 * and key/state errors throw an `AppError`, both mapped by the global `onError`
 * to that exact shape. The body is validated before the auth check to match the
 * previous `@hono/zod-openapi` ordering (validation ran as middleware first).
 * @returns Nothing; registers the route on the passed app.
 */
export function mountDeckCheckIngest(app: Hono<{ Variables: Variables }>): void {
  app.use("/api/v1/ingest/deck-check", ingestRateLimit);
  app.use(
    "/api/v1/ingest/deck-check",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json({ error: "Push exceeds 1 MB", code: ERROR_CODES.PAYLOAD_TOO_LARGE }, 413),
    }),
  );

  app.post("/api/v1/ingest/deck-check", async (c) => {
    const payload = deckCheckIngestSchema.parse(await c.req.json());

    const header = c.req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
    if (!token) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Missing push key");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const key = await c.get("repos").deckCheck.findActiveKeyByHash(tokenHash);
    if (!key) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unknown or revoked push key");
    }

    const { appBaseUrl } = c.get("config");
    const result = await c.get("transact")((repos) =>
      ingestDeckCheckPush(repos, key.groupId, payload, appBaseUrl),
    );
    await c.get("repos").deckCheck.touchKeyUsage(key.id);

    return c.json(result, 200);
  });
}
