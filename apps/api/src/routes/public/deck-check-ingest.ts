// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

import { ERROR_CODES } from "@openrift/shared";
import type { DeckCheckIngestResultResponse } from "@openrift/shared";
import { deckCheckIngestContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";
import type { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
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

const os = implement(deckCheckIngestContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the deck-check provider push (ADR-025). A public
 * procedure (no session): it authenticates off the `Authorization: Bearer <key>`
 * header (per-group API key, sha256-hashed) read via `context.reqHeader`. oRPC
 * validates the body before the handler runs, so a malformed push 400s before
 * the key is ever looked up — matching the previous validation-first ordering.
 */
export const deckCheckIngestRouter = {
  push: os.push.handler(async ({ input, context }): Promise<DeckCheckIngestResultResponse> => {
    const header = context.reqHeader("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
    if (!token) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Missing push key");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const key = await context.repos.deckCheck.findActiveKeyByHash(tokenHash);
    if (!key) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unknown or revoked push key");
    }

    const result = await context.transact((repos) =>
      ingestDeckCheckPush(repos, key.groupId, input, context.config.appBaseUrl),
    );
    await context.repos.deckCheck.touchKeyUsage(key.id);

    return result;
  }),
};

/**
 * Registers the Hono path middleware that fronts the deck-check ingest push —
 * the per-key rate limit and the 1 MB body limit. The push itself is served by
 * the single oRPC catch-all (see `app.ts`); these run before it. Registered
 * before the catch-all so an oversized or over-rate push is rejected early.
 * @returns Nothing; registers middleware on the passed app.
 */
export function mountDeckCheckIngestMiddleware(app: Hono<{ Variables: Variables }>): void {
  app.use("/api/v1/ingest/deck-check", ingestRateLimit);
  app.use(
    "/api/v1/ingest/deck-check",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json({ code: ERROR_CODES.PAYLOAD_TOO_LARGE, message: "Push exceeds 1 MB" }, 413),
    }),
  );
}
