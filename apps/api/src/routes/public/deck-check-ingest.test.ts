import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";
import { mountDeckCheckIngest } from "./deck-check-ingest";

// Mock the ingest service so the route logic (auth + validation + result wiring)
// is exercised without a database.
const mockIngest = vi.fn();
vi.mock("../../services/deck-check-ingest.js", () => ({
  ingestDeckCheckPush: (...args: unknown[]) => mockIngest(...args),
}));

const mockDeckCheckRepo = {
  findActiveKeyByHash: vi.fn(),
  touchKeyUsage: vi.fn(),
};

// Replicate the app's global onError so the external `{ error, code }` envelope
// (the reason this route stays plain Hono, not oRPC) is asserted end to end.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { deckCheck: mockDeckCheckRepo } as never);
  c.set("config", { appBaseUrl: "https://openrift.test" } as never);
  c.set("transact", (async (run: (repos: unknown) => unknown) =>
    run({ deckCheck: mockDeckCheckRepo })) as never);
  await next();
});
// oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono's onError API takes a callback
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as ContentfulStatusCode);
  }
  if (err instanceof z.ZodError) {
    return c.json({ error: "Invalid request body", code: ERROR_CODES.VALIDATION_ERROR }, 400);
  }
  throw err;
});
mountDeckCheckIngest(app);

const EVENT_ID = "a0000000-0001-4000-a000-000000000001";

function push(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/v1/ingest/deck-check", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/ingest/deck-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the ingest result for a valid key + payload", async () => {
    mockDeckCheckRepo.findActiveKeyByHash.mockResolvedValue({ id: "key-1", groupId: "grp-1" });
    mockIngest.mockResolvedValue({ applied: 0, withdrawn: 0, unmatched: [] });

    const res = await push({ eventId: EVENT_ID, entries: [] }, { Authorization: "Bearer secret" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: 0, withdrawn: 0, unmatched: [] });
    expect(mockIngest).toHaveBeenCalledWith(
      expect.anything(),
      "grp-1",
      { eventId: EVENT_ID, entries: [] },
      "https://openrift.test",
    );
    expect(mockDeckCheckRepo.touchKeyUsage).toHaveBeenCalledWith("key-1");
  });

  it("returns 401 { error, code } when the Authorization header is missing", async () => {
    const res = await push({ eventId: EVENT_ID, entries: [] });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Missing push key", code: ERROR_CODES.UNAUTHORIZED });
    expect(mockDeckCheckRepo.findActiveKeyByHash).not.toHaveBeenCalled();
  });

  it("returns 401 { error, code } when the key is unknown or revoked", async () => {
    mockDeckCheckRepo.findActiveKeyByHash.mockResolvedValue(undefined);
    const res = await push({ eventId: EVENT_ID, entries: [] }, { Authorization: "Bearer nope" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Unknown or revoked push key",
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });

  it("returns 400 { error, code } with the VALIDATION_ERROR envelope on a bad body", async () => {
    const res = await push({ eventId: "not-a-uuid" }, { Authorization: "Bearer secret" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid request body",
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    // Validation runs before the auth check, matching the prior middleware order.
    expect(mockDeckCheckRepo.findActiveKeyByHash).not.toHaveBeenCalled();
  });
});
