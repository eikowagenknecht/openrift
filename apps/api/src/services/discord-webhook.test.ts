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
    finishLabel: "Normal",
    artist: "Artist A",
    language: "EN",
    languageName: "English",
    frontImageUrl: "/media/cards/00/OGN-001-400w.webp",
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

  it("uses set name as the embed author block", () => {
    const events = [makeEvent({ setName: "Origins" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].author?.name).toBe("Origins");
  });

  it("omits author when set name is missing", () => {
    const events = [makeEvent({ setName: null })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].author).toBeUndefined();
  });

  it("prepends app base URL to relative image paths", () => {
    const events = [makeEvent({ frontImageUrl: "/media/cards/ab/abc-400w.webp" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].image?.url).toBe(
      "https://openrift.app/media/cards/ab/abc-400w.webp",
    );
  });

  it("preserves absolute image URLs unchanged", () => {
    const events = [makeEvent({ frontImageUrl: "https://cdn.example.com/card.webp" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].image?.url).toBe("https://cdn.example.com/card.webp");
  });

  it("omits image when no front image is available", () => {
    const events = [makeEvent({ frontImageUrl: null })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].image).toBeUndefined();
    expect(payloads[0].embeds[0].thumbnail).toBeUndefined();
  });

  it("builds a markdown description with code, rarity, and finish", () => {
    const events = [
      makeEvent({ shortCode: "OGN-001", rarity: "Rare", finish: "metal", finishLabel: "Metal" }),
    ];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].description).toContain("**OGN-001**");
    expect(payloads[0].embeds[0].description).toContain("Rare");
    expect(payloads[0].embeds[0].description).toContain("Metal");
  });

  it("omits finish from description when it is 'normal'", () => {
    const events = [makeEvent({ finish: "normal", finishLabel: "Normal" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].description).not.toContain("Normal");
  });

  it("falls back to finish slug when label is missing", () => {
    const events = [makeEvent({ finish: "foil", finishLabel: null })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].description).toContain("foil");
  });

  it("includes language name in description when not English", () => {
    const events = [makeEvent({ language: "FR", languageName: "French" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].description).toContain("French");
  });

  it("omits language from description when English", () => {
    const events = [makeEvent({ language: "EN", languageName: "English" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].description).not.toContain("English");
  });

  it("includes artist on its own line when present", () => {
    const events = [makeEvent({ artist: "Jane Doe" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].description).toContain("Artist: Jane Doe");
  });

  it("omits description entirely when no metadata is present", () => {
    const events = [
      makeEvent({
        shortCode: null,
        rarity: null,
        finish: "normal",
        language: "EN",
        artist: null,
      }),
    ];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].description).toBeUndefined();
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
      "https://openrift.app/media/cards/00/OGN-001-400w.webp",
    );

    const fields = payloads[0].embeds[0].fields ?? [];
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("Artist");
    expect(fields[0].value).toContain("Old");
    expect(fields[0].value).toContain("New");
  });

  it("uses a multi-line Before/After layout for long values like rules text", () => {
    const longText = "Counter a spell. ".repeat(20);
    const events = [
      makeEvent({
        eventType: "changed",
        changes: [{ field: "printedRulesText", from: longText, to: longText.replace("a", "the") }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events, APP_BASE_URL);
    const fields = payloads[0].embeds[0].fields ?? [];

    expect(fields[0].name).toBe("Rules text");
    expect(fields[0].value).toContain("**Before:**");
    expect(fields[0].value).toContain("**After:**");
    expect(fields[0].value).not.toContain(" → ");
  });

  it("formats array-typed values like markerSlugs as a comma-separated list", () => {
    const events = [
      makeEvent({
        eventType: "changed",
        changes: [{ field: "markerSlugs", from: ["unknown"], to: ["promo", "alt-art"] }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events, APP_BASE_URL);
    const fields = payloads[0].embeds[0].fields ?? [];

    expect(fields[0].name).toBe("Markers");
    expect(fields[0].value).toContain("unknown");
    expect(fields[0].value).toContain("promo, alt-art");
  });

  it("drops fields whose net change is zero (toggled then reverted)", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        eventType: "changed",
        changes: [{ field: "finish", from: "foil", to: "normal" }],
      }),
      makeEvent({
        id: "evt-2",
        eventType: "changed",
        changes: [{ field: "finish", from: "normal", to: "foil" }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events, APP_BASE_URL);

    // Net no-op for the only field — no embed worth sending.
    expect(payloads).toHaveLength(0);
  });

  it("keeps fields with real net changes when other fields are no-ops", () => {
    const events = [
      makeEvent({
        id: "evt-1",
        eventType: "changed",
        changes: [
          { field: "finish", from: "foil", to: "normal" },
          { field: "rarity", from: "Common", to: "Rare" },
        ],
      }),
      makeEvent({
        id: "evt-2",
        eventType: "changed",
        changes: [{ field: "finish", from: "normal", to: "foil" }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events, APP_BASE_URL);

    expect(payloads).toHaveLength(1);
    const fields = payloads[0].embeds[0].fields ?? [];
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("Rarity");
  });

  it("treats arrays with the same elements in the same order as a no-op", () => {
    const events = [
      makeEvent({
        eventType: "changed",
        changes: [{ field: "markerSlugs", from: ["promo", "alt-art"], to: ["promo", "alt-art"] }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events, APP_BASE_URL);

    expect(payloads).toHaveLength(0);
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
