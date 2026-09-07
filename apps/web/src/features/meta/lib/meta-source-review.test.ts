import type { MetaOverlayQueueRow } from "@openrift/shared/types/api/meta";
import { describe, expect, it } from "vitest";

import {
  parseMetaUploadFile,
  sourceDismissTarget,
  sourceProviderDisplay,
} from "@/features/meta/lib/meta-source-review";

describe("parseMetaUploadFile", () => {
  it("accepts a full provider + events body", () => {
    const result = parseMetaUploadFile(
      JSON.stringify({ provider: "riftdecks", events: [{ externalId: "evt-1" }] }),
    );

    expect(result).toEqual({
      ok: true,
      body: { provider: "riftdecks", events: [{ externalId: "evt-1" }] },
    });
  });

  it("trims the provider", () => {
    const result = parseMetaUploadFile(
      JSON.stringify({ provider: "  riftdecks  ", events: [{ externalId: "evt-1" }] }),
    );

    expect(result.ok && result.body.provider).toBe("riftdecks");
  });

  it("rejects invalid JSON", () => {
    expect(parseMetaUploadFile("{not json")).toEqual({ ok: false, error: "Not valid JSON." });
  });

  it("rejects a bare array", () => {
    const result = parseMetaUploadFile("[]");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("JSON object");
  });

  it("rejects a null body", () => {
    expect(parseMetaUploadFile("null").ok).toBe(false);
  });

  it("rejects a missing provider", () => {
    const result = parseMetaUploadFile(JSON.stringify({ events: [{ externalId: "evt-1" }] }));

    expect(!result.ok && result.error).toContain("provider");
  });

  it("rejects a blank provider", () => {
    const result = parseMetaUploadFile(JSON.stringify({ provider: "   ", events: [{}] }));

    expect(!result.ok && result.error).toContain("provider");
  });

  it("rejects an empty events array", () => {
    const result = parseMetaUploadFile(JSON.stringify({ provider: "riftdecks", events: [] }));

    expect(!result.ok && result.error).toContain("events");
  });
});

describe("sourceProviderDisplay", () => {
  it("shows a crawler's provider slug the way the source writes it", () => {
    expect(sourceProviderDisplay("uvsgames")).toEqual({ label: "uvsgames", variant: "outline" });
  });

  it("names a player's own submission, which is not a source slug at all", () => {
    expect(sourceProviderDisplay("usersubmission")).toEqual({
      label: "User submission",
      variant: "violet",
    });
  });
});

describe("sourceDismissTarget", () => {
  function row(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
    return {
      id: "o1",
      kind: "player",
      status: "pending",
      provider: "uvsgames",
      sourceEventExternalId: "evt-1",
      sourcePlayerExternalId: "evt-1-p1",
      metaEventId: "e1",
      metaEventPlayerId: null,
      metaEventName: "Summoner Skirmish",
      eventOverlayId: null,
      metaEventSlug: null,
      eventDate: null,
      eventFormat: null,
      rank: null,
      rankIsTier: null,
      match: null,
      proposedName: null,
      playerName: "Ashe Main",
      submittedBy: null,
      submissionNote: null,
      changes: [],
      cards: [],
      unresolvedNames: [],
      createdAt: "2026-08-30T10:00:00.000Z",
      ...overrides,
    };
  }

  it("keys an event row by the provider's own event id", () => {
    expect(sourceDismissTarget(row({ kind: "event", sourcePlayerExternalId: null }))).toEqual({
      kind: "event",
      provider: "uvsgames",
      externalId: "evt-1",
    });
  });

  it("scopes a player key to the event it was published under", () => {
    expect(sourceDismissTarget(row())).toEqual({
      kind: "player",
      provider: "uvsgames",
      eventExternalId: "evt-1",
      externalId: "evt-1-p1",
    });
  });

  it("offers nothing for a person's overlay, which no crawl will produce again", () => {
    expect(
      sourceDismissTarget(
        row({ provider: null, sourceEventExternalId: null, sourcePlayerExternalId: null }),
      ),
    ).toBeNull();
  });

  it("offers nothing when the event half of a player key is missing", () => {
    expect(sourceDismissTarget(row({ sourceEventExternalId: null }))).toBeNull();
  });

  it("offers nothing when the player half is missing, since the key is both", () => {
    expect(sourceDismissTarget(row({ sourcePlayerExternalId: null }))).toBeNull();
  });
});
