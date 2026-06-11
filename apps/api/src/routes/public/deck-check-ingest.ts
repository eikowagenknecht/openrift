// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

import { createRoute } from "@hono/zod-openapi";
import { ERROR_CODES } from "@openrift/shared";
import { deckCheckIngestResultResponseSchema } from "@openrift/shared/response-schemas";
import { deckCheckIngestSchema } from "@openrift/shared/schemas";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";

import { AppError } from "../../errors.js";
import { errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
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

const pushDeckCheck = createRoute({
  method: "post",
  path: "/ingest/deck-check",
  tags: ["Deck Check"],
  description:
    "Provider push for deck-check events (ADR-025). Authenticated by a per-group " +
    "API key (`Authorization: Bearer <key>`). Pushes never create events: the " +
    "event is created in OpenRift and addressed by its id. Partial semantics: " +
    "entries absent from a push are untouched; withdrawal is the explicit " +
    "per-entry flag.",
  request: {
    body: {
      content: { "application/json": { schema: deckCheckIngestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckIngestResultResponseSchema } },
      description: "Push applied",
    },
    ...errorResponses(400, 401, 404, 409, 422),
  },
});

/** The subsystem's only machine-to-machine surface: no session, no cookie. */
export const deckCheckIngestRoute = createApiApp();

deckCheckIngestRoute.use("/ingest/deck-check", ingestRateLimit);
deckCheckIngestRoute.use(
  "/ingest/deck-check",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json({ error: "Push exceeds 1 MB", code: ERROR_CODES.PAYLOAD_TOO_LARGE }, 413),
  }),
);

deckCheckIngestRoute.openapi(pushDeckCheck, async (c) => {
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

  const payload = c.req.valid("json");
  const result = await c.get("transact")((repos) =>
    ingestDeckCheckPush(repos, key.groupId, payload),
  );
  await c.get("repos").deckCheck.touchKeyUsage(key.id);

  return c.json(result, 200);
});
