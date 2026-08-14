import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicOverlayRouter } from "./overlay";

const mockRepo = { findByToken: vi.fn() };

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  // No session: the OBS browser source has none, which is the point.
  c.set("repos", { overlayChannels: mockRepo } as never);
  await next();
});
registerRouterForTest(app, publicOverlayRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

beforeEach(() => vi.resetAllMocks());

describe("GET /api/v1/overlay/{token}/state", () => {
  it("serves the channel's version and payload without a session", async () => {
    const payload = { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-1" };
    mockRepo.findByToken.mockResolvedValue({
      id: "chan-1",
      userId: "user-1",
      token: "AbC123XyZ789",
      payload,
      version: 42,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.request("/api/v1/overlay/AbC123XyZ789/state");

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 42, payload });
    expect(mockRepo.findByToken).toHaveBeenCalledWith("AbC123XyZ789");
  });

  it("answers an unknown token with the empty state, not a 404", async () => {
    mockRepo.findByToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/overlay/rotated-away/state");

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 0, payload: DEFAULT_OVERLAY_PAYLOAD });
  });

  it("exposes neither the token nor the owner in the response", async () => {
    mockRepo.findByToken.mockResolvedValue({
      id: "chan-1",
      userId: "user-1",
      token: "AbC123XyZ789",
      payload: { ...DEFAULT_OVERLAY_PAYLOAD },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const json = await readJson(await app.request("/api/v1/overlay/AbC123XyZ789/state"));

    expect(json.token).toBeUndefined();
    expect(json.userId).toBeUndefined();
    expect(json.updatedAt).toBeUndefined();
  });
});
