import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { overlayRouter } from "./overlay";

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const UPDATED_AT = new Date("2026-08-14T10:30:00.000Z");

function stubChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "chan-1",
    userId: USER_ID,
    token: "AbC123XyZ789",
    payload: { ...DEFAULT_OVERLAY_PAYLOAD },
    version: 3,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

const mockRepo = {
  findByUserId: vi.fn(),
  findByToken: vi.fn(),
  create: vi.fn(),
  setPayload: vi.fn(),
  rotateToken: vi.fn(),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { overlayChannels: mockRepo } as never);
  await next();
});
registerRouterForTest(app, overlayRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

beforeEach(() => {
  vi.resetAllMocks();
  // The default for every test: the user already has a channel. Tests that
  // care about first-use override findByUserId to undefined.
  mockRepo.findByUserId.mockResolvedValue(stubChannel());
  mockRepo.setPayload.mockImplementation((_userId: string, payload: unknown) =>
    Promise.resolve(stubChannel({ payload, version: 4 })),
  );
});

describe("GET /api/v1/overlay/me", () => {
  it("returns the existing channel", async () => {
    const res = await app.request("/api/v1/overlay/me");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.token).toBe("AbC123XyZ789");
    expect(json.version).toBe(3);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("creates the channel on first ask", async () => {
    mockRepo.findByUserId.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue(stubChannel({ token: "FreshToken12", version: 0 }));

    const res = await app.request("/api/v1/overlay/me");

    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ token: "FreshToken12", version: 0 });
    expect(mockRepo.create).toHaveBeenCalledWith(USER_ID);
  });

  it("never returns the row id or the owner", async () => {
    const json = await readJson(await app.request("/api/v1/overlay/me"));

    expect(json.id).toBeUndefined();
    expect(json.userId).toBeUndefined();
  });
});

describe("POST /api/v1/overlay/me/push", () => {
  it("sets the card and keeps the existing dressing", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({
        payload: { ...DEFAULT_OVERLAY_PAYLOAD, corner: "top-left", scale: 45 },
      }),
    );

    const res = await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(USER_ID, {
      ...DEFAULT_OVERLAY_PAYLOAD,
      printingId: "p-1",
      corner: "top-left",
      scale: 45,
    });
  });

  it("applies display switches sent alongside the card", async () => {
    await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-2", showPlate: false, corner: "top-right" }),
    });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ printingId: "p-2", showPlate: false, corner: "top-right" }),
    );
  });

  it("rejects a scale outside the allowed range", async () => {
    const res = await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-1", scale: 500 }),
    });

    expect(res.status).toBe(400);
    expect(mockRepo.setPayload).not.toHaveBeenCalled();
  });

  it("rejects a QR link that isn't a URL", async () => {
    const res = await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-1", qrUrl: "not a url" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/overlay/me/clear", () => {
  it("blanks the card but leaves the scene setup alone", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({
        payload: {
          ...DEFAULT_OVERLAY_PAYLOAD,
          printingId: "p-1",
          showPlate: false,
          qrUrl: "https://openrift.app/decks/share/abc",
          corner: "top-left",
          scale: 55,
        },
      }),
    );

    const res = await app.request("/api/v1/overlay/me/clear", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(USER_ID, {
      ...DEFAULT_OVERLAY_PAYLOAD,
      printingId: null,
      showPlate: false,
      qrUrl: "https://openrift.app/decks/share/abc",
      corner: "top-left",
      scale: 55,
    });
  });
});

describe("PATCH /api/v1/overlay/me", () => {
  it("changes a switch without touching the card on screen", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-live" } }),
    );

    const res = await app.request("/api/v1/overlay/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ corner: "bottom-left" }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ printingId: "p-live", corner: "bottom-left" }),
    );
  });
});

describe("POST /api/v1/overlay/me/rotate", () => {
  it("returns the new token", async () => {
    mockRepo.rotateToken.mockResolvedValue(stubChannel({ token: "RotatedTok1", version: 4 }));

    const res = await app.request("/api/v1/overlay/me/rotate", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ token: "RotatedTok1" });
    expect(mockRepo.rotateToken).toHaveBeenCalledWith(USER_ID);
  });

  it("creates the channel first when the user has none", async () => {
    mockRepo.findByUserId.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue(stubChannel({ token: "FreshToken12" }));
    mockRepo.rotateToken.mockResolvedValue(stubChannel({ token: "RotatedTok1" }));

    const res = await app.request("/api/v1/overlay/me/rotate", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mockRepo.create).toHaveBeenCalledWith(USER_ID);
    expect(await readJson(res)).toMatchObject({ token: "RotatedTok1" });
  });
});
