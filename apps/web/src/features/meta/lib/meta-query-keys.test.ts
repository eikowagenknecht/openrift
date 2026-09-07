import { describe, expect, it } from "vitest";

import { metaKeys } from "./meta-query-keys";

describe("metaKeys", () => {
  it("decks keys the whole archive when no window is given", () => {
    expect(metaKeys.decks()).toEqual(["meta", "decks"]);
  });

  it("decks reads an empty window as the whole archive", () => {
    expect(metaKeys.decks({})).toEqual(metaKeys.decks());
  });

  it("decks keys each window apart", () => {
    expect(metaKeys.decks({ from: "2026-01-01", to: "2026-06-30" })).not.toEqual(
      metaKeys.decks({ from: "2026-07-01" }),
    );
  });

  it("decks keeps an open end apart from a closed one", () => {
    expect(metaKeys.decks({ from: "2026-01-01" })).toEqual([
      "meta",
      "decks",
      {
        from: "2026-01-01",
        to: null,
        formats: null,
        formatsEx: null,
        tiers: null,
        tiersEx: null,
        countries: null,
        countriesEx: null,
        legend: null,
        player: null,
        limit: null,
      },
    ]);
  });

  it("decks keys a facet include apart from the matching exclude", () => {
    expect(metaKeys.decks({ tiers: ["premier"] })).not.toEqual(
      metaKeys.decks({ tiersEx: ["premier"] }),
    );
    expect(metaKeys.decks({ countries: ["DE"] })).not.toEqual(
      metaKeys.decks({ countries: ["FR"] }),
    );
  });

  it("decks keys the legend, the player and the cap apart", () => {
    expect(metaKeys.decks({ legend: "card-1" })).not.toEqual(metaKeys.decks({ legend: "card-2" }));
    expect(metaKeys.decks({ player: "renata" })).not.toEqual(metaKeys.decks({ player: "ekko" }));
    expect(metaKeys.decks({ limit: 12 })).not.toEqual(metaKeys.decks({ limit: 24 }));
  });

  it("events keys the whole archive when no window is given", () => {
    expect(metaKeys.events()).toEqual(["meta", "events"]);
    expect(metaKeys.events({})).toEqual(metaKeys.events());
  });

  it("events keys each window apart, under the events base", () => {
    expect(metaKeys.events({ from: "2026-01-01" })).toEqual([
      "meta",
      "events",
      { from: "2026-01-01", to: null },
    ]);
  });

  it("counts keys the unfiltered archive plainly", () => {
    expect(metaKeys.counts()).toEqual(["meta", "counts"]);
    expect(metaKeys.counts({ format: "constructed" })).toEqual([
      "meta",
      "counts",
      { format: "constructed", dateFrom: null, dateTo: null },
    ]);
  });

  it("legend keys an unscoped page under the slug alone", () => {
    expect(metaKeys.legend("kennen")).toEqual(["meta", "legends", "kennen"]);
    expect(metaKeys.legend("kennen", {})).toEqual(metaKeys.legend("kennen"));
  });

  it("legend keys each facet and page apart", () => {
    expect(metaKeys.legend("kennen", { tiers: ["premier"] })).not.toEqual(
      metaKeys.legend("kennen", { tiersEx: ["premier"] }),
    );
    expect(metaKeys.legend("kennen", { page: 2 })).not.toEqual(
      metaKeys.legend("kennen", { page: 3 }),
    );
    expect(metaKeys.legend("kennen", { page: 2 })).not.toEqual(
      metaKeys.legend("ekko", { page: 2 }),
    );
  });

  it("deckCards keys under its own base", () => {
    expect(metaKeys.deckCards({ to: "2026-06-30" })).toEqual([
      "meta",
      "deck-cards",
      { from: null, to: "2026-06-30" },
    ]);
  });
});
