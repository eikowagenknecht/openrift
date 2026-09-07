import { describe, expect, it } from "vitest";

import type { EnrichedPrintingEvent } from "../repositories/printing-events.js";
import { buildNewPrintingPayloads } from "./discord-webhook.js";

const APP_BASE_URL = "https://openrift.app";

function makeEvent(overrides: Partial<EnrichedPrintingEvent> = {}): EnrichedPrintingEvent {
  return {
    id: "evt-1",
    printingId: "p-1",
    createdAt: new Date("2026-04-09T12:00:00Z"),
    cardName: "Test Card",
    cardSlug: "OGN-001",
    setName: "Origins",
    shortCode: "OGN-001",
    rarity: "common",
    rarityLabel: "Common",
    finish: "normal",
    finishLabel: "Normal",
    artist: "Artist A",
    language: "EN",
    languageName: "English",
    frontImageId: "OGN-001-uuid",
    ...overrides,
  };
}

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

  it("uses the site host as the embed author block", () => {
    const events = [makeEvent({ setName: "Origins" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].author?.name).toBe("openrift.app");
    expect(payloads[0].embeds[0].author?.url).toBe(APP_BASE_URL);
  });

  it("derives the author host from the app base URL", () => {
    const events = [makeEvent()];

    const payloads = buildNewPrintingPayloads(events, "https://preview.openrift.app");

    expect(payloads[0].embeds[0].author?.name).toBe("preview.openrift.app");
  });

  it("keeps the author even when set name is missing", () => {
    const events = [makeEvent({ setName: null })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].author?.name).toBe("openrift.app");
  });

  it("includes the set name in the info footer", () => {
    const events = [makeEvent({ setName: "Origins" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer?.text).toContain("Origins");
  });

  it("builds the absolute 400w image URL from the image id", () => {
    const events = [makeEvent({ frontImageId: "019d6c25-b081-74b3-a901-64da4ae0abcd" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].image?.url).toBe(
      "https://openrift.app/media/cards/cd/019d6c25-b081-74b3-a901-64da4ae0abcd-400w.webp",
    );
  });

  it("omits image when no front image id is available", () => {
    const events = [makeEvent({ frontImageId: null })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].image).toBeUndefined();
    expect(payloads[0].embeds[0].thumbnail).toBeUndefined();
  });

  it("builds the info footer with code, rarity label, and finish", () => {
    const events = [
      makeEvent({
        shortCode: "OGN-001",
        rarity: "rare",
        rarityLabel: "Rare",
        finish: "metal",
        finishLabel: "Metal",
      }),
    ];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer?.text).toContain("OGN-001");
    expect(payloads[0].embeds[0].footer?.text).toContain("Rare");
    expect(payloads[0].embeds[0].footer?.text).not.toMatch(/\brare\b/u);
    expect(payloads[0].embeds[0].footer?.text).toContain("Metal");
  });

  it("falls back to rarity slug when label is missing", () => {
    const events = [makeEvent({ rarity: "uncommon", rarityLabel: null })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer?.text).toContain("uncommon");
  });

  it("omits finish from the footer when it is 'normal'", () => {
    const events = [makeEvent({ finish: "normal", finishLabel: "Normal" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer?.text).not.toContain("Normal");
  });

  it("falls back to finish slug when label is missing", () => {
    const events = [makeEvent({ finish: "foil", finishLabel: null })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer?.text).toContain("foil");
  });

  it("includes language name in the footer when not English", () => {
    const events = [makeEvent({ language: "FR", languageName: "French" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer?.text).toContain("French");
  });

  it("omits language from the footer when English", () => {
    const events = [makeEvent({ language: "EN", languageName: "English" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer?.text).not.toContain("English");
  });

  it("never includes the artist in the embed", () => {
    const events = [makeEvent({ artist: "Jane Doe" })];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer?.text).not.toContain("Jane Doe");
    expect(payloads[0].embeds[0].description).toBeUndefined();
  });

  it("renders the image above the info footer", () => {
    const events = [makeEvent()];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    const embed = payloads[0].embeds[0];
    expect(embed.image?.url).toBeDefined();
    expect(embed.footer?.text).toBeDefined();
    expect(embed.description).toBeUndefined();
  });

  it("omits the footer entirely when no metadata is present", () => {
    const events = [
      makeEvent({
        setName: null,
        shortCode: null,
        rarity: null,
        finish: "normal",
        language: "EN",
        artist: null,
      }),
    ];

    const payloads = buildNewPrintingPayloads(events, APP_BASE_URL);

    expect(payloads[0].embeds[0].footer).toBeUndefined();
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
