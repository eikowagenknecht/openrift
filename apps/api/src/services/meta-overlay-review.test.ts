import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { acceptMetaEventOverlay } from "./meta-overlay-review.js";
import { promoteNewEvent } from "./meta-promote.js";

vi.mock("./meta-promote.js", () => ({ promoteMetaEvent: vi.fn(), promoteNewEvent: vi.fn() }));

const OVERLAY_ID = "b0000000-0001-4000-a000-000000000001";

/** A pending proposal carrying everything a mint needs. */
const PROPOSAL = {
  id: OVERLAY_ID,
  metaEventId: null,
  provider: null,
  externalId: null,
  name: "Summoner Skirmish",
  eventDate: "2026-08-15",
  format: "constructed",
  status: "pending",
};

const mockOverlays = {
  eventOverlayById: vi.fn(),
  setEventOverlayStatus: vi.fn(),
  updateEventOverlay: vi.fn(),
  adoptProposedPlayers: vi.fn(),
};

const repos = { metaOverlays: mockOverlays } as unknown as Repos;

beforeEach(() => {
  vi.clearAllMocks();
  mockOverlays.eventOverlayById.mockResolvedValue(PROPOSAL);
});

describe("acceptMetaEventOverlay", () => {
  it("leaves a proposal pending when minting its live event fails", async () => {
    vi.mocked(promoteNewEvent).mockRejectedValue(new Error("connection lost"));

    await expect(acceptMetaEventOverlay(repos, OVERLAY_ID)).rejects.toThrow("connection lost");

    // An overlay flipped to accepted before the mint would be stranded: gone
    // from the pending queue, with no live event behind it.
    expect(mockOverlays.setEventOverlayStatus).not.toHaveBeenCalled();
    expect(mockOverlays.updateEventOverlay).not.toHaveBeenCalled();
  });

  it("accepts and re-points the proposal in one write once the mint lands", async () => {
    vi.mocked(promoteNewEvent).mockResolvedValue({
      metaEventId: "e0000000-0001-4000-a000-000000000001",
      slug: "summoner-skirmish",
      created: true,
    });

    const result = await acceptMetaEventOverlay(repos, OVERLAY_ID);

    expect(result).toEqual({
      metaEventId: "e0000000-0001-4000-a000-000000000001",
      created: true,
    });
    expect(mockOverlays.updateEventOverlay).toHaveBeenCalledWith(
      OVERLAY_ID,
      expect.objectContaining({
        metaEventId: "e0000000-0001-4000-a000-000000000001",
        status: "accepted",
      }),
    );
  });
});
