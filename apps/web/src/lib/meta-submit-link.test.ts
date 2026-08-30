import { describe, expect, it } from "vitest";

import { metaSubmitSearchForPlayer, parseMetaSubmitSearch } from "./meta-submit-link";

const row = {
  playerName: "M. Álvarez",
  rank: 4,
  rankIsTier: false,
  wins: 12,
  losses: 2,
  draws: 1,
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
});

describe("parseMetaSubmitSearch", () => {
  it("reads back what the link wrote", () => {
    expect(
      parseMetaSubmitSearch({ player: "Ana", rank: 8, cut: true, wins: 12, losses: 3, draws: 0 }),
    ).toEqual({ player: "Ana", rank: 8, cut: true, wins: 12, losses: 3, draws: 0 });
  });

  it("drops every param a bare URL carries none of", () => {
    expect(parseMetaSubmitSearch({})).toEqual({
      player: undefined,
      rank: undefined,
      cut: undefined,
      wins: undefined,
      losses: undefined,
      draws: undefined,
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
});
