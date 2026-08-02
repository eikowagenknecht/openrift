import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { deckCheckClaimRouter } from "./deck-check-claim";

interface ClaimLanding {
  tournamentId: string;
  tournamentName: string;
  startsAt: Date;
  hostName: string;
  hostType: "user" | "organization";
  groupName: string | null;
  deckSubmission: "none" | "optional" | "required";
  participantName: string;
}

const mockTournamentsRepo = {
  getClaimLandingByToken: vi.fn(
    () => Promise.resolve(undefined) as Promise<ClaimLanding | undefined>,
  ),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    tournaments: mockTournamentsRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, deckCheckClaimRouter);

describe("GET /api/v1/deck-check/claim/:token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the tournament, organizer, group, and spot when the token resolves", async () => {
    mockTournamentsRepo.getClaimLandingByToken.mockResolvedValue({
      tournamentId: "trn-1",
      tournamentName: "Regional Qualifier",
      startsAt: new Date("2026-06-01T12:00:00.000Z"),
      hostName: "Demacia Esports",
      hostType: "organization",
      groupName: "Demacia Cardists",
      deckSubmission: "required",
      participantName: "A. Player",
    });

    const res = await app.request("/api/v1/deck-check/claim/tok-abc");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.tournamentName).toBe("Regional Qualifier");
    // The Date is serialized to an ISO string for the response.
    expect(json.startsAt).toBe("2026-06-01T12:00:00.000Z");
    expect(json.hostName).toBe("Demacia Esports");
    expect(json.groupName).toBe("Demacia Cardists");
    expect(json.deckSubmission).toBe("required");
    expect(json.participantName).toBe("A. Player");
    expect(mockTournamentsRepo.getClaimLandingByToken).toHaveBeenCalledWith("tok-abc");
  });

  it("returns a null group for a personally-hosted tournament", async () => {
    mockTournamentsRepo.getClaimLandingByToken.mockResolvedValue({
      tournamentId: "trn-2",
      tournamentName: "Kitchen Table Pods",
      startsAt: new Date("2026-07-15T18:30:00.000Z"),
      hostName: "Jane Host",
      hostType: "user",
      groupName: null,
      deckSubmission: "none",
      participantName: "B. Player",
    });

    const res = await app.request("/api/v1/deck-check/claim/tok-solo");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.groupName).toBeNull();
    expect(json.hostName).toBe("Jane Host");
    expect(json.deckSubmission).toBe("none");
  });

  it("returns 404 with the claim-not-found message when the token is unknown", async () => {
    mockTournamentsRepo.getClaimLandingByToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/deck-check/claim/unknown");
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Claim link not found");
  });
});
