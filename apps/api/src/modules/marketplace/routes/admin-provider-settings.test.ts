import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminProviderSettingsRouter } from "./admin-provider-settings";

const mockRepo = {
  listAll: vi.fn(),
  reorder: vi.fn(),
  upsert: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx responses carry `{ message }`.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { providerSettings: mockRepo } as never);
  await next();
});
registerRouterForTest(app, adminProviderSettingsRouter);

const dbSetting1 = {
  provider: "tcgplayer",
  sortOrder: 0,
  isHidden: false,
  isFavorite: false,
  helperReviewable: false,
};

const dbSetting2 = {
  provider: "cardmarket",
  sortOrder: 1,
  isHidden: true,
  isFavorite: true,
  helperReviewable: true,
};

describe("GET /provider-settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with serialized provider settings", async () => {
    mockRepo.listAll.mockResolvedValue([dbSetting1, dbSetting2]);
    const res = await app.request("/api/admin/v1/provider-settings");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.providerSettings).toHaveLength(2);
    expect(json.providerSettings[0]).toEqual({
      provider: "tcgplayer",
      sortOrder: 0,
      isHidden: false,
      isFavorite: false,
      helperReviewable: false,
    });
    expect(json.providerSettings[1]).toEqual({
      provider: "cardmarket",
      sortOrder: 1,
      isHidden: true,
      isFavorite: true,
      helperReviewable: true,
    });
  });

  it("returns empty array when no provider settings exist", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/provider-settings");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.providerSettings).toEqual([]);
  });
});

describe("PUT /provider-settings/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful reorder", async () => {
    mockRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/provider-settings/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers: ["cardmarket", "tcgplayer"] }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.reorder).toHaveBeenCalledWith(["cardmarket", "tcgplayer"]);
  });

  it("returns 400 when providers contain duplicates", async () => {
    const res = await app.request("/api/admin/v1/provider-settings/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers: ["tcgplayer", "tcgplayer"] }),
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("Duplicate");
  });
});

describe("PATCH /provider-settings/:provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when updating sortOrder", async () => {
    mockRepo.upsert.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/provider-settings/tcgplayer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortOrder: 5 }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.upsert).toHaveBeenCalledWith("tcgplayer", { sortOrder: 5 });
  });

  it("returns 204 when updating isHidden", async () => {
    mockRepo.upsert.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/provider-settings/cardmarket", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isHidden: true }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.upsert).toHaveBeenCalledWith("cardmarket", { isHidden: true });
  });

  it("returns 204 when updating both fields", async () => {
    mockRepo.upsert.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/provider-settings/cardtrader", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortOrder: 2, isHidden: false }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.upsert).toHaveBeenCalledWith("cardtrader", { sortOrder: 2, isHidden: false });
  });

  it("returns 204 when updating helperReviewable", async () => {
    mockRepo.upsert.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/provider-settings/gallery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ helperReviewable: true }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.upsert).toHaveBeenCalledWith("gallery", { helperReviewable: true });
  });
});
