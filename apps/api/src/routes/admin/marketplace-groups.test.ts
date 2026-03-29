import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { marketplaceGroupsRoute } from "./marketplace-groups";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockMktAdmin = {
  listAllGroups: vi.fn(),
  stagingCountsByMarketplaceGroup: vi.fn(),
  assignedCountsByMarketplaceGroup: vi.fn(),
  updateGroupName: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { marketplaceAdmin: mockMktAdmin } as never);
    await next();
  })
  .route("/api/v1", marketplaceGroupsRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dbGroup1 = {
  marketplace: "tcgplayer",
  groupId: 100,
  name: "Origin Set",
  abbreviation: "OGS",
};

const dbGroup2 = {
  marketplace: "cardmarket",
  groupId: 200,
  name: null,
  abbreviation: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/marketplace-groups", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with groups including staging and assigned counts", async () => {
    mockMktAdmin.listAllGroups.mockResolvedValue([dbGroup1, dbGroup2]);
    mockMktAdmin.stagingCountsByMarketplaceGroup.mockResolvedValue([
      { marketplace: "tcgplayer", groupId: 100, count: 50 },
    ]);
    mockMktAdmin.assignedCountsByMarketplaceGroup.mockResolvedValue([
      { marketplace: "tcgplayer", groupId: 100, count: 30 },
      { marketplace: "cardmarket", groupId: 200, count: 10 },
    ]);

    const res = await app.request("/api/v1/marketplace-groups");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.groups).toHaveLength(2);
    expect(json.groups[0]).toEqual({
      marketplace: "tcgplayer",
      groupId: 100,
      name: "Origin Set",
      abbreviation: "OGS",
      stagedCount: 50,
      assignedCount: 30,
    });
    expect(json.groups[1]).toEqual({
      marketplace: "cardmarket",
      groupId: 200,
      name: null,
      abbreviation: null,
      stagedCount: 0,
      assignedCount: 10,
    });
  });

  it("defaults counts to 0 when no staging or assigned data", async () => {
    mockMktAdmin.listAllGroups.mockResolvedValue([dbGroup2]);
    mockMktAdmin.stagingCountsByMarketplaceGroup.mockResolvedValue([]);
    mockMktAdmin.assignedCountsByMarketplaceGroup.mockResolvedValue([]);

    const res = await app.request("/api/v1/marketplace-groups");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.groups[0].stagedCount).toBe(0);
    expect(json.groups[0].assignedCount).toBe(0);
  });
});

describe("PATCH /api/v1/marketplace-groups/:marketplace/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful update", async () => {
    mockMktAdmin.updateGroupName.mockResolvedValue(true);
    const res = await app.request("/api/v1/marketplace-groups/tcgplayer/100", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Group" }),
    });
    expect(res.status).toBe(204);
    expect(mockMktAdmin.updateGroupName).toHaveBeenCalledWith("tcgplayer", 100, "Renamed Group");
  });

  it("returns 204 when setting name to null", async () => {
    mockMktAdmin.updateGroupName.mockResolvedValue(true);
    const res = await app.request("/api/v1/marketplace-groups/cardmarket/200", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: null }),
    });
    expect(res.status).toBe(204);
    expect(mockMktAdmin.updateGroupName).toHaveBeenCalledWith("cardmarket", 200, null);
  });

  it("returns 404 when group not found", async () => {
    mockMktAdmin.updateGroupName.mockResolvedValue(false);
    const res = await app.request("/api/v1/marketplace-groups/tcgplayer/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unknown" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("not found");
  });
});
