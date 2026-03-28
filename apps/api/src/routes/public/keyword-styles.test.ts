import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { keywordStylesRoute } from "./keyword-styles";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockKeywordStylesRepo = {
  listAll: vi.fn(() => Promise.resolve([] as { name: string; color: string; darkText: boolean }[])),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", { keywordStyles: mockKeywordStylesRepo } as never);
    await next();
  })
  .route("/api/v1", keywordStylesRoute);

// ---------------------------------------------------------------------------
// GET /api/v1/keyword-styles
// ---------------------------------------------------------------------------

describe("GET /api/v1/keyword-styles", () => {
  beforeEach(() => {
    mockKeywordStylesRepo.listAll.mockReset();
  });

  it("returns 200 with items map", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
    ]);
    const res = await app.request("/api/v1/keyword-styles");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toBeDefined();
  });

  it("maps rows to name-keyed style objects", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
      { name: "Burn", color: "#ff4400", darkText: true },
    ]);
    const res = await app.request("/api/v1/keyword-styles");
    const json = await res.json();
    expect(json.items).toEqual({
      Shield: { color: "#4488ff", darkText: false },
      Burn: { color: "#ff4400", darkText: true },
    });
  });

  it("returns empty items when no keyword styles exist", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/v1/keyword-styles");
    const json = await res.json();
    expect(json.items).toEqual({});
  });

  it("returns multiple keyword styles correctly", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
      { name: "Burn", color: "#ff4400", darkText: true },
      { name: "Freeze", color: "#00ccff", darkText: false },
    ]);
    const res = await app.request("/api/v1/keyword-styles");
    const json = await res.json();
    expect(Object.keys(json.items)).toHaveLength(3);
    expect(json.items.Freeze.color).toBe("#00ccff");
    expect(json.items.Freeze.darkText).toBe(false);
  });

  it("sets Cache-Control with public caching", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/v1/keyword-styles");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600",
    );
  });

  it("calls listAll exactly once per request", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([]);
    await app.request("/api/v1/keyword-styles");
    expect(mockKeywordStylesRepo.listAll).toHaveBeenCalledTimes(1);
  });

  it("preserves darkText boolean values", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([
      { name: "Glow", color: "#ffff00", darkText: true },
    ]);
    const res = await app.request("/api/v1/keyword-styles");
    const json = await res.json();
    expect(json.items.Glow.darkText).toBe(true);
  });
});
