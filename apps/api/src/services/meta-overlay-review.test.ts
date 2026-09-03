import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import { playerSourceKey } from "./ingest-meta-overlays.js";
import {
  acceptMetaEventOverlay,
  linkMetaPlayerOverlay,
  listMetaUploadsForEvent,
  moveMetaEventOverlay,
  revertMetaUpload,
} from "./meta-overlay-review.js";
import { promoteMetaEvent, promoteNewEvent } from "./meta-promote.js";

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
  claimedFields: ["name", "eventDate", "format"],
};

const UPLOAD = {
  ...PROPOSAL,
  metaEventId: "e0000000-0001-4000-a000-000000000001",
  provider: "morpush",
  externalId: "mor-evt",
};

const OTHER_EVENT_ID = "e0000000-0002-4000-a000-000000000002";
const LIVE_EVENT_ID = "e0000000-0001-4000-a000-000000000001";
const PLAYER_OVERLAY_ID = "c0000000-0001-4000-a000-000000000001";
const LIVE_PLAYER_ID = "f0000000-0001-4000-a000-000000000001";

const mockOverlays = {
  eventOverlayById: vi.fn(),
  setEventOverlayStatus: vi.fn(),
  updateEventOverlay: vi.fn(),
  adoptProposedPlayers: vi.fn(),
  reanchorPlayerOverlays: vi.fn(),
  pushOverlaysForEvent: vi.fn(),
  playerOverlaysForSourceEvent: vi.fn(),
  playerOverlaysForSourceEvents: vi.fn(),
  eventOverlaysBySourceKeys: vi.fn(),
  playerOverlayById: vi.fn(),
  linkPlayerOverlay: vi.fn(),
  updatePlayerOverlay: vi.fn(),
};

const mockMeta = {
  eventById: vi.fn(),
  mintedPlayerCounts: vi.fn(),
  playerById: vi.fn(),
  eventIdForPlayer: vi.fn(),
};

const repos = { metaOverlays: mockOverlays, meta: mockMeta } as unknown as Repos;

beforeEach(() => {
  vi.clearAllMocks();
  mockOverlays.eventOverlayById.mockResolvedValue(PROPOSAL);
  mockOverlays.reanchorPlayerOverlays.mockResolvedValue(0);
  mockOverlays.playerOverlaysForSourceEvent.mockResolvedValue([]);
  mockOverlays.eventOverlaysBySourceKeys.mockResolvedValue([]);
  mockMeta.eventById.mockResolvedValue({ id: OTHER_EVENT_ID });
  mockMeta.eventIdForPlayer.mockResolvedValue(LIVE_EVENT_ID);
});

describe("moveMetaEventOverlay", () => {
  it("refuses an overlay that no longer exists", async () => {
    mockOverlays.eventOverlayById.mockResolvedValue(undefined);

    await expect(moveMetaEventOverlay(repos, OVERLAY_ID, OTHER_EVENT_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses a person's overlay, which is a correction to one event", async () => {
    await expect(moveMetaEventOverlay(repos, OVERLAY_ID, OTHER_EVENT_ID)).rejects.toMatchObject({
      status: 400,
    });
    expect(mockOverlays.reanchorPlayerOverlays).not.toHaveBeenCalled();
  });

  it("refuses a target event that no longer exists", async () => {
    mockOverlays.eventOverlayById.mockResolvedValue(UPLOAD);
    mockMeta.eventById.mockResolvedValue(undefined);

    await expect(moveMetaEventOverlay(repos, OVERLAY_ID, OTHER_EVENT_ID)).rejects.toBeInstanceOf(
      AppError,
    );
    expect(mockOverlays.updateEventOverlay).not.toHaveBeenCalled();
  });

  it("writes nothing when the upload is already on the target", async () => {
    mockOverlays.eventOverlayById.mockResolvedValue(UPLOAD);

    const result = await moveMetaEventOverlay(repos, OVERLAY_ID, UPLOAD.metaEventId);

    expect(result).toEqual({ metaEventId: UPLOAD.metaEventId, created: false });
    expect(mockOverlays.updateEventOverlay).not.toHaveBeenCalled();
    expect(promoteMetaEvent).not.toHaveBeenCalled();
  });

  it("re-anchors the standings, keeps the status, and promotes both events", async () => {
    mockOverlays.eventOverlayById.mockResolvedValue(UPLOAD);

    await moveMetaEventOverlay(repos, OVERLAY_ID, OTHER_EVENT_ID);

    expect(mockOverlays.reanchorPlayerOverlays).toHaveBeenCalledWith(
      "morpush",
      "mor-evt",
      OTHER_EVENT_ID,
    );
    expect(mockOverlays.updateEventOverlay).toHaveBeenCalledWith(OVERLAY_ID, {
      metaEventId: OTHER_EVENT_ID,
    });
    expect(vi.mocked(promoteMetaEvent).mock.calls.map(([, id]) => id)).toEqual([
      UPLOAD.metaEventId,
      OTHER_EVENT_ID,
    ]);
  });
});

describe("revertMetaUpload", () => {
  it("refuses a source key no upload was filed under", async () => {
    await expect(revertMetaUpload(repos, "morpush", "mor-missing")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("listMetaUploadsForEvent", () => {
  it("counts each upload's standings by its own key, however the ids nest", async () => {
    const acceptedAt = new Date("2026-09-01T10:00:00Z");
    mockOverlays.pushOverlaysForEvent.mockResolvedValue([
      { ...UPLOAD, id: "ov-a", externalId: "evt-a", status: "accepted", acceptedAt },
      { ...UPLOAD, id: "ov-b", externalId: "evt-ab", status: "pending", acceptedAt: null },
    ]);
    mockOverlays.playerOverlaysForSourceEvents.mockResolvedValue([
      {
        id: "p1",
        provider: "morpush",
        sourcePlayerKey: playerSourceKey("evt-a", "x"),
        status: "accepted",
      },
      {
        id: "p2",
        provider: "morpush",
        sourcePlayerKey: playerSourceKey("evt-a", "y"),
        status: "pending",
      },
      {
        id: "p3",
        provider: "morpush",
        sourcePlayerKey: playerSourceKey("evt-ab", "z"),
        status: "accepted",
      },
      {
        id: "p4",
        provider: "other",
        sourcePlayerKey: playerSourceKey("evt-a", "x"),
        status: "accepted",
      },
    ]);
    mockMeta.mintedPlayerCounts.mockResolvedValue(
      new Map([
        ["p1", 1],
        ["p3", 2],
      ]),
    );

    const uploads = await listMetaUploadsForEvent(repos, UPLOAD.metaEventId);

    expect(mockMeta.mintedPlayerCounts).toHaveBeenCalledWith(["p1", "p3", "p4"]);
    expect(uploads).toEqual([
      {
        eventOverlayId: "ov-a",
        provider: "morpush",
        externalId: "evt-a",
        status: "accepted",
        acceptedAt: "2026-09-01T10:00:00.000Z",
        acceptedPlayers: 1,
        pendingPlayers: 1,
        mintedPlayers: 1,
      },
      {
        eventOverlayId: "ov-b",
        provider: "morpush",
        externalId: "evt-ab",
        status: "pending",
        acceptedAt: null,
        acceptedPlayers: 1,
        pendingPlayers: 0,
        mintedPlayers: 2,
      },
    ]);
  });
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

  it("gives up the claims the event it lands on already agrees with", async () => {
    mockMeta.eventById.mockResolvedValue({
      id: OTHER_EVENT_ID,
      name: "Summoner Skirmish",
      eventDate: "2026-08-15",
      format: "freeform",
    });

    await acceptMetaEventOverlay(repos, OVERLAY_ID, OTHER_EVENT_ID);

    expect(mockOverlays.updateEventOverlay).toHaveBeenCalledWith(
      OVERLAY_ID,
      expect.objectContaining({ claimedFields: ["format"], name: null, eventDate: null }),
    );
  });

  it("lands a wholly redundant upload claiming nothing, keeping its source key", async () => {
    mockMeta.eventById.mockResolvedValue({
      id: OTHER_EVENT_ID,
      name: "Summoner Skirmish",
      eventDate: "2026-08-15",
      format: "constructed",
    });

    await acceptMetaEventOverlay(repos, OVERLAY_ID, OTHER_EVENT_ID);

    expect(mockOverlays.updateEventOverlay).toHaveBeenCalledWith(
      OVERLAY_ID,
      expect.objectContaining({ claimedFields: [], status: "accepted" }),
    );
    expect(mockOverlays.adoptProposedPlayers).toHaveBeenCalledWith(OVERLAY_ID, OTHER_EVENT_ID);
  });
});

describe("linkMetaPlayerOverlay", () => {
  function playerOverlay(overrides: Record<string, unknown> = {}) {
    return {
      id: PLAYER_OVERLAY_ID,
      metaEventPlayerId: null,
      status: "pending",
      playerName: "linsanity",
      rank: 4,
      rankIsTier: false,
      legendCardId: "d0000000-0001-4000-a000-000000000001",
      championCardId: "d0000000-0001-4000-a000-000000000002",
      listStatus: "full",
      claimedFields: [
        "playerName",
        "rank",
        "rankIsTier",
        "legendCardId",
        "championCardId",
        "listStatus",
        "cards",
      ],
      ...overrides,
    };
  }

  const liveRow = {
    id: LIVE_PLAYER_ID,
    playerName: "linsanity",
    rank: 4,
    rankIsTier: false,
    legendCardId: "d0000000-0001-4000-a000-000000000001",
    championCardId: null,
    listStatus: "none",
  };

  it("drops the claims the row it links to already carries", async () => {
    mockOverlays.playerOverlayById.mockResolvedValue(playerOverlay());
    mockMeta.playerById.mockResolvedValue(liveRow);

    await linkMetaPlayerOverlay(repos, PLAYER_OVERLAY_ID, LIVE_PLAYER_ID);

    expect(mockOverlays.updatePlayerOverlay).toHaveBeenCalledWith(PLAYER_OVERLAY_ID, {
      claimedFields: ["championCardId", "listStatus", "cards"],
      playerName: null,
      rank: null,
      rankIsTier: null,
      legendCardId: null,
    });
  });

  it("keeps `listStatus` beside a claimed list, which claim and release as one", async () => {
    mockOverlays.playerOverlayById.mockResolvedValue(
      playerOverlay({ championCardId: null, listStatus: "none" }),
    );
    mockMeta.playerById.mockResolvedValue(liveRow);

    await linkMetaPlayerOverlay(repos, PLAYER_OVERLAY_ID, LIVE_PLAYER_ID);

    const [, patch] = mockOverlays.updatePlayerOverlay.mock.calls[0] as [
      string,
      { claimedFields: string[] },
    ];
    expect(patch.claimedFields).toEqual(["listStatus", "cards"]);
  });

  it("writes nothing when the upload says something new about every field", async () => {
    mockOverlays.playerOverlayById.mockResolvedValue(
      playerOverlay({ claimedFields: ["rank"], rank: 9 }),
    );
    mockMeta.playerById.mockResolvedValue(liveRow);

    await linkMetaPlayerOverlay(repos, PLAYER_OVERLAY_ID, LIVE_PLAYER_ID);

    expect(mockOverlays.updatePlayerOverlay).not.toHaveBeenCalled();
  });
});
