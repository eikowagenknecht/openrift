import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ignoredProductsRoute } from "./ignored-products";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockMktAdmin = {
  listIgnoredProducts: vi.fn(),
  getStagingProductNames: vi.fn(),
  insertIgnoredProducts: vi.fn(),
  insertIgnoredVariants: vi.fn(),
  deleteIgnoredProducts: vi.fn(),
  deleteIgnoredVariants: vi.fn(),
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
  .route("/api/v1", ignoredProductsRoute);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const now = new Date("2026-03-17T00:00:00Z");

const dbIgnoredProductL2 = {
  level: "product" as const,
  marketplace: "tcgplayer",
  externalId: 12_345,
  productName: "Fire Dragon",
  createdAt: now,
};

const dbIgnoredVariantL3 = {
  level: "variant" as const,
  marketplace: "cardmarket",
  externalId: 67_890,
  finish: "foil",
  language: "EN",
  productName: "Ice Elemental",
  createdAt: now,
};

// ---------------------------------------------------------------------------
// GET /api/v1/ignored-products
// ---------------------------------------------------------------------------

describe("GET /api/v1/ignored-products", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with serialized L2 + L3 ignored products", async () => {
    mockMktAdmin.listIgnoredProducts.mockResolvedValue([dbIgnoredProductL2, dbIgnoredVariantL3]);
    const res = await app.request("/api/v1/ignored-products");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.products).toHaveLength(2);
    expect(json.products[0]).toEqual({
      level: "product",
      marketplace: "tcgplayer",
      externalId: 12_345,
      productName: "Fire Dragon",
      createdAt: now.toISOString(),
    });
    expect(json.products[1]).toEqual({
      level: "variant",
      marketplace: "cardmarket",
      externalId: 67_890,
      finish: "foil",
      language: "EN",
      productName: "Ice Elemental",
      createdAt: now.toISOString(),
    });
  });

  it("returns empty array when no products are ignored", async () => {
    mockMktAdmin.listIgnoredProducts.mockResolvedValue([]);
    const res = await app.request("/api/v1/ignored-products");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.products).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/ignored-products (L2 — product level)
// ---------------------------------------------------------------------------

describe("POST /api/v1/ignored-products (L2)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ignores products at level 2 (whole upstream product)", async () => {
    mockMktAdmin.getStagingProductNames.mockResolvedValue([
      { externalId: 12_345, productName: "Fire Dragon" },
      { externalId: 67_890, productName: "Ice Elemental" },
    ]);
    mockMktAdmin.insertIgnoredProducts.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/ignored-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "product",
        marketplace: "tcgplayer",
        products: [{ externalId: 12_345 }, { externalId: 67_890 }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(2);
    expect(mockMktAdmin.insertIgnoredProducts).toHaveBeenCalledWith([
      {
        marketplace: "tcgplayer",
        externalId: 12_345,
        productName: "Fire Dragon",
      },
      {
        marketplace: "tcgplayer",
        externalId: 67_890,
        productName: "Ice Elemental",
      },
    ]);
    expect(mockMktAdmin.insertIgnoredVariants).not.toHaveBeenCalled();
  });

  it("filters out products not found in staging", async () => {
    mockMktAdmin.getStagingProductNames.mockResolvedValue([
      { externalId: 12_345, productName: "Fire Dragon" },
    ]);
    mockMktAdmin.insertIgnoredProducts.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/ignored-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "product",
        marketplace: "tcgplayer",
        products: [{ externalId: 12_345 }, { externalId: 99_999 }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(1);
  });

  it("returns 0 and skips insert when no products match staging", async () => {
    mockMktAdmin.getStagingProductNames.mockResolvedValue([]);

    const res = await app.request("/api/v1/ignored-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "product",
        marketplace: "tcgplayer",
        products: [{ externalId: 99_999 }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(0);
    expect(mockMktAdmin.insertIgnoredProducts).not.toHaveBeenCalled();
  });

  it("uses first staging name when duplicates exist", async () => {
    mockMktAdmin.getStagingProductNames.mockResolvedValue([
      { externalId: 12_345, productName: "Fire Dragon" },
      { externalId: 12_345, productName: "Fire Dragon (Alternate)" },
    ]);
    mockMktAdmin.insertIgnoredProducts.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/ignored-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "product",
        marketplace: "tcgplayer",
        products: [{ externalId: 12_345 }],
      }),
    });
    expect(res.status).toBe(200);
    expect(mockMktAdmin.insertIgnoredProducts).toHaveBeenCalledWith([
      {
        marketplace: "tcgplayer",
        externalId: 12_345,
        productName: "Fire Dragon",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/ignored-products (L3 — variant level)
// ---------------------------------------------------------------------------

describe("POST /api/v1/ignored-products (L3)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ignores variants at level 3 (specific finish/language SKU)", async () => {
    mockMktAdmin.getStagingProductNames.mockResolvedValue([
      { externalId: 12_345, productName: "Fire Dragon" },
    ]);
    mockMktAdmin.insertIgnoredVariants.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/ignored-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "variant",
        marketplace: "tcgplayer",
        products: [{ externalId: 12_345, finish: "foil", language: "EN" }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(1);
    expect(mockMktAdmin.insertIgnoredVariants).toHaveBeenCalledWith([
      {
        marketplace: "tcgplayer",
        externalId: 12_345,
        finish: "foil",
        language: "EN",
        productName: "Fire Dragon",
      },
    ]);
    expect(mockMktAdmin.insertIgnoredProducts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/ignored-products
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/ignored-products (L2)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with count of unignored L2 products", async () => {
    mockMktAdmin.deleteIgnoredProducts.mockResolvedValue(2);
    const res = await app.request("/api/v1/ignored-products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "product",
        marketplace: "tcgplayer",
        products: [{ externalId: 12_345 }, { externalId: 67_890 }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unignored).toBe(2);
    expect(mockMktAdmin.deleteIgnoredProducts).toHaveBeenCalledWith("tcgplayer", [12_345, 67_890]);
  });

  it("returns 0 when no products were unignored", async () => {
    mockMktAdmin.deleteIgnoredProducts.mockResolvedValue(0);
    const res = await app.request("/api/v1/ignored-products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "product",
        marketplace: "cardmarket",
        products: [{ externalId: 99_999 }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unignored).toBe(0);
  });
});

describe("DELETE /api/v1/ignored-products (L3)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with count of unignored L3 variants", async () => {
    mockMktAdmin.deleteIgnoredVariants.mockResolvedValue(1);
    const res = await app.request("/api/v1/ignored-products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "variant",
        marketplace: "tcgplayer",
        products: [{ externalId: 12_345, finish: "normal", language: "EN" }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unignored).toBe(1);
    expect(mockMktAdmin.deleteIgnoredVariants).toHaveBeenCalledWith("tcgplayer", [
      { externalId: 12_345, finish: "normal", language: "EN" },
    ]);
  });
});
