import type { OverlayPayload } from "@openrift/shared";
import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { describe, expect, it } from "vitest";

import type { OverlayChannel } from "../repositories/overlay-channels.js";
import { applyOverlaySettings, toOverlayChannel, toOverlayState } from "./overlay-presenters.js";

const UPDATED_AT = new Date("2026-08-14T10:30:00.000Z");

function stubChannel(overrides: Partial<OverlayChannel> = {}): OverlayChannel {
  return {
    id: "chan-1",
    userId: "user-1",
    token: "AbC123XyZ789",
    payload: { ...DEFAULT_OVERLAY_PAYLOAD },
    version: 7,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

describe("toOverlayChannel", () => {
  it("returns the token, version, payload and ISO timestamp", () => {
    const result = toOverlayChannel(stubChannel());

    expect(result).toEqual({
      token: "AbC123XyZ789",
      version: 7,
      payload: DEFAULT_OVERLAY_PAYLOAD,
      updatedAt: "2026-08-14T10:30:00.000Z",
    });
  });

  it("never leaks the row id or the owner", () => {
    const result = toOverlayChannel(stubChannel());

    expect("id" in result).toBe(false);
    expect("userId" in result).toBe(false);
  });
});

describe("toOverlayState", () => {
  it("carries only what the browser source paints", () => {
    const payload: OverlayPayload = { ...DEFAULT_OVERLAY_PAYLOAD, printingId: "p-1" };

    const result = toOverlayState(stubChannel({ payload, version: 12 }));

    expect(result).toEqual({ version: 12, payload });
  });

  it("does not expose the token to the token-authorised read", () => {
    expect("token" in toOverlayState(stubChannel())).toBe(false);
  });
});

describe("applyOverlaySettings", () => {
  const base: OverlayPayload = {
    ...DEFAULT_OVERLAY_PAYLOAD,
    printingId: "p-1",
    showPlate: true,
    qrUrl: "https://openrift.app/decks/share/abc",
    corner: "bottom-right",
    scale: 70,
  };

  it("leaves the payload untouched for an empty patch", () => {
    expect(applyOverlaySettings(base, {})).toEqual(base);
  });

  it("applies only the fields the patch names", () => {
    const result = applyOverlaySettings(base, { corner: "top-left" });

    expect(result.corner).toBe("top-left");
    expect(result.scale).toBe(70);
    expect(result.showPlate).toBe(true);
    expect(result.qrUrl).toBe("https://openrift.app/decks/share/abc");
  });

  it("never touches the card — that is push's and clear's business", () => {
    expect(applyOverlaySettings(base, { scale: 40 }).printingId).toBe("p-1");
  });

  it("treats an explicit null qrUrl as hide the QR", () => {
    expect(applyOverlaySettings(base, { qrUrl: null }).qrUrl).toBeNull();
  });

  it("keeps the QR when qrUrl is absent from the patch", () => {
    expect(applyOverlaySettings(base, { showPlate: false }).qrUrl).toBe(
      "https://openrift.app/decks/share/abc",
    );
  });

  it("merges plateFields key by key, leaving the lines the patch does not name", () => {
    const result = applyOverlaySettings(base, { plateFields: { rulesText: true } });

    expect(result.plateFields).toEqual({ ...base.plateFields, rulesText: true });
  });

  it("moves the plate without touching anything else", () => {
    const result = applyOverlaySettings(base, { platePosition: "above" });

    expect(result.platePosition).toBe("above");
    expect(result.corner).toBe("bottom-right");
  });

  it("turns a switch off — false is a value, not an absence", () => {
    expect(applyOverlaySettings(base, { showPlate: false }).showPlate).toBe(false);
  });

  it("does not mutate the input payload", () => {
    const original = { ...base };

    applyOverlaySettings(base, { corner: "top-right", scale: 30 });

    expect(base).toEqual(original);
  });
});
