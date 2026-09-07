import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicOverlayRouter } from "./overlay";

const mockRepo = { findByToken: vi.fn() };
const mockPresetRepo = { findByIdForUser: vi.fn() };

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { overlayChannels: mockRepo, stagePresets: mockPresetRepo } as never);
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

describe("GET /api/v1/overlay/{token}/state?presetId=", () => {
  const PRESET_ID = "80000000-0001-4000-a000-000000000001";

  beforeEach(() => {
    mockRepo.findByToken.mockResolvedValue({
      id: "chan-1",
      userId: "user-1",
      token: "AbC123XyZ789",
      payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-1" },
      version: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  async function request(query: string): Promise<Response> {
    return await app.request(`/api/v1/overlay/AbC123XyZ789/state${query}`);
  }

  it("dresses the state with the owner's preset", async () => {
    mockPresetRepo.findByIdForUser.mockResolvedValue({
      id: PRESET_ID,
      userId: "user-1",
      name: "Draft night",
      config: { corner: "top-left", plateFields: { flavorText: true } },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const json = await readJson(await request(`?presetId=${PRESET_ID}`));

    expect(mockPresetRepo.findByIdForUser).toHaveBeenCalledWith(PRESET_ID, "user-1");
    expect(json.payload.corner).toBe("top-left");
    expect(json.payload.plateFields).toEqual({
      ...DEFAULT_OVERLAY_PAYLOAD.plateFields,
      flavorText: true,
    });
    expect(json.payload.printingId).toBe("p-1");
    expect(json.version).toBe(5);
  });

  it("ignores a preset that is unknown or someone else's rather than blanking the scene", async () => {
    mockPresetRepo.findByIdForUser.mockResolvedValue(undefined);

    const json = await readJson(await request(`?presetId=${PRESET_ID}`));

    expect(json).toEqual({
      version: 5,
      payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-1" },
    });
  });

  it("degrades a corrupt stored config to no dressing at all", async () => {
    mockPresetRepo.findByIdForUser.mockResolvedValue({
      id: PRESET_ID,
      userId: "user-1",
      name: "Draft night",
      config: { scale: 900, ground: "chartreuse" },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const json = await readJson(await request(`?presetId=${PRESET_ID}`));

    expect(json.payload).toEqual({ ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-1" });
  });

  it("does not look a preset up when the URL names none", async () => {
    await request("");

    expect(mockPresetRepo.findByIdForUser).not.toHaveBeenCalled();
  });
});
