import { describe, expect, it } from "vitest";

import { metaSubmitSearchForPlayer, parseMetaSubmitSearch } from "./meta-submit-link";

const row = {
  playerName: "M. Álvarez",
  rank: 4,
  rankIsTier: false,
  wins: 12,
  losses: 2,
  draws: 1,
  legend: null,
  shareToken: null,
};

const withList = {
  ...row,
  legend: {
    cardId: "card-1",
    name: "Lux, Lady of Luminosity",
    slug: "lux",
    imageId: null,
    domains: ["order"],
    archiveSlug: "lux",
  },
  shareToken: "tok-1",
};

describe("metaSubmitSearchForPlayer", () => {
  it("carries the whole standings row into the form's link", () => {
    expect(metaSubmitSearchForPlayer(row)).toEqual({
      player: "M. Álvarez",
      rank: 4,
      cut: undefined,
      wins: 12,
      losses: 2,
      draws: 1,
      ask: undefined,
      deck: undefined,
      legend: undefined,
      legendId: undefined,
    });
  });

  it("marks a cut bucket so the form does not print it as an exact placing", () => {
    expect(metaSubmitSearchForPlayer({ ...row, rank: 8, rankIsTier: true }).cut).toBe(true);
  });

  it("leaves out a record no source published", () => {
    const search = metaSubmitSearchForPlayer({
      ...row,
      wins: null,
      losses: null,
      draws: null,
    });
    expect(search.wins).toBeUndefined();
    expect(search.losses).toBeUndefined();
    expect(search.draws).toBeUndefined();
    expect(search.player).toBe("M. Álvarez");
  });

  it("keeps a zero count, which is a published result rather than a missing one", () => {
    const search = metaSubmitSearchForPlayer({ ...row, wins: 5, losses: 0, draws: 0 });
    expect(search.losses).toBe(0);
    expect(search.draws).toBe(0);
  });

  it("names the legend the archive already has the entry on", () => {
    expect(metaSubmitSearchForPlayer(withList).legend).toBe("Lux, Lady of Luminosity");
  });

  it("carries that legend's card id, for checking the pasted list against it", () => {
    expect(metaSubmitSearchForPlayer(withList).legendId).toBe("card-1");
  });

  it("points a completion at the archived list it is filling in", () => {
    const search = metaSubmitSearchForPlayer(withList, "completion");
    expect(search.ask).toBe("completion");
    expect(search.deck).toBe("tok-1");
  });

  it("sends a brand-new list with nothing to start from", () => {
    expect(metaSubmitSearchForPlayer(withList).deck).toBeUndefined();
  });

  it("asks for a correction with no deck when the entry has no archived list", () => {
    const search = metaSubmitSearchForPlayer({ ...withList, shareToken: null }, "correction");
    expect(search.ask).toBe("correction");
    expect(search.deck).toBeUndefined();
  });
});

describe("parseMetaSubmitSearch", () => {
  it("reads back what the link wrote", () => {
    expect(
      parseMetaSubmitSearch({
        player: "Ana",
        rank: 8,
        cut: true,
        wins: 12,
        losses: 3,
        draws: 0,
        ask: "correction",
        deck: "tok-1",
        legend: "Lux, Lady of Luminosity",
        legendId: "card-1",
      }),
    ).toEqual({
      player: "Ana",
      rank: 8,
      cut: true,
      wins: 12,
      losses: 3,
      draws: 0,
      ask: "correction",
      deck: "tok-1",
      legend: "Lux, Lady of Luminosity",
      legendId: "card-1",
    });
  });

  it("drops every param a bare URL carries none of", () => {
    expect(parseMetaSubmitSearch({})).toEqual({
      player: undefined,
      rank: undefined,
      cut: undefined,
      wins: undefined,
      losses: undefined,
      draws: undefined,
      ask: undefined,
      deck: undefined,
      legend: undefined,
      legendId: undefined,
    });
  });

  it("drops a count that is not a whole number", () => {
    const search = parseMetaSubmitSearch({ rank: 1.5, wins: "6", losses: -2, draws: Number.NaN });
    expect(search.rank).toBeUndefined();
    expect(search.wins).toBeUndefined();
    expect(search.losses).toBeUndefined();
    expect(search.draws).toBeUndefined();
  });

  it("keeps a zero, which is a published count rather than a missing one", () => {
    expect(parseMetaSubmitSearch({ wins: 0 }).wins).toBe(0);
  });

  it("drops a player name past what the form would accept", () => {
    expect(parseMetaSubmitSearch({ player: "a".repeat(80) }).player).toHaveLength(80);
    expect(parseMetaSubmitSearch({ player: "a".repeat(81) }).player).toBeUndefined();
  });

  it("drops a player name that is not a string", () => {
    expect(parseMetaSubmitSearch({ player: 42 }).player).toBeUndefined();
  });

  it("reads only a literal true as a cut bucket", () => {
    expect(parseMetaSubmitSearch({ cut: "true" }).cut).toBeUndefined();
    expect(parseMetaSubmitSearch({ cut: false }).cut).toBeUndefined();
  });

  it("drops an ask the form does not offer", () => {
    expect(parseMetaSubmitSearch({ ask: "event_correction" }).ask).toBeUndefined();
    expect(parseMetaSubmitSearch({ ask: "new_list" }).ask).toBeUndefined();
    expect(parseMetaSubmitSearch({ ask: 1 }).ask).toBeUndefined();
  });

  it("drops a deck token long enough to be a pasted list", () => {
    expect(parseMetaSubmitSearch({ deck: "a".repeat(65) }).deck).toBeUndefined();
    expect(parseMetaSubmitSearch({ deck: "" }).deck).toBeUndefined();
  });

  it("drops a legend id longer than a card id can be", () => {
    expect(parseMetaSubmitSearch({ legendId: "a".repeat(64) }).legendId).toHaveLength(64);
    expect(parseMetaSubmitSearch({ legendId: "a".repeat(65) }).legendId).toBeUndefined();
  });
});
