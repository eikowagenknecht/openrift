import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { deckCheckIngestRouter, mountDeckCheckIngestMiddleware } from "./deck-check-ingest";

const mockIngest = vi.fn();
vi.mock("../../services/deck-check-ingest.js", () => ({
  ingestDeckCheckPush: (...args: unknown[]) => mockIngest(...args),
}));

const mockDeckCheckKeysRepo = {
  findActiveKeyByHash: vi.fn(),
  touchKeyUsage: vi.fn(),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { deckCheckKeys: mockDeckCheckKeysRepo } as never);
  c.set("config", { appBaseUrl: "https://openrift.test" } as never);
  c.set("transact", (async (run: (repos: unknown) => unknown) =>
    run({ deckCheckKeys: mockDeckCheckKeysRepo })) as never);
  await next();
});
registerRouterForTest(app, deckCheckIngestRouter);

const EVENT_ID = "a0000000-0001-4000-a000-000000000001";

const RESULT = {
  tournamentId: EVENT_ID,
  entriesCreated: 0,
  entriesUpdated: 0,
  entriesUnchanged: 0,
  entriesWithdrawn: 0,
  checksInvalidated: 0,
  entriesIgnored: 0,
  entries: [],
};

function push(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/v1/ingest/deck-check", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/ingest/deck-check (oRPC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the ingest result for a valid key + payload", async () => {
    mockDeckCheckKeysRepo.findActiveKeyByHash.mockResolvedValue({
      id: "key-1",
      hostType: "user",
      hostUserId: "user-1",
      hostOrgId: null,
    });
    mockIngest.mockResolvedValue(RESULT);

    const res = await push(
      { tournamentId: EVENT_ID, entries: [] },
      { Authorization: "Bearer secret" },
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual(RESULT);
    expect(mockIngest).toHaveBeenCalledWith(
      expect.anything(),
      { hostType: "user", hostUserId: "user-1", hostOrgId: null },
      { tournamentId: EVENT_ID, entries: [] },
      "https://openrift.test",
    );
    expect(mockDeckCheckKeysRepo.touchKeyUsage).toHaveBeenCalledWith("key-1");
  });

  it("returns 401 { code, message } when the Authorization header is missing", async () => {
    const res = await push({ tournamentId: EVENT_ID, entries: [] });
    expect(res.status).toBe(401);
    expect(await readJson(res)).toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Missing push key",
    });
    expect(mockDeckCheckKeysRepo.findActiveKeyByHash).not.toHaveBeenCalled();
  });

  it("returns 401 { code, message } when the key is unknown or revoked", async () => {
    mockDeckCheckKeysRepo.findActiveKeyByHash.mockResolvedValue(undefined);
    const res = await push(
      { tournamentId: EVENT_ID, entries: [] },
      { Authorization: "Bearer nope" },
    );
    expect(res.status).toBe(401);
    expect(await readJson(res)).toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Unknown or revoked push key",
    });
  });

  it("returns 400 on a bad body, before the auth check (oRPC input validation)", async () => {
    const res = await push({ tournamentId: "not-a-uuid" }, { Authorization: "Bearer secret" });
    expect(res.status).toBe(400);
    expect(mockDeckCheckKeysRepo.findActiveKeyByHash).not.toHaveBeenCalled();
  });
});

describe("deck-check ingest body limit", () => {
  const limited = new Hono<{ Variables: Variables }>();
  mountDeckCheckIngestMiddleware(limited);
  limited.use("*", async (c, next) => {
    c.set("repos", { deckCheckKeys: mockDeckCheckKeysRepo } as never);
    c.set("config", { appBaseUrl: "https://openrift.test" } as never);
    await next();
  });
  registerRouterForTest(limited, deckCheckIngestRouter);

  it("rejects a push over 1 MB with a 413 the oRPC client can parse", async () => {
    const res = await limited.request("/api/v1/ingest/deck-check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({ tournamentId: EVENT_ID, note: "x".repeat(1024 * 1024) }),
    });

    expect(res.status).toBe(413);
    expect(await readJson(res)).toStrictEqual({
      defined: false,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      status: 413,
      message: "Push exceeds 1 MB",
    });
  });

  it("lets an under-cap push through to the router", async () => {
    mockDeckCheckKeysRepo.findActiveKeyByHash.mockResolvedValue(undefined);

    const res = await limited.request("/api/v1/ingest/deck-check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer small" },
      body: JSON.stringify({ tournamentId: EVENT_ID, entries: [] }),
    });

    expect(res.status).toBe(401);
  });
});
