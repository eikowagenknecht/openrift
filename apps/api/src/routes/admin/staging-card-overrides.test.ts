/* oxlint-disable
   unicorn/no-useless-undefined
   -- test file: mocks resolve with explicit undefined */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminStagingCardOverridesRouter } from "./staging-card-overrides";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockMktAdmin = {
  upsertStagingCardOverride: vi.fn(),
  deleteStagingCardOverride: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test app — mount the oRPC router directly (without the requireAdmin gate).
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { marketplaceAdmin: mockMktAdmin } as never);
  await next();
});
registerRouterForTest(app, adminStagingCardOverridesRouter);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /staging-card-overrides", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when override is created", async () => {
    mockMktAdmin.upsertStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "tcgplayer",
        externalId: 12_345,
        finish: "normal",
        language: "EN",
        cardId: "00000000-0000-4000-a000-000000000031",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMktAdmin.upsertStagingCardOverride).toHaveBeenCalledWith({
      marketplace: "tcgplayer",
      externalId: 12_345,
      finish: "normal",
      language: "EN",
      cardId: "00000000-0000-4000-a000-000000000031",
    });
  });

  it("returns 204 with a null language", async () => {
    mockMktAdmin.upsertStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "cardmarket",
        externalId: 67_890,
        finish: "foil",
        language: null,
        cardId: "00000000-0000-4000-a000-000000000032",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMktAdmin.upsertStagingCardOverride).toHaveBeenCalledWith({
      marketplace: "cardmarket",
      externalId: 67_890,
      finish: "foil",
      language: null,
      cardId: "00000000-0000-4000-a000-000000000032",
    });
  });

  it("returns 400 for an invalid marketplace", async () => {
    const res = await app.request("/api/admin/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "invalid",
        externalId: 12_345,
        finish: "normal",
        language: "EN",
        cardId: "00000000-0000-4000-a000-000000000031",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await app.request("/api/admin/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "tcgplayer" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /staging-card-overrides", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and reads the SKU key from query params", async () => {
    mockMktAdmin.deleteStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request(
      "/api/admin/v1/staging-card-overrides?marketplace=tcgplayer&externalId=12345&finish=normal&language=EN",
      { method: "DELETE" },
    );

    expect(res.status).toBe(204);
    expect(mockMktAdmin.deleteStagingCardOverride).toHaveBeenCalledWith(
      "tcgplayer",
      12_345,
      "normal",
      "EN",
    );
  });

  it("passes null when language is omitted", async () => {
    mockMktAdmin.deleteStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request(
      "/api/admin/v1/staging-card-overrides?marketplace=cardmarket&externalId=67890&finish=foil",
      { method: "DELETE" },
    );

    expect(res.status).toBe(204);
    expect(mockMktAdmin.deleteStagingCardOverride).toHaveBeenCalledWith(
      "cardmarket",
      67_890,
      "foil",
      null,
    );
  });

  it("returns 400 for an invalid marketplace", async () => {
    const res = await app.request(
      "/api/admin/v1/staging-card-overrides?marketplace=invalid&externalId=12345&finish=normal",
      { method: "DELETE" },
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when required query params are missing", async () => {
    const res = await app.request("/api/admin/v1/staging-card-overrides?marketplace=tcgplayer", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
  });
});
