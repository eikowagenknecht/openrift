/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stagingCardOverridesRoute } from "./staging-card-overrides";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockMktAdmin = {
  upsertStagingCardOverride: vi.fn(),
  deleteStagingCardOverride: vi.fn(),
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
  .route("/api/v1", stagingCardOverridesRoute);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/staging-card-overrides", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when override is created", async () => {
    mockMktAdmin.upsertStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "tcgplayer",
        externalId: 12_345,
        finish: "normal",
        language: "EN",
        cardId: "card-uuid-1",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMktAdmin.upsertStagingCardOverride).toHaveBeenCalledWith({
      marketplace: "tcgplayer",
      externalId: 12_345,
      finish: "normal",
      language: "EN",
      cardId: "card-uuid-1",
    });
  });

  it("returns 204 with cardmarket marketplace", async () => {
    mockMktAdmin.upsertStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "cardmarket",
        externalId: 67_890,
        finish: "foil",
        language: "EN",
        cardId: "card-uuid-2",
      }),
    });

    expect(res.status).toBe(204);
  });

  it("returns 204 with cardtrader marketplace", async () => {
    mockMktAdmin.upsertStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "cardtrader",
        externalId: 11_111,
        finish: "normal",
        language: "EN",
        cardId: "card-uuid-3",
      }),
    });

    expect(res.status).toBe(204);
  });

  it("returns 400 for invalid marketplace", async () => {
    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "invalid",
        externalId: 12_345,
        finish: "normal",
        language: "EN",
        cardId: "card-uuid-1",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "tcgplayer",
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/staging-card-overrides", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when override is deleted", async () => {
    mockMktAdmin.deleteStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "tcgplayer",
        externalId: 12_345,
        finish: "normal",
        language: "EN",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMktAdmin.deleteStagingCardOverride).toHaveBeenCalledWith(
      "tcgplayer",
      12_345,
      "normal",
      "EN",
    );
  });

  it("returns 204 with cardmarket marketplace", async () => {
    mockMktAdmin.deleteStagingCardOverride.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "cardmarket",
        externalId: 67_890,
        finish: "foil",
        language: "EN",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMktAdmin.deleteStagingCardOverride).toHaveBeenCalledWith(
      "cardmarket",
      67_890,
      "foil",
      "EN",
    );
  });

  it("returns 400 for invalid marketplace", async () => {
    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "invalid",
        externalId: 12_345,
        finish: "normal",
        language: "EN",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await app.request("/api/v1/staging-card-overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: "tcgplayer",
      }),
    });

    expect(res.status).toBe(400);
  });
});
