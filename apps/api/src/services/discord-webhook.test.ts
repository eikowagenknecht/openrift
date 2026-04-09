import type { Selectable } from "kysely";
import { describe, expect, it } from "vitest";

import type { PrintingEventsTable } from "../db/index.js";
import { buildChangedPrintingPayloads, buildNewPrintingPayloads } from "./discord-webhook.js";

type PrintingEvent = Selectable<PrintingEventsTable>;

function makeEvent(overrides: Partial<PrintingEvent> = {}): PrintingEvent {
  return {
    id: "evt-1",
    eventType: "new",
    printingId: "p-1",
    cardName: "Test Card",
    setName: "Origins",
    shortCode: "OGN-001",
    rarity: "Common",
    finish: "normal",
    artist: "Artist A",
    language: "EN",
    changes: null,
    status: "pending",
    retryCount: 0,
    createdAt: new Date("2026-04-09T12:00:00Z"),
    updatedAt: new Date("2026-04-09T12:00:00Z"),
    ...overrides,
  };
}

// ── buildNewPrintingPayloads ──────────────────────────────────────────────

describe("buildNewPrintingPayloads", () => {
  it("creates one embed per printing for small batches", () => {
    const events = [makeEvent(), makeEvent({ id: "evt-2", cardName: "Card B" })];

    const payloads = buildNewPrintingPayloads(events);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].embeds).toHaveLength(2);
    expect(payloads[0].embeds[0].title).toBe("New: Test Card");
    expect(payloads[0].embeds[1].title).toBe("New: Card B");
  });

  it("omits finish field when it is 'normal'", () => {
    const events = [makeEvent({ finish: "normal" })];

    const payloads = buildNewPrintingPayloads(events);
    const fields = payloads[0].embeds[0].fields ?? [];
    const finishField = fields.find((f) => f.name === "Finish");

    expect(finishField).toBeUndefined();
  });

  it("includes finish field when it is not 'normal'", () => {
    const events = [makeEvent({ finish: "foil" })];

    const payloads = buildNewPrintingPayloads(events);
    const fields = payloads[0].embeds[0].fields ?? [];
    const finishField = fields.find((f) => f.name === "Finish");

    expect(finishField?.value).toBe("foil");
  });

  it("omits language field when it is 'EN'", () => {
    const events = [makeEvent({ language: "EN" })];

    const payloads = buildNewPrintingPayloads(events);
    const fields = payloads[0].embeds[0].fields ?? [];
    const languageField = fields.find((f) => f.name === "Language");

    expect(languageField).toBeUndefined();
  });

  it("includes language field when it is not 'EN'", () => {
    const events = [makeEvent({ language: "DE" })];

    const payloads = buildNewPrintingPayloads(events);
    const fields = payloads[0].embeds[0].fields ?? [];
    const languageField = fields.find((f) => f.name === "Language");

    expect(languageField?.value).toBe("DE");
  });

  it("chunks into multiple payloads when more than 10 embeds", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      makeEvent({ id: `evt-${i}`, cardName: `Card ${i}` }),
    );

    const payloads = buildNewPrintingPayloads(events);

    expect(payloads).toHaveLength(2);
    expect(payloads[0].embeds).toHaveLength(10);
    expect(payloads[1].embeds).toHaveLength(5);
  });

  it("uses summary mode for large batches (>20)", () => {
    const events = Array.from({ length: 25 }, (_, i) =>
      makeEvent({ id: `evt-${i}`, cardName: `Card ${i}`, setName: "Origins" }),
    );

    const payloads = buildNewPrintingPayloads(events);

    expect(payloads[0].embeds[0].title).toContain("25 new printings added");
    expect(payloads[0].embeds[0].description).toContain("Origins");
  });

  it("groups summary by set name", () => {
    const events = [
      ...Array.from({ length: 15 }, (_, i) =>
        makeEvent({ id: `evt-a-${i}`, cardName: `Card A${i}`, setName: "Set Alpha" }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeEvent({ id: `evt-b-${i}`, cardName: `Card B${i}`, setName: "Set Beta" }),
      ),
    ];

    const payloads = buildNewPrintingPayloads(events);
    const description = payloads[0].embeds[0].description ?? "";

    expect(description).toContain("Set Alpha");
    expect(description).toContain("Set Beta");
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

    const payloads = buildChangedPrintingPayloads(events);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].embeds).toHaveLength(1);
    expect(payloads[0].embeds[0].title).toBe("Updated: Test Card (OGN-001)");

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

    const payloads = buildChangedPrintingPayloads(events);

    // Same printingId, so consolidated into one embed
    expect(payloads[0].embeds).toHaveLength(1);
    const fields = payloads[0].embeds[0].fields ?? [];
    expect(fields).toHaveLength(2);
  });

  it("keeps separate embeds for different printings", () => {
    const events = [
      makeEvent({
        eventType: "changed",
        printingId: "p-1",
        cardName: "Card A",
        changes: [{ field: "artist", from: "A", to: "B" }],
      }),
      makeEvent({
        id: "evt-2",
        eventType: "changed",
        printingId: "p-2",
        cardName: "Card B",
        changes: [{ field: "rarity", from: "Common", to: "Rare" }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events);

    expect(payloads[0].embeds).toHaveLength(2);
  });

  it("displays null values as *empty*", () => {
    const events = [
      makeEvent({
        eventType: "changed",
        changes: [{ field: "flavorText", from: null, to: "New flavor" }],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events);
    const fields = payloads[0].embeds[0].fields ?? [];

    expect(fields[0].value).toContain("*empty*");
    expect(fields[0].value).toContain("New flavor");
  });

  it("deduplicates same-field changes keeping earliest from and latest to", () => {
    const events = [
      makeEvent({
        eventType: "changed",
        changes: [
          { field: "artist", from: "Original", to: "Middle" },
          { field: "artist", from: "Middle", to: "Final" },
        ],
      }),
    ];

    const payloads = buildChangedPrintingPayloads(events);
    const fields = payloads[0].embeds[0].fields ?? [];

    expect(fields).toHaveLength(1);
    expect(fields[0].value).toContain("Original");
    expect(fields[0].value).toContain("Final");
  });
});
