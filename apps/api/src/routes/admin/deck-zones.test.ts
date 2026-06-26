import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminDeckZonesRouter } from "./deck-zones";

const mockRepo = {
  listAll: vi.fn(),
  reorder: vi.fn(),
  update: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { deckZones: mockRepo } as never);
  await next();
});
registerRouterForTest(app, adminDeckZonesRouter);

const baseRow = {
  slug: "main",
  label: "Main Deck",
  sortOrder: 0,
  isWellKnown: true,
};
const otherRow = {
  slug: "side",
  label: "Sideboard",
  sortOrder: 1,
  isWellKnown: false,
};

describe("GET /deck-zones", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the zones", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    const res = await app.request("/api/admin/v1/deck-zones");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deckZones).toHaveLength(2);
    expect(json.deckZones[0]).toEqual(baseRow);
  });

  it("returns an empty array when there are no zones", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/deck-zones");
    expect(res.status).toBe(200);
    const lintBody = await res.json();
    expect(lintBody.deckZones).toEqual([]);
  });
});

describe("PUT /deck-zones/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and reorders when all slugs are known and complete", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    mockRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/deck-zones/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["side", "main"] }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.reorder).toHaveBeenCalledWith(["side", "main"]);
  });

  it("returns 400 on duplicate slugs", async () => {
    const res = await app.request("/api/admin/v1/deck-zones/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["main", "main"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Duplicate slugs");
    expect(mockRepo.reorder).not.toHaveBeenCalled();
  });

  it("returns 400 when slug count does not match the zone count", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    const res = await app.request("/api/admin/v1/deck-zones/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["main"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Expected 2 slugs");
    expect(mockRepo.reorder).not.toHaveBeenCalled();
  });

  it("returns 400 on unknown slugs", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    const res = await app.request("/api/admin/v1/deck-zones/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["main", "nope"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Unknown deck zone slugs: nope");
    expect(mockRepo.reorder).not.toHaveBeenCalled();
  });
});

describe("PATCH /deck-zones/:slug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and updates the label", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/deck-zones/main", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Renamed" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith("main", { label: "Renamed" });
  });

  it("does not call update when no label is provided", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    const res = await app.request("/api/admin/v1/deck-zones/main", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the zone does not exist", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    const res = await app.request("/api/admin/v1/deck-zones/ghost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });
    expect(res.status).toBe(404);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
