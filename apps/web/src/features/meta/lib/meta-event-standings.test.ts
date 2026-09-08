import { describe, expect, it } from "vitest";

import { metaPlayer } from "@/test/meta-event-fixtures";

import { legendOptions, standingsColumns, subtitleFor } from "./meta-event-standings";

describe("legendOptions", () => {
  it("returns nothing when the field played one legend or fewer", () => {
    const legend = metaPlayer().legend;
    expect(legendOptions([metaPlayer({ legend })])).toEqual({});
  });

  it("orders legends by how often they were played, then by name", () => {
    const legend = metaPlayer().legend;
    const other = { ...legend!, cardId: "other-legend", name: "Ahri, the Nine-Tailed Fox" };
    const players = [
      metaPlayer({ id: "p-1", legend }),
      metaPlayer({ id: "p-2", legend: other }),
      metaPlayer({ id: "p-3", legend: other }),
    ];
    expect(Object.keys(legendOptions(players))).toEqual(["any", "other-legend", legend!.cardId]);
  });

  it("skips players with no legend", () => {
    const legend = metaPlayer().legend;
    const players = [
      metaPlayer({ id: "p-1", legend }),
      metaPlayer({ id: "p-2", legend: { ...legend!, cardId: "other-legend" } }),
      metaPlayer({ id: "p-3", legend: null }),
    ];
    expect(Object.keys(legendOptions(players))).toContain("any");
  });
});

describe("standingsColumns", () => {
  it("shows the legend column when any player named one", () => {
    const legend = metaPlayer().legend;
    const columns = standingsColumns([metaPlayer({ legend })], false, false);
    expect(columns.legend).toBe(true);
  });

  it("hides the legend column for bare placings", () => {
    const columns = standingsColumns([metaPlayer({ legend: null, champion: null })], false, false);
    expect(columns.legend).toBe(false);
  });

  it("shows value and deck columns once any player has a decklist", () => {
    const columns = standingsColumns([metaPlayer({ shareToken: "tok" })], false, false);
    expect(columns.value).toBe(true);
    expect(columns.deck).toBe(true);
  });

  it("shows the deck column for a viewer who can submit even without lists", () => {
    const columns = standingsColumns([metaPlayer({ shareToken: null })], true, false);
    expect(columns.value).toBe(false);
    expect(columns.deck).toBe(true);
  });

  it("shows the run column only when the event has runs", () => {
    expect(standingsColumns([metaPlayer()], false, true).run).toBe(true);
    expect(standingsColumns([metaPlayer()], false, false).run).toBe(false);
  });
});

describe("subtitleFor", () => {
  it("pluralizes a single entry", () => {
    expect(subtitleFor(1, 0)).toBe("1 entry");
  });

  it("pluralizes multiple entries", () => {
    expect(subtitleFor(2, 0)).toBe("2 entries");
  });

  it("appends the decklist count when any entry has one", () => {
    expect(subtitleFor(2, 1)).toBe("2 entries · 1 with a decklist");
  });
});
