import { describe, expect, it } from "vitest";

import {
  DEFAULT_OVERLAY_PAYLOAD,
  MAX_OVERLAY_BOARD_CARDS,
  normalizeOverlayPayload,
  overlayBoardSchema,
} from "./overlay.js";

const CARD_ID = "c0000000-0001-4000-a000-000000000001";

/**
 * A board with `count` distinct entries, split over two rows so the total-cards
 * rule is what a large board trips rather than the per-row one it inherits.
 * @returns The board.
 */
function boardWithCards(count: number) {
  const entries = Array.from({ length: count }, (_unused, at) => ({
    cardId: `${CARD_ID.slice(0, -3)}${String(at).padStart(3, "0")}`,
    printingId: null,
  }));
  const half = Math.ceil(count / 2);
  return {
    title: "Set review",
    tiers: [
      { label: "S", cards: entries.slice(0, half) },
      { label: "A", cards: entries.slice(half) },
    ],
    revealCount: 0,
    direction: "best-first" as const,
  };
}

describe("normalizeOverlayPayload", () => {
  it("fills a row stored before a switch existed out to the current shape", () => {
    const stored = {
      printingId: "p-1",
      showPlate: true,
      corner: "top-left" as const,
      scale: 45,
    };

    expect(normalizeOverlayPayload(stored)).toEqual({
      ...DEFAULT_OVERLAY_PAYLOAD,
      printingId: "p-1",
      corner: "top-left",
      scale: 45,
    });
  });

  it("reads a channel stored before the curtain existed as showing", () => {
    // The field arrived without a migration, so every row written until then
    // lacks it. Defaulting the other way would blank live streams on deploy.
    expect(normalizeOverlayPayload({ printingId: "p-1" }).hidden).toBe(false);
  });

  it("keeps a dropped curtain across a read", () => {
    expect(normalizeOverlayPayload({ printingId: "p-1", hidden: true }).hidden).toBe(true);
  });

  it("carries a link set under the old deck-only key over to the QR field", () => {
    const result = normalizeOverlayPayload({
      deckShareUrl: "https://openrift.app/decks/share/abc",
    });

    expect(result.qrUrl).toBe("https://openrift.app/decks/share/abc");
    expect("deckShareUrl" in result).toBe(false);
  });

  it("prefers a set qrUrl over the old key", () => {
    const result = normalizeOverlayPayload({
      qrUrl: "https://openrift.app/cards",
      deckShareUrl: "https://openrift.app/decks/share/abc",
    });

    expect(result.qrUrl).toBe("https://openrift.app/cards");
  });

  it("fills in only the plate lines that are missing", () => {
    const result = normalizeOverlayPayload({ plateFields: { name: false, rulesText: true } });

    expect(result.plateFields).toEqual({
      ...DEFAULT_OVERLAY_PAYLOAD.plateFields,
      name: false,
      rulesText: true,
    });
  });

  it("keeps a switch that is off — false is a value, not an absence", () => {
    expect(normalizeOverlayPayload({ showPlate: false }).showPlate).toBe(false);
  });

  it("returns the defaults for an empty or absent payload", () => {
    expect(normalizeOverlayPayload({})).toEqual(DEFAULT_OVERLAY_PAYLOAD);
    expect(normalizeOverlayPayload(null)).toEqual(DEFAULT_OVERLAY_PAYLOAD);
  });

  it("reads a payload stored before boards existed as having no board up", () => {
    expect(normalizeOverlayPayload({ printingId: "p-1" }).board).toBeNull();
  });

  it("keeps a stored board, reveal position and all", () => {
    const board = { ...boardWithCards(2), revealCount: 1, direction: "worst-first" as const };

    expect(normalizeOverlayPayload({ printingId: null, board }).board).toEqual(board);
  });
});

describe("overlayBoardSchema", () => {
  it("accepts a board at the card cap", () => {
    expect(overlayBoardSchema.safeParse(boardWithCards(MAX_OVERLAY_BOARD_CARDS)).success).toBe(
      true,
    );
  });

  it("rejects a board over the card cap", () => {
    expect(overlayBoardSchema.safeParse(boardWithCards(MAX_OVERLAY_BOARD_CARDS + 1)).success).toBe(
      false,
    );
  });

  it("defaults an entry with no pinned printing to the reader's default", () => {
    const parsed = overlayBoardSchema.parse({
      title: "Set review",
      tiers: [{ label: "S", cards: [{ cardId: CARD_ID }] }],
      revealCount: 0,
      direction: "best-first",
    });

    expect(parsed.tiers[0]?.cards[0]?.printingId).toBeNull();
  });

  it("rejects a negative reveal count", () => {
    expect(overlayBoardSchema.safeParse({ ...boardWithCards(1), revealCount: -1 }).success).toBe(
      false,
    );
  });
});
