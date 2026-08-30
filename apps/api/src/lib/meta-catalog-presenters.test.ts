import { describe, expect, it } from "vitest";

import type { UvsgamesCoverageRow, UvsgamesTemplateRow } from "../repositories/uvsgames-events.js";
import { toMetaCatalogRow, toMetaSourceTemplate } from "./meta-catalog-presenters.js";

/** A template an admin watches, and one the same admin left alone. */
const WATCHED = "0cbcab3e-be80-4d1d-a450-9485e584906d";
const UNWATCHED = "f0c650f5-ab18-4d69-8112-19e5cff8b7b2";

const VOCABULARY = {
  formatMappings: new Map([["constructed", "constructed"]]),
  watchedTemplates: new Map([[WATCHED, "Regional Qualifier"]]),
};

function row(overrides: Partial<UvsgamesCoverageRow> = {}): UvsgamesCoverageRow {
  return {
    externalId: "4821",
    name: "Summoner Skirmish Regional",
    startAt: new Date("2026-08-15T18:00:00Z"),
    endAtEstimate: null,
    displayStatus: "complete",
    decklistStatus: "PUBLISHED",
    playerCount: 128,
    eventType: "LOCALS",
    eventFormat: "CONSTRUCTED",
    storeId: 19_428,
    storeName: "The Rift Room",
    storeDisplayName: "The Rift Room",
    location: "Piltover, Valoran",
    timezone: "America/New_York",
    contentHash: "abc",
    eventConfigurationTemplate: null,
    firstSeenAt: new Date("2026-08-01T00:00:00Z"),
    lastSeenAt: new Date("2026-08-20T00:00:00Z"),
    missingSince: null,
    nextCheckAt: null,
    checkStage: 0,
    triage: "new",
    candidateEventId: null,
    metaEventId: null,
    metaEventSlug: null,
    fetchedAt: null,
    stagedPlayerCount: null,
    stagedLegendCount: null,
    stagedDeckCount: null,
    ...overrides,
  };
}

describe("toMetaCatalogRow", () => {
  it("serializes every timestamp and derives the mapped format and source URL", () => {
    const presented = toMetaCatalogRow(row(), VOCABULARY);

    expect(presented).toMatchObject({
      externalId: "4821",
      startAt: "2026-08-15T18:00:00.000Z",
      endAtEstimate: null,
      lastSeenAt: "2026-08-20T00:00:00.000Z",
      mappedFormat: "constructed",
      sourceUrl: "https://locator.riftbound.uvsgames.com/events/4821",
      triage: "new",
    });
  });

  it("labels a watched template's event and keeps the uuid off the wire", () => {
    const presented = toMetaCatalogRow(row({ eventConfigurationTemplate: WATCHED }), VOCABULARY);

    expect(presented.officialLabel).toBe("Regional Qualifier");
    expect(JSON.stringify(presented)).not.toContain(WATCHED);
  });

  it("leaves the label off a watched template the source stopped naming", () => {
    const vocabulary = { ...VOCABULARY, watchedTemplates: new Map([[WATCHED, null]]) };

    expect(
      toMetaCatalogRow(row({ eventConfigurationTemplate: WATCHED }), vocabulary).officialLabel,
    ).toBeNull();
  });

  it("leaves an ordinary event unlabelled, template or not", () => {
    expect(toMetaCatalogRow(row(), VOCABULARY).officialLabel).toBeNull();
    expect(
      toMetaCatalogRow(row({ eventConfigurationTemplate: UNWATCHED }), VOCABULARY).officialLabel,
    ).toBeNull();
  });

  it("reports no mapped format for a source format the archive cannot file", () => {
    expect(toMetaCatalogRow(row({ eventFormat: "SEALED" }), VOCABULARY).mappedFormat).toBeNull();
    expect(toMetaCatalogRow(row({ eventFormat: null }), VOCABULARY).mappedFormat).toBeNull();
  });

  it("carries the live link through for an accepted row", () => {
    const presented = toMetaCatalogRow(
      row({
        triage: "accepted",
        candidateEventId: "cand-1",
        metaEventId: "live-1",
        metaEventSlug: "summoner-skirmish-regional-2026-08-15",
        nextCheckAt: new Date("2026-08-21T00:00:00Z"),
        checkStage: 2,
      }),
      VOCABULARY,
    );

    expect(presented).toMatchObject({
      triage: "accepted",
      candidateEventId: "cand-1",
      metaEventId: "live-1",
      metaEventSlug: "summoner-skirmish-regional-2026-08-15",
      nextCheckAt: "2026-08-21T00:00:00.000Z",
      checkStage: 2,
    });
  });

  it("reports what the deep fetch staged, and when it ran", () => {
    const presented = toMetaCatalogRow(
      row({
        triage: "accepted",
        candidateEventId: "cand-1",
        metaEventId: "live-1",
        fetchedAt: new Date("2026-08-19T04:00:00Z"),
        stagedPlayerCount: 128,
        stagedLegendCount: 120,
        stagedDeckCount: 8,
      }),
      VOCABULARY,
    );

    expect(presented).toMatchObject({
      fetchedAt: "2026-08-19T04:00:00.000Z",
      stagedPlayerCount: 128,
      stagedLegendCount: 120,
      stagedDeckCount: 8,
    });
  });

  it("keeps the staged counts null for a row no candidate stages", () => {
    expect(toMetaCatalogRow(row(), VOCABULARY)).toMatchObject({
      fetchedAt: null,
      stagedPlayerCount: null,
      stagedLegendCount: null,
      stagedDeckCount: null,
    });
  });

  it("distinguishes a fetch that staged nothing from no fetch at all", () => {
    const presented = toMetaCatalogRow(
      row({
        triage: "accepted",
        candidateEventId: "cand-1",
        metaEventId: "live-1",
        fetchedAt: new Date("2026-08-19T04:00:00Z"),
        stagedPlayerCount: 0,
        stagedLegendCount: 0,
        stagedDeckCount: 0,
      }),
      VOCABULARY,
    );

    expect(presented.stagedPlayerCount).toBe(0);
    expect(presented.fetchedAt).toBe("2026-08-19T04:00:00.000Z");
  });
});

describe("toMetaSourceTemplate", () => {
  function templateRow(overrides: Partial<UvsgamesTemplateRow> = {}): UvsgamesTemplateRow {
    return {
      templateId: WATCHED,
      sourceName: "Regional Qualifier",
      watched: true,
      tier: null,
      eventCount: 12,
      sampleEventName: "Regional Qualifier Berlin",
      lastStartAt: new Date("2026-08-15T18:00:00Z"),
      ...overrides,
    };
  }

  it("prefills the tier the name rules would guess for a template nobody has mapped", () => {
    const presented = toMetaSourceTemplate(templateRow());

    expect(presented).toEqual({
      templateId: WATCHED,
      sourceName: "Regional Qualifier",
      watched: true,
      tier: null,
      suggestedTier: "premier",
      eventCount: 12,
      sampleEventName: "Regional Qualifier Berlin",
      lastStartAt: "2026-08-15T18:00:00.000Z",
    });
  });

  it("keeps the prefill beside a mapped tier rather than in place of it", () => {
    const presented = toMetaSourceTemplate(templateRow({ tier: "store" }));

    expect(presented.tier).toBe("store");
    expect(presented.suggestedTier).toBe("premier");
  });

  it("suggests nothing for a template the source has stopped naming", () => {
    const presented = toMetaSourceTemplate(
      templateRow({ sourceName: null, tier: "casual", lastStartAt: null }),
    );

    expect(presented.sourceName).toBeNull();
    expect(presented.suggestedTier).toBeNull();
    expect(presented.lastStartAt).toBeNull();
  });
});
