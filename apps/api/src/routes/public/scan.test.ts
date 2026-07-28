import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { scanRouter } from "./scan";

const mockScanIndex = {
  get: vi.fn(),
};

const mockConfig = {
  scan: { encoderFile: "scan-encoder-fp16-v1.onnx", opencvFile: "scan-opencv-v1.js" },
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("config", mockConfig as never);
  c.set("repos", { scanIndex: mockScanIndex } as never);
  await next();
});
registerRouterForTest(app, scanRouter);

describe("GET /api/v1/scan/manifest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports unavailable with only the engine assets before any bank exists", async () => {
    mockScanIndex.get.mockResolvedValue(null);

    const res = await app.request("/api/v1/scan/manifest");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      available: false,
      formatVersion: null,
      bankHash: null,
      entryCount: null,
      builtAt: null,
      bankUrl: null,
      labelsUrl: null,
      encoderUrl: "/media/scan/scan-encoder-fp16-v1.onnx",
      opencvUrl: "/media/scan/scan-opencv-v1.js",
    });
  });

  it("hands out the current generation's content-hashed URLs", async () => {
    mockScanIndex.get.mockResolvedValue({
      formatVersion: 1,
      bankHash: "511b47521ffca52a",
      entryCount: 2670,
      encoderTag: "scan-encoder-fp16-v1.onnx",
      watermark: new Date("2026-07-28T10:00:00.000Z"),
      builtAt: new Date("2026-07-28T11:36:00.000Z"),
      durationMs: 60_151,
    });

    const res = await app.request("/api/v1/scan/manifest");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      available: true,
      formatVersion: 1,
      bankHash: "511b47521ffca52a",
      entryCount: 2670,
      builtAt: "2026-07-28T11:36:00.000Z",
      bankUrl: "/media/scan/scan-bank-511b47521ffca52a.bin",
      labelsUrl: "/media/scan/scan-labels-511b47521ffca52a.json",
      encoderUrl: "/media/scan/scan-encoder-fp16-v1.onnx",
      opencvUrl: "/media/scan/scan-opencv-v1.js",
    });
  });
});
