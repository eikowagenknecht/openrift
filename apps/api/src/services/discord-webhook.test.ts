import { describe, expect, it } from "vitest";

import type { EnrichedPrintingEvent } from "../repositories/printing-events.js";
import { buildChangedPrintingPayloads, buildNewPrintingPayloads } from "./discord-webhook.js";

const APP_BASE_URL = "https://openrift.app";

function makeEvent(overrides: Partial<EnrichedPrintingEvent> = {}): EnrichedPrintingEvent {
  return {
    id: "evt-1",
    eventType: "new",
    printingId: "p-1",
    changes: null,
    createdAt: new Date("2026-04-09T12:00:00Z"),
    cardName: "Test Card",
    cardSlug: "OGN-001",
    setName: "Origins",
    shortCode: "OGN-001",
    rarity: "Common",
    finish: "normal",
    artist: "Artist A",
    language: "EN",
    frontImageUrl: "https://images.openrift.app/cards/OGN-001.webp",
    ...overrides,
  };
}

// ── buildNewPrintingPayloads ──────────────────────────────────────────────

describe("buildNewPrintingPayloads", () => {
  it("creates one embed per printing for small batches", () => {
    const events = [makeEvent(), makeEvent({ id: "evt-2", cardName: "Card B" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].embeds).toHaveLength(2);
    expect(payloads[0].embeds[0].title).toBe("New: Test Card");
    expect(payloads[0].embeds[1].title).toBe("New: Card B");
  });

  it("includes card page link as embed URL", () => {
    const events = [makeEvent()];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].url).toBe("https://openrift.app/cards/OGN-001");
  });

  it("includes front image as thumbnail", () => {
    const events = [makeEvent()];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].thumbnail?.url).toBe(
      "https://images.openrift.app/cards/OGN-001.webp",
    );
  });

  it("omits thumbnail when no image is available", () => {
    const events = [makeEvent({ frontImageUrl: null })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].thumbnail).toBeUndefined();
  });

  it("omits finish field when it is 'normal'", () => {
    const events = [makeEvent({ finish: "normal" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);
    const fields = payloads[0].embeds[0].fields ?? [];

    expect(fields.find((f) => f.name === "Finish")).toBeUndefined();
  });

  it("includes finish field when it is not 'normal'", () => {
    const events = [makeEvent({ finish: "foil" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);
    const fields = payloads[0].embeds[0].fields ?? [];

    expect(fields.find((f) => f.name === "Finish")?.value).toBe("foil");
  });

  it("chunks into multiple payloads when more than 10 embeds", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      makeEvent({ id: `evt-${i}`, cardName: `Card ${i}` }),
    );

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads).toHaveLength(2);
    expect(payloads[0].embeds).toHaveLength(10);
    expect(payloads[1].embeds).toHaveLength(5);
  });

  it("uses summary mode for large batches (>20)", () => {
    const events = Array.from({ length: 25 }, (_, i) =>
      makeEvent({ id: `evt-${i}`, cardName: `Card ${i}`, setName: "Origins" }),
    );

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].title).toContain("25 new printings added");
    expect(payloads[0].embeds[0].description).toContain("Origins");
  });
});

// ── buildChangedPrintingPayloads ──────────────────────────────────────────

describe("buildChangedPrintingPayloads", () => {
  it("creates one embed per printing with field changes", () => {
    const events = [
      makeEvent({
        eventType: "changed",
        changes: [{ field: "artist", from: "Old", to: "New" }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events, APP_BASE_URL);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].embeds[0].title).toBe("Updated: Test Card (OGN-001)");
    expect(payloads[0].embeds[0].url).toBe("https://openrift.app/cards/OGN-001");
    expect(payloads[0].embeds[0].thumbnail?.url).toBe(
      "https://images.openrift.app/cards/OGN-001.webp",
    );

    const fields = payloads[0].embeds[0].fields ?? [];
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("artist");
    expect(fields[0].value).toContain("Old");
    expect(fields[0].value).toContain("New");
  });

  it("consolidates multiple events for the same printing", () => {
    const events = [
      makeEvent({
        eventType: "changed",
        changes: [{ field: "artist", from: "A", to: "B" }],
      }),
      makeEvent({
        id: "evt-2",
        eventType: "changed",
        changes: [{ field: "rarity", from: "Common", to: "Rare" }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds).toHaveLength(1);
    const fields = payloads[0].embeds[0].fields ?? [];
    expect(fields).toHaveLength(2);
  });

  it("displays null values as *empty*", () => {
    const events = [
      makeEvent({
        eventType: "changed",
        changes: [{ field: "flavorText", from: null, to: "New flavor" }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events, APP_BASE_URL);
    const fields = payloads[0].embeds[0].fields ?? [];

    expect(fields[0].value).toContain("*empty*");
    expect(fields[0].value).toContain("New flavor");
  });
});
