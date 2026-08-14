import { describe, expect, it } from "vitest";

import { DEFAULT_OVERLAY_PAYLOAD, normalizeOverlayPayload } from "./overlay.js";

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
});
