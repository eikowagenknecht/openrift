// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

import { ERROR_CODES } from "@openrift/shared";
import type { DeckCheckIngestResultResponse } from "@openrift/shared";
import { deckCheckIngestContract } from "@openrift/shared/contracts/deck-check-ingest";
import { implement } from "@orpc/server";
import type { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { orpcErrorResponse } from "../../orpc/error-body.js";
import { ingestDeckCheckPush } from "../../services/deck-check-ingest.js";
import type { Variables } from "../../types.js";

const MAX_BODY_BYTES = 1024 * 1024;
const PUSHES_PER_MINUTE = 60;

/** Keyed by the raw Authorization header, so a valid key is rate-limited per-key. */
const ingestRateLimit = rateLimiter<{ Variables: Variables }>({
  windowMs: 60_000,
  limit: PUSHES_PER_MINUTE,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.req.header("authorization") ?? c.req.header("x-real-ip") ?? "unknown",
});

const os = implement(deckCheckIngestContract).$context<ApiContext>().use(requireUser);

/**
 * Public procedure (no session): authenticates off the `Authorization: Bearer
 * <key>` header (per-group API key, sha256-hashed), read via `context.reqHeader`.
 */
export const deckCheckIngestRouter = {
  push: os.push.handler(async ({ input, context }): Promise<DeckCheckIngestResultResponse> => {
    const header = context.reqHeader("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
    if (!token) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Missing push key");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const key = await context.repos.deckCheckKeys.findActiveKeyByHash(tokenHash);
    if (!key) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unknown or revoked push key");
    }

    const result = await context.transact((repos) =>
      ingestDeckCheckPush(
        repos,
        { hostType: key.hostType, hostUserId: key.hostUserId, hostOrgId: key.hostOrgId },
        input,
        context.config.appBaseUrl,
      ),
    );
    await context.repos.deckCheckKeys.touchKeyUsage(key.id);

    return result;
  }),
};

/** Must be registered before the oRPC catch-all so it can reject an oversized or over-rate push early. */
export function mountDeckCheckIngestMiddleware(app: Hono<{ Variables: Variables }>): void {
  app.use("/api/v1/ingest/deck-check", ingestRateLimit);
  app.use(
    "/api/v1/ingest/deck-check",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => orpcErrorResponse(c, ERROR_CODES.PAYLOAD_TOO_LARGE, "Push exceeds 1 MB"),
    }),
  );
}
