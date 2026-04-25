/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveMappings, unmapPrinting, unmapAll } from "../../services/marketplace-mapping.js";
import { buildUnifiedMappingsResponse } from "../../services/unified-mapping-merge.js";
import { unifiedMappingsRoute } from "./unified-mappings";

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock("../../services/marketplace-mapping.js", () => ({
  saveMappings: vi.fn(),
  unmapPrinting: vi.fn(),
  unmapAll: vi.fn(),
}));

vi.mock("../../services/unified-mapping-merge.js", () => ({
  buildUnifiedMappingsResponse: vi.fn(),
}));

const mockSaveMappings = vi.mocked(saveMappings);
const mockUnmapPrinting = vi.mocked(unmapPrinting);
const mockUnmapAll = vi.mocked(unmapAll);
const mockBuildUnifiedMappings = vi.mocked(buildUnifiedMappingsResponse);

// ---------------------------------------------------------------------------
// Mock repos and services
// ---------------------------------------------------------------------------

const mockMarketplaceMapping = {
  pricesByMarketplace: vi.fn(),
};

const mockGetMappingOverview = vi.fn();

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { marketplaceMapping: mockMarketplaceMapping } as never);
    c.set("transact", vi.fn() as never);
    c.set("services", { getMappingOverview: mockGetMappingOverview } as never);
    await next();
  })
  .route("/api/v1", unifiedMappingsRoute);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/marketplace-mappings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with unified mappings response", async () => {
    const mockResponse = {
      groups: [],
      unmatchedProducts: [],
      ignoredProducts: [],
      allCards: [],
    };
    mockBuildUnifiedMappings.mockResolvedValue(mockResponse);

    const res = await app.request("/api/v1/marketplace-mappings");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(mockResponse);
    expect(mockBuildUnifiedMappings).toHaveBeenCalledTimes(1);
  });

  it("passes showAll=true when all=true query param is set", async () => {
    mockBuildUnifiedMappings.mockResolvedValue({} as any);

    await app.request("/api/v1/marketplace-mappings?all=true");

    const lastCallArgs = mockBuildUnifiedMappings.mock.calls[0];
    expect(lastCallArgs[5]).toBe(true);
  });

  it("passes showAll=false when all query param is not set", async () => {
    mockBuildUnifiedMappings.mockResolvedValue({} as any);

    await app.request("/api/v1/marketplace-mappings");

    const lastCallArgs = mockBuildUnifiedMappings.mock.calls[0];
    expect(lastCallArgs[5]).toBe(false);
  });

  it("passes all three marketplace configs", async () => {
    mockBuildUnifiedMappings.mockResolvedValue({} as any);

    await app.request("/api/v1/marketplace-mappings");

    const lastCallArgs = mockBuildUnifiedMappings.mock.calls[0];
    expect(lastCallArgs[1]).toHaveProperty("marketplace", "tcgplayer");
    expect(lastCallArgs[2]).toHaveProperty("marketplace", "cardmarket");
    expect(lastCallArgs[3]).toHaveProperty("marketplace", "cardtrader");
  });
});

describe("POST /api/v1/marketplace-mappings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with save result for tcgplayer", async () => {
    mockSaveMappings.mockResolvedValue({ saved: 2, skipped: [] });

    const res = await app.request("/api/v1/marketplace-mappings?marketplace=tcgplayer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappings: [
          {
            printingId: "00000000-0000-4000-a000-000000000001",
            externalId: 12_345,
            finish: "normal",
            language: null,
          },
          {
            printingId: "00000000-0000-4000-a000-000000000002",
            externalId: 67_890,
            finish: "foil",
            language: null,
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(2);
    expect(json.skipped).toEqual([]);
    expect(mockSaveMappings).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with save result for cardmarket", async () => {
    mockSaveMappings.mockResolvedValue({ saved: 1, skipped: [] });

    const res = await app.request("/api/v1/marketplace-mappings?marketplace=cardmarket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappings: [
          {
            printingId: "00000000-0000-4000-a000-000000000001",
            externalId: 12_345,
            finish: "normal",
            language: null,
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(1);
  });

  it("returns 200 with skipped items", async () => {
    mockSaveMappings.mockResolvedValue({
      saved: 0,
      skipped: [{ externalId: 12_345, reason: "printing not found" }],
    });

    const res = await app.request("/api/v1/marketplace-mappings?marketplace=tcgplayer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappings: [
          {
            printingId: "00000000-0000-4000-a000-000000000099",
            externalId: 12_345,
            finish: "normal",
            language: null,
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saved).toBe(0);
    expect(json.skipped).toHaveLength(1);
  });

  it("returns 400 for invalid marketplace", async () => {
    const res = await app.request("/api/v1/marketplace-mappings?marketplace=invalid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappings: [
          {
            printingId: "00000000-0000-4000-a000-000000000001",
            externalId: 12_345,
            finish: "normal",
            language: null,
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/marketplace-mappings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when printing is unmapped", async () => {
    mockUnmapPrinting.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/marketplace-mappings?marketplace=tcgplayer", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "00000000-0000-4000-a000-000000000001" }),
    });

    expect(res.status).toBe(204);
    expect(mockUnmapPrinting).toHaveBeenCalledTimes(1);
  });

  it("returns 204 for cardmarket", async () => {
    mockUnmapPrinting.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/marketplace-mappings?marketplace=cardmarket", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "00000000-0000-4000-a000-000000000002" }),
    });

    expect(res.status).toBe(204);
  });

  it("returns 400 for invalid marketplace", async () => {
    const res = await app.request("/api/v1/marketplace-mappings?marketplace=invalid", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "00000000-0000-4000-a000-000000000001" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/marketplace-mappings/all", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with unmapped count for tcgplayer", async () => {
    mockUnmapAll.mockResolvedValue({ unmapped: 10 });

    const res = await app.request("/api/v1/marketplace-mappings/all?marketplace=tcgplayer", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unmapped).toBe(10);
    expect(mockUnmapAll).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with unmapped count for cardtrader", async () => {
    mockUnmapAll.mockResolvedValue({ unmapped: 5 });

    const res = await app.request("/api/v1/marketplace-mappings/all?marketplace=cardtrader", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unmapped).toBe(5);
  });

  it("returns 400 for invalid marketplace", async () => {
    const res = await app.request("/api/v1/marketplace-mappings/all?marketplace=invalid", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
  });
});
