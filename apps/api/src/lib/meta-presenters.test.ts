import { describe, expect, it } from "vitest";

import type {
  AdminMetaDeckRow,
  MetaDeckContextRow,
  MetaDeckSummaryRow,
  MetaEventWithCount,
} from "../repositories/meta.js";
import {
  toAdminMetaDeck,
  toAdminMetaEvent,
  toMetaDeckContext,
  toMetaDeckSummary,
  toMetaEventDetail,
  toMetaEventSummary,
  toMetaStatRow,
} from "./meta-presenters.js";

/** @returns An event row with every optional field populated. */
function eventRow(overrides: Partial<MetaEventWithCount> = {}): MetaEventWithCount {
  return {
    id: "3f7a1c2e-0000-7000-8000-000000000001",
    slug: "summoner-skirmish-berlin",
    name: "Summoner Skirmish Berlin",
    // A `date` column: the driver hands this back already date-only.
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    sourceUrl: "https://example.invalid/skirmish",
    notes: "Top 8 lists only.",
    sourceProvider: null,
    sourceExternalId: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-03T11:00:00.000Z"),
    deckCount: 8,
    ...overrides,
  };
}

/** @returns A deck summary row with both zones filled. */
function deckRow(overrides: Partial<MetaDeckSummaryRow> = {}): MetaDeckSummaryRow {
  return {
    deckId: "3f7a1c2e-0000-7000-8000-00000000000d",
    shareToken: "aB3dE5gH7jK9",
    listStatus: "full",
    deckName: "Jinx Aggro",
    deckFormat: "constructed",
    legendCardId: "legend-1",
    legendName: "Jinx",
    championCardId: "champion-1",
    championName: "Vi",
    playerName: "Nova",
    finishTier: 1,
    record: "5-1",
    eventSlug: "summoner-skirmish-berlin",
    eventName: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
    ...overrides,
  };
}

describe("toMetaEventSummary", () => {
  it("passes the date column through without reformatting", () => {
    expect(toMetaEventSummary(eventRow()).eventDate).toBe("2026-08-01");
  });

  it("keeps the timestamps out of the wire shape", () => {
    const summary = toMetaEventSummary(eventRow());
    expect(summary).not.toHaveProperty("createdAt");
    expect(summary).not.toHaveProperty("updatedAt");
    expect(summary).not.toHaveProperty("notes");
  });

  it("carries the nullable fields through as null", () => {
    const summary = toMetaEventSummary(
      eventRow({ playerCount: null, organizer: null, deckCount: 0 }),
    );
    expect(summary.playerCount).toBeNull();
    expect(summary.organizer).toBeNull();
    expect(summary.deckCount).toBe(0);
  });
});

describe("toMetaEventDetail", () => {
  it("adds the long-form fields on top of the summary", () => {
    const detail = toMetaEventDetail(eventRow());
    expect(detail.sourceUrl).toBe("https://example.invalid/skirmish");
    expect(detail.notes).toBe("Top 8 lists only.");
    expect(detail.slug).toBe("summoner-skirmish-berlin");
  });

  it("keeps an absent source link and notes null", () => {
    const detail = toMetaEventDetail(eventRow({ sourceUrl: null, notes: null }));
    expect(detail.sourceUrl).toBeNull();
    expect(detail.notes).toBeNull();
  });
});

describe("toMetaDeckSummary", () => {
  const images = new Map([
    ["legend-1", "image-legend"],
    ["champion-1", "image-champion"],
  ]);

  it("attaches the artwork resolved for each zone's card", () => {
    const summary = toMetaDeckSummary(deckRow(), images);
    expect(summary.legendImageId).toBe("image-legend");
    expect(summary.championImageId).toBe("image-champion");
  });

  it("nests the event so a row renders its byline standalone", () => {
    expect(toMetaDeckSummary(deckRow(), images).event).toEqual({
      slug: "summoner-skirmish-berlin",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
    });
  });

  it("leaves a zone's image null when the deck has no card there", () => {
    const summary = toMetaDeckSummary(
      deckRow({ championCardId: null, championName: null }),
      images,
    );
    expect(summary.championCardId).toBeNull();
    expect(summary.championName).toBeNull();
    expect(summary.championImageId).toBeNull();
  });

  it("leaves the image null when the card has no artwork", () => {
    const summary = toMetaDeckSummary(deckRow(), new Map([["legend-1", null]]));
    expect(summary.legendImageId).toBeNull();
    // Absent from the map entirely, not merely null.
    expect(summary.championImageId).toBeNull();
  });

  it("renames the deck's own columns onto the wire shape", () => {
    const summary = toMetaDeckSummary(deckRow(), images);
    expect(summary.name).toBe("Jinx Aggro");
    expect(summary.format).toBe("constructed");
    expect(summary.shareToken).toBe("aB3dE5gH7jK9");
    expect(summary.listStatus).toBe("full");
  });

  it("carries an archetype through with no permalink", () => {
    // No token means no page, which is what tells the browser to render the
    // tile without a link.
    const summary = toMetaDeckSummary(
      deckRow({ listStatus: "archetype", shareToken: null }),
      images,
    );
    expect(summary.shareToken).toBeNull();
    expect(summary.listStatus).toBe("archetype");
    // The legend still resolves: it is the whole point of the entry.
    expect(summary.legendName).toBe("Jinx");
    expect(summary.legendImageId).toBe("image-legend");
  });

  it("keeps a partial list clickable, since its main deck is there", () => {
    const summary = toMetaDeckSummary(deckRow({ listStatus: "partial" }), images);
    expect(summary.listStatus).toBe("partial");
    expect(summary.shareToken).toBe("aB3dE5gH7jK9");
  });
});

describe("toMetaDeckContext", () => {
  const row: MetaDeckContextRow = {
    listStatus: "full",
    playerName: "Nova",
    finishTier: 4,
    record: null,
    eventSlug: "summoner-skirmish-berlin",
    eventName: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
  };

  it("nests the event and keeps an absent record null", () => {
    expect(toMetaDeckContext(row)).toEqual({
      event: {
        slug: "summoner-skirmish-berlin",
        name: "Summoner Skirmish Berlin",
        eventDate: "2026-08-01",
        format: "constructed",
      },
      listStatus: "full",
      playerName: "Nova",
      finishTier: 4,
      record: null,
    });
  });

  it("carries the list status through, so the page can flag an incomplete list", () => {
    expect(toMetaDeckContext({ ...row, listStatus: "partial" }).listStatus).toBe("partial");
  });
});

describe("toMetaStatRow", () => {
  it("denormalizes the card's artwork alongside its count", () => {
    const row = toMetaStatRow(
      { cardId: "card-1", name: "Jinx", slug: "jinx", deckCount: 12, landscape: false },
      new Map([["card-1", "image-1"]]),
    );
    expect(row).toEqual({
      cardId: "card-1",
      name: "Jinx",
      slug: "jinx",
      imageId: "image-1",
      deckCount: 12,
      landscape: false,
    });
  });

  it("falls back to null for a card with no artwork", () => {
    expect(
      toMetaStatRow(
        { cardId: "card-2", name: "Vi", slug: "vi", deckCount: 0, landscape: false },
        new Map(),
      ).imageId,
    ).toBeNull();
  });

  it("carries the landscape flag so the thumbnail can rotate the art", () => {
    const row = toMetaStatRow(
      {
        cardId: "card-3",
        name: "Howling Abyss",
        slug: "howling-abyss",
        deckCount: 3,
        landscape: true,
      },
      new Map([["card-3", "image-3"]]),
    );
    expect(row.landscape).toBe(true);
  });
});

describe("toAdminMetaEvent", () => {
  it("exposes every stored column plus the deck count", () => {
    expect(toAdminMetaEvent(eventRow())).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000001",
      slug: "summoner-skirmish-berlin",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      playerCount: 64,
      organizer: "LGS Berlin",
      sourceUrl: "https://example.invalid/skirmish",
      notes: "Top 8 lists only.",
      deckCount: 8,
    });
  });
});

describe("toAdminMetaDeck", () => {
  it("maps the admin row straight through", () => {
    const row: AdminMetaDeckRow = {
      deckId: "3f7a1c2e-0000-7000-8000-00000000000d",
      shareToken: "aB3dE5gH7jK9",
      listStatus: "full",
      name: "Jinx Aggro",
      format: "constructed",
      playerName: "Nova",
      finishTier: 2,
      record: "4-2",
      cardCount: 40,
    };
    expect(toAdminMetaDeck(row)).toEqual(row);
  });

  it("keeps an empty deck's card count at zero", () => {
    const row: AdminMetaDeckRow = {
      deckId: "3f7a1c2e-0000-7000-8000-00000000000e",
      shareToken: "zZ9yY8xX7wW6",
      listStatus: "full",
      name: "Placeholder",
      format: "constructed",
      playerName: "Ekko",
      finishTier: 8,
      record: null,
      cardCount: 0,
    };
    expect(toAdminMetaDeck(row).cardCount).toBe(0);
  });

  it("reports an archetype as having no permalink", () => {
    const row: AdminMetaDeckRow = {
      deckId: "3f7a1c2e-0000-7000-8000-00000000000f",
      shareToken: null,
      listStatus: "archetype",
      name: "Jinx",
      format: "constructed",
      playerName: "Ekko",
      finishTier: 8,
      record: null,
      cardCount: 1,
    };
    const deck = toAdminMetaDeck(row);
    expect(deck.shareToken).toBeNull();
    expect(deck.listStatus).toBe("archetype");
  });
});
