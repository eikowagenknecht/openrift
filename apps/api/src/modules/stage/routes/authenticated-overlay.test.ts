import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { overlayRouter } from "./authenticated-overlay";

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const UPDATED_AT = new Date("2026-08-14T10:30:00.000Z");

// The board schema rejects a repeated card id.
function cardId(at: number): string {
  return `c0000000-0001-4000-a000-000000000${String(at).padStart(3, "0")}`;
}

// Two ranked cards is enough to have a reveal with a middle.
const BOARD = {
  title: "Origins, ranked",
  tiers: [
    { label: "S", cards: [{ cardId: cardId(1), printingId: null }] },
    { label: "A", cards: [{ cardId: cardId(2), printingId: null }] },
  ],
  revealCount: 0,
  direction: "best-first" as const,
};

function stubChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "chan-1",
    userId: USER_ID,
    token: "AbC123XyZ789",
    payload: { ...DEFAULT_OVERLAY_PAYLOAD },
    version: 3,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

const mockRepo = {
  findByUserId: vi.fn(),
  findByToken: vi.fn(),
  create: vi.fn(),
  setPayload: vi.fn(),
  rotateToken: vi.fn(),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { overlayChannels: mockRepo } as never);
  await next();
});
registerRouterForTest(app, overlayRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

beforeEach(() => {
  vi.resetAllMocks();
  // Default: the user already has a channel. First-use tests override findByUserId.
  mockRepo.findByUserId.mockResolvedValue(stubChannel());
  mockRepo.setPayload.mockImplementation((_userId: string, payload: unknown) =>
    Promise.resolve(stubChannel({ payload, version: 4 })),
  );
});

describe("GET /api/v1/overlay/me", () => {
  it("returns the existing channel", async () => {
    const res = await app.request("/api/v1/overlay/me");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.token).toBe("AbC123XyZ789");
    expect(json.version).toBe(3);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("creates the channel on first ask", async () => {
    mockRepo.findByUserId.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue(stubChannel({ token: "FreshToken12", version: 0 }));

    const res = await app.request("/api/v1/overlay/me");

    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ token: "FreshToken12", version: 0 });
    expect(mockRepo.create).toHaveBeenCalledWith(USER_ID);
  });

  it("never returns the row id or the owner", async () => {
    const json = await readJson(await app.request("/api/v1/overlay/me"));

    expect(json.id).toBeUndefined();
    expect(json.userId).toBeUndefined();
  });
});

describe("POST /api/v1/overlay/me/push", () => {
  it("sets the card and keeps the existing dressing", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({
        payload: { ...DEFAULT_OVERLAY_PAYLOAD, corner: "top-left", scale: 45 },
      }),
    );

    const res = await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(USER_ID, {
      ...DEFAULT_OVERLAY_PAYLOAD,
      printingId: "p-1",
      corner: "top-left",
      scale: 45,
    });
  });

  it("applies display switches sent alongside the card", async () => {
    await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-2", showPlate: false, corner: "top-right" }),
    });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ printingId: "p-2", showPlate: false, corner: "top-right" }),
    );
  });

  it("takes a board down when a card is pushed over it", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, board: { ...BOARD } } }),
    );

    await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-1" }),
    });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ printingId: "p-1", board: null }),
    );
  });

  it("rejects a scale outside the allowed range", async () => {
    const res = await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-1", scale: 500 }),
    });

    expect(res.status).toBe(400);
    expect(mockRepo.setPayload).not.toHaveBeenCalled();
  });

  it("rejects a QR link that isn't a URL", async () => {
    const res = await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-1", qrUrl: "not a url" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/overlay/me/board", () => {
  it("puts the board up and takes the card down", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({
        payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-live", corner: "top-left" },
      }),
    );

    const res = await app.request("/api/v1/overlay/me/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ board: BOARD }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(USER_ID, {
      ...DEFAULT_OVERLAY_PAYLOAD,
      printingId: null,
      corner: "top-left",
      board: { ...BOARD },
    });
  });

  it("holds a reveal that starts past the last card inside the board", async () => {
    await app.request("/api/v1/overlay/me/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ board: { ...BOARD, revealCount: 99 } }),
    });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ board: expect.objectContaining({ revealCount: 2 }) }),
    );
  });

  it("rejects a board over the card cap", async () => {
    const cards = Array.from({ length: 401 }, (_unused, at) => ({
      cardId: cardId(at),
      printingId: null,
    }));
    const res = await app.request("/api/v1/overlay/me/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        board: {
          ...BOARD,
          tiers: [
            { label: "S", cards: cards.slice(0, 201) },
            { label: "A", cards: cards.slice(201) },
          ],
        },
      }),
    });

    expect(res.status).toBe(400);
    expect(mockRepo.setPayload).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/overlay/me/board/reveal", () => {
  it("steps the reveal without touching the rest of the board", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, board: { ...BOARD } } }),
    );

    const res = await app.request("/api/v1/overlay/me/board/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revealCount: 1 }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        board: { ...BOARD, revealCount: 1 },
      }),
    );
  });

  it("clamps a step past the last card", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, board: { ...BOARD } } }),
    );

    await app.request("/api/v1/overlay/me/board/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revealCount: 40 }),
    });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ board: expect.objectContaining({ revealCount: 2 }) }),
    );
  });

  it("does nothing, quietly, when no board is up", async () => {
    const res = await app.request("/api/v1/overlay/me/board/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revealCount: 3 }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/overlay/me/hidden", () => {
  function setHidden(hidden: boolean) {
    return app.request("/api/v1/overlay/me/hidden", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
  }

  it("drops the curtain without giving up what is on screen", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-1" } }),
    );

    const res = await setHidden(true);

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(USER_ID, {
      ...DEFAULT_OVERLAY_PAYLOAD,
      printingId: "p-1",
      hidden: true,
    });
  });

  it("keeps a hidden board hidden and intact", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, board: { ...BOARD } } }),
    );

    await setHidden(true);

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ board: BOARD, hidden: true }),
    );
  });

  it("raises the curtain again", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-1", hidden: true } }),
    );

    await setHidden(false);

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ printingId: "p-1", hidden: false }),
    );
  });

  it("leaves the scene setup alone", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({
        payload: { ...DEFAULT_OVERLAY_PAYLOAD, corner: "top-left", scale: 55, showPlate: false },
      }),
    );

    await setHidden(true);

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ corner: "top-left", scale: 55, showPlate: false }),
    );
  });

  it("rejects a request that names no state", async () => {
    const res = await app.request("/api/v1/overlay/me/hidden", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe("the curtain is sticky", () => {
  beforeEach(() => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, hidden: true } }),
    );
  });

  it("survives a card push", async () => {
    await app.request("/api/v1/overlay/me/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: "p-2" }),
    });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ printingId: "p-2", hidden: true }),
    );
  });

  it("survives a board push", async () => {
    await app.request("/api/v1/overlay/me/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ board: BOARD }),
    });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ hidden: true }),
    );
  });

  it("survives a reveal step", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({
        payload: { ...DEFAULT_OVERLAY_PAYLOAD, board: { ...BOARD }, hidden: true },
      }),
    );

    await app.request("/api/v1/overlay/me/board/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revealCount: 1 }),
    });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ hidden: true }),
    );
  });
});

describe("POST /api/v1/overlay/me/clear", () => {
  it("raises the curtain, so the next segment's first push is seen", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-1", hidden: true } }),
    );

    await app.request("/api/v1/overlay/me/clear", { method: "POST" });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ printingId: null, hidden: false }),
    );
  });

  it("takes the board down along with the card", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, board: { ...BOARD } } }),
    );

    await app.request("/api/v1/overlay/me/clear", { method: "POST" });

    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ board: null, printingId: null }),
    );
  });

  it("blanks the card but leaves the scene setup alone", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({
        payload: {
          ...DEFAULT_OVERLAY_PAYLOAD,
          printingId: "p-1",
          showPlate: false,
          qrUrl: "https://openrift.app/decks/share/abc",
          corner: "top-left",
          scale: 55,
        },
      }),
    );

    const res = await app.request("/api/v1/overlay/me/clear", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(USER_ID, {
      ...DEFAULT_OVERLAY_PAYLOAD,
      printingId: null,
      showPlate: false,
      qrUrl: "https://openrift.app/decks/share/abc",
      corner: "top-left",
      scale: 55,
    });
  });
});

describe("PATCH /api/v1/overlay/me", () => {
  it("changes a switch without touching the card on screen", async () => {
    mockRepo.findByUserId.mockResolvedValue(
      stubChannel({ payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-live" } }),
    );

    const res = await app.request("/api/v1/overlay/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ corner: "bottom-left" }),
    });

    expect(res.status).toBe(200);
    expect(mockRepo.setPayload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ printingId: "p-live", corner: "bottom-left" }),
    );
  });
});

describe("POST /api/v1/overlay/me/rotate", () => {
  it("returns the new token", async () => {
    mockRepo.rotateToken.mockResolvedValue(stubChannel({ token: "RotatedTok1", version: 4 }));

    const res = await app.request("/api/v1/overlay/me/rotate", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ token: "RotatedTok1" });
    expect(mockRepo.rotateToken).toHaveBeenCalledWith(USER_ID);
  });

  it("creates the channel first when the user has none", async () => {
    mockRepo.findByUserId.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue(stubChannel({ token: "FreshToken12" }));
    mockRepo.rotateToken.mockResolvedValue(stubChannel({ token: "RotatedTok1" }));

    const res = await app.request("/api/v1/overlay/me/rotate", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mockRepo.create).toHaveBeenCalledWith(USER_ID);
    expect(await readJson(res)).toMatchObject({ token: "RotatedTok1" });
  });
});
