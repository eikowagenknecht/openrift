/* oxlint-disable
   unicorn/no-useless-undefined
   -- test file: mocks resolve with explicit undefined */
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { Hono } from "hono";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appErrorInterceptor } from "../../orpc/app-error-interceptor.js";
import { buildApiContext } from "../../orpc/context.js";
import { saveMappings, unmapPrinting } from "../../services/marketplace-mapping.js";
import { buildUnifiedMappingsResponse } from "../../services/unified-mapping-merge.js";
import type { Variables } from "../../types.js";
import { adminUnifiedMappingsRouter } from "./unified-mappings";

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock("../../services/marketplace-mapping.js", () => ({
  saveMappings: vi.fn(),
  unmapPrinting: vi.fn(),
}));

vi.mock("../../services/unified-mapping-merge.js", () => ({
  buildUnifiedMappingsResponse: vi.fn(),
  buildUnifiedMappingsCardResponse: vi.fn(),
}));

const mockSaveMappings = vi.mocked(saveMappings);
const mockUnmapPrinting = vi.mocked(unmapPrinting);
const mockBuildUnifiedMappings = vi.mocked(buildUnifiedMappingsResponse);

// ---------------------------------------------------------------------------
// Mock repos and services
// ---------------------------------------------------------------------------

const mockMarketplaceMapping = {
  pricesByMarketplace: vi.fn(),
};

const mockGetMappingOverview = vi.fn();

// ---------------------------------------------------------------------------
// Test app — mount the oRPC router directly (without the requireAdmin gate).
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const handler = new OpenAPIHandler(adminUnifiedMappingsRouter, {
  interceptors: [appErrorInterceptor],
});
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { marketplaceMapping: mockMarketplaceMapping } as never);
  c.set("transact", vi.fn() as never);
  c.set("services", { getMappingOverview: mockGetMappingOverview } as never);
  await next();
});
const handle = async (c: Context<{ Variables: Variables }>) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    context: buildApiContext(c),
  });
  if (matched && response) {
    return response;
  }
  return c.notFound();
};
for (const path of [
  "/api/admin/v1/marketplace-mappings",
  "/api/admin/v1/marketplace-mappings/card/:cardId",
]) {
  app.all(path, handle);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/v1/marketplace-mappings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with unified mappings response", async () => {
    const mockResponse = {
      groups: [],
      unmatchedProducts: { tcgplayer: [], cardmarket: [], cardtrader: [] },
      allCards: [],
    };
    mockBuildUnifiedMappings.mockResolvedValue(mockResponse);

    const res = await app.request("/api/admin/v1/marketplace-mappings");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(mockResponse);
    expect(mockBuildUnifiedMappings).toHaveBeenCalledTimes(1);
  });

  it("passes all three marketplace configs", async () => {
    mockBuildUnifiedMappings.mockResolvedValue({} as any);

    await app.request("/api/admin/v1/marketplace-mappings");

    const lastCallArgs = mockBuildUnifiedMappings.mock.calls[0];
    expect(lastCallArgs[1]).toHaveProperty("marketplace", "tcgplayer");
    expect(lastCallArgs[2]).toHaveProperty("marketplace", "cardmarket");
    expect(lastCallArgs[3]).toHaveProperty("marketplace", "cardtrader");
  });
});

describe("POST /api/admin/v1/marketplace-mappings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with save result for tcgplayer", async () => {
    mockSaveMappings.mockResolvedValue({ saved: 2, skipped: [] });

    const res = await app.request("/api/admin/v1/marketplace-mappings?marketplace=tcgplayer", {
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

    const res = await app.request("/api/admin/v1/marketplace-mappings?marketplace=cardmarket", {
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

    const res = await app.request("/api/admin/v1/marketplace-mappings?marketplace=tcgplayer", {
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
    const res = await app.request("/api/admin/v1/marketplace-mappings?marketplace=invalid", {
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

describe("DELETE /api/admin/v1/marketplace-mappings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when printing is unmapped", async () => {
    mockUnmapPrinting.mockResolvedValue(undefined);

    const res = await app.request(
      "/api/admin/v1/marketplace-mappings?marketplace=tcgplayer&printingId=00000000-0000-4000-a000-000000000001&externalId=100&finish=normal",
      { method: "DELETE" },
    );

    expect(res.status).toBe(204);
    expect(mockUnmapPrinting).toHaveBeenCalledTimes(1);
    expect(mockUnmapPrinting).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "00000000-0000-4000-a000-000000000001",
      100,
      "normal",
      null,
    );
  });

  it("returns 204 for cardmarket", async () => {
    mockUnmapPrinting.mockResolvedValue(undefined);

    const res = await app.request(
      "/api/admin/v1/marketplace-mappings?marketplace=cardmarket&printingId=00000000-0000-4000-a000-000000000002&externalId=200&finish=normal",
      { method: "DELETE" },
    );

    expect(res.status).toBe(204);
  });

  it("forwards finish + language so CT siblings unmap independently", async () => {
    mockUnmapPrinting.mockResolvedValue(undefined);

    const res = await app.request(
      "/api/admin/v1/marketplace-mappings?marketplace=cardtrader&printingId=00000000-0000-4000-a000-000000000003&externalId=300&finish=normal&language=ZH",
      { method: "DELETE" },
    );

    expect(res.status).toBe(204);
    expect(mockUnmapPrinting).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "00000000-0000-4000-a000-000000000003",
      300,
      "normal",
      "ZH",
    );
  });

  it("returns 400 when externalId is missing", async () => {
    const res = await app.request("/api/admin/v1/marketplace-mappings?marketplace=tcgplayer", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printingId: "00000000-0000-4000-a000-000000000001",
        finish: "normal",
        language: null,
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when finish is missing", async () => {
    const res = await app.request("/api/admin/v1/marketplace-mappings?marketplace=tcgplayer", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printingId: "00000000-0000-4000-a000-000000000001",
        externalId: 100,
        language: null,
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid marketplace", async () => {
    const res = await app.request("/api/admin/v1/marketplace-mappings?marketplace=invalid", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printingId: "00000000-0000-4000-a000-000000000001",
        externalId: 100,
        finish: "normal",
        language: null,
      }),
    });

    expect(res.status).toBe(400);
  });
});
