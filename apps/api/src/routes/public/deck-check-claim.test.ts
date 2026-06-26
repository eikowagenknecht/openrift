import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { deckCheckClaimRouter } from "./deck-check-claim";

const mockDeckCheckRepo = {
  getClaimLandingByToken: vi.fn(
    () =>
      Promise.resolve(undefined) as Promise<{ eventName: string; groupName: string } | undefined>,
  ),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    deckCheck: mockDeckCheckRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, deckCheckClaimRouter);

describe("GET /api/v1/deck-check/claim/:token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the event and group names when the token resolves", async () => {
    mockDeckCheckRepo.getClaimLandingByToken.mockResolvedValue({
      eventName: "Regional Qualifier",
      groupName: "Demacia Cardists",
    });

    const res = await app.request("/api/v1/deck-check/claim/tok-abc");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eventName).toBe("Regional Qualifier");
    expect(json.groupName).toBe("Demacia Cardists");
    expect(mockDeckCheckRepo.getClaimLandingByToken).toHaveBeenCalledWith("tok-abc");
  });

  it("returns 404 with the claim-not-found message when the token is unknown", async () => {
    mockDeckCheckRepo.getClaimLandingByToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/deck-check/claim/unknown");
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe("Claim link not found");
  });
});
