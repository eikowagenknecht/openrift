import { describe, expect, it } from "vitest";

import type { MetaCountedEvent } from "./meta-format";
import {
  formatRank,
  formatRankRuns,
  formatRecord,
  joinNames,
  metaEventCounts,
  metaEventEmptyStatus,
  metaPlayerClaimChips,
  metaShownLabel,
  recordSortValue,
  splitLegendName,
  standingsGaps,
} from "./meta-format";

describe("formatRank", () => {
  it("renders an exact standing as an ordinal", () => {
    expect(formatRank(1, false)).toBe("1st");
    expect(formatRank(2, false)).toBe("2nd");
    expect(formatRank(3, false)).toBe("3rd");
    expect(formatRank(4, false)).toBe("4th");
    expect(formatRank(8, false)).toBe("8th");
    expect(formatRank(21, false)).toBe("21st");
    expect(formatRank(102, false)).toBe("102nd");
  });

  it("renders the teens as -th, not as their last digit", () => {
    expect(formatRank(11, false)).toBe("11th");
    expect(formatRank(12, false)).toBe("12th");
    expect(formatRank(13, false)).toBe("13th");
    expect(formatRank(111, false)).toBe("111th");
  });

  it("keeps the podium when the rank is a cut bucket", () => {
    expect(formatRank(1, true)).toBe("1st");
    expect(formatRank(2, true)).toBe("2nd");
  });

  it("renders a cut bucket from third place up", () => {
    expect(formatRank(3, true)).toBe("T3");
    expect(formatRank(4, true)).toBe("T4");
    expect(formatRank(8, true)).toBe("T8");
    expect(formatRank(16, true)).toBe("T16");
  });
});

describe("formatRecord", () => {
  it("always renders all three parts", () => {
    expect(formatRecord(5, 1, 2)).toBe("5-1-2");
    expect(formatRecord(5, 1, 0)).toBe("5-1-0");
    expect(formatRecord(14, 1, 0)).toBe("14-1-0");
  });

  it("counts an unpublished draw column as no draws", () => {
    expect(formatRecord(5, 1, null)).toBe("5-1-0");
    expect(formatRecord(0, 3, null)).toBe("0-3-0");
  });

  it("renders nothing without both wins and losses", () => {
    expect(formatRecord(null, null, null)).toBeNull();
    expect(formatRecord(5, null, null)).toBeNull();
    expect(formatRecord(null, 1, 0)).toBeNull();
  });
});

describe("metaShownLabel", () => {
  const events = { singular: "archived event", plural: "archived events" };

  it("names the whole count while nothing is narrowed", () => {
    expect(metaShownLabel(42, 42, events)).toBe("42 archived events");
  });

  it("says how much of the archive a narrowed view is showing", () => {
    expect(metaShownLabel(3, 42, events)).toBe("3 of 42 archived events");
  });

  it("uses the singular for exactly one", () => {
    expect(metaShownLabel(1, 1, events)).toBe("1 archived event");
  });

  it("groups thousands the same way for every reader", () => {
    expect(metaShownLabel(1247, 1247, events)).toBe("1,247 archived events");
  });

  it("keeps the plural while narrowing down to one of many", () => {
    expect(metaShownLabel(1, 42, events)).toBe("1 of 42 archived events");
  });

  it("handles an empty archive", () => {
    expect(metaShownLabel(0, 0, events)).toBe("0 archived events");
  });
});

describe("joinNames", () => {
  it("prints one name alone", () => {
    expect(joinNames(["Nova"])).toBe("Nova");
  });

  it("joins two with 'and'", () => {
    expect(joinNames(["Nova", "Rell"])).toBe("Nova and Rell");
  });

  it("commas the middle and keeps 'and' for the last", () => {
    expect(joinNames(["Nova", "Rell", "Sett"])).toBe("Nova, Rell and Sett");
  });

  it("names everyone rather than collapsing a long list to a count", () => {
    expect(joinNames(["Nova", "Rell", "Sett", "Zed"])).toBe("Nova, Rell, Sett and Zed");
  });

  it("prints nothing for an empty list", () => {
    expect(joinNames([])).toBe("");
  });
});

describe("splitLegendName", () => {
  it("splits the composed name into champion and title", () => {
    expect(splitLegendName("Lux, Lady of Luminosity")).toEqual({
      champion: "Lux",
      title: "Lady of Luminosity",
    });
  });

  it("splits on the first comma only, so a title may hold its own", () => {
    expect(splitLegendName("Azir, Emperor of the Sands, Ascended")).toEqual({
      champion: "Azir",
      title: "Emperor of the Sands, Ascended",
    });
  });

  it("treats an untagged legend as all champion", () => {
    expect(splitLegendName("Emperor of the Sands")).toEqual({
      champion: "Emperor of the Sands",
      title: null,
    });
  });

  it("does not split on a comma with no space after it", () => {
    expect(splitLegendName("Lux,Lady")).toEqual({ champion: "Lux,Lady", title: null });
  });

  // Known limitation, safe on today's data: every catalogue Legend is
  // champion-tagged, and the four printed with a comma carry the ", Starter"
  // qualifier that legendDisplayName trims before composing. An untagged Legend
  // whose printed name kept a comma would reach here and be read as a pair.
  it("reads an untagged comma name as a pair, which the composer never produces", () => {
    expect(splitLegendName("Dark Child, Starter")).toEqual({
      champion: "Dark Child",
      title: "Starter",
    });
  });

  it("has no halves to find in an empty name", () => {
    expect(splitLegendName("")).toEqual({ champion: "", title: null });
  });
});

describe("metaEventCounts", () => {
  const TODAY = "2026-09-01";
  const event = (over: Partial<MetaCountedEvent>): MetaCountedEvent => ({
    eventDate: "2026-08-09",
    playerCount: null,
    playerRowCount: 0,
    deckCount: 0,
    ...over,
  });

  it("names the field the source published, not the rows we hold", () => {
    expect(
      metaEventCounts(event({ playerCount: 186, playerRowCount: 64, deckCount: 8 }), TODAY),
    ).toEqual(["186 players", "8 decks"]);
  });

  it("falls back to the rows on file when no source published a field size", () => {
    expect(metaEventCounts(event({ playerRowCount: 64, deckCount: 8 }), TODAY)).toEqual([
      "64 players",
      "8 decks",
    ]);
  });

  it("groups a four-figure field", () => {
    expect(metaEventCounts(event({ playerCount: 2092, playerRowCount: 2092 }), TODAY)).toEqual([
      "2,092 players",
      "0 decks",
    ]);
  });

  it("says a played event holds no results, without promising any", () => {
    expect(metaEventCounts(event({ playerCount: 82 }), TODAY)).toEqual([
      "82 players",
      "No results on file",
    ]);
  });

  it("says an event still to come has not been played, rather than missing results", () => {
    expect(metaEventCounts(event({ eventDate: "2026-09-26", playerCount: 195 }), TODAY)).toEqual([
      "195 players",
      "Not played yet",
    ]);
  });

  it("prints nothing about a field no source has sized", () => {
    expect(metaEventCounts(event({}), TODAY)).toEqual(["No results on file"]);
  });

  it("keeps a one-player event singular, and its deckless field plural", () => {
    expect(metaEventCounts(event({ playerCount: 1, playerRowCount: 1 }), TODAY)).toEqual([
      "1 player",
      "0 decks",
    ]);
  });
});

describe("metaEventEmptyStatus", () => {
  const TODAY = "2026-09-01";
  const event = (over: Partial<MetaCountedEvent>): MetaCountedEvent => ({
    eventDate: "2026-08-09",
    playerCount: null,
    playerRowCount: 0,
    deckCount: 0,
    ...over,
  });

  it("stays out of the way once the archive holds anything", () => {
    expect(metaEventEmptyStatus(event({ playerRowCount: 12 }), TODAY)).toBeNull();
  });

  it("names a played event's missing results as one fact", () => {
    expect(metaEventEmptyStatus(event({}), TODAY)).toBe("No results on file");
  });

  it("says an event still to come has not been played", () => {
    expect(metaEventEmptyStatus(event({ eventDate: "2026-09-26" }), TODAY)).toBe("Not played yet");
  });
});

describe("recordSortValue", () => {
  it("orders more wins ahead of fewer", () => {
    expect(recordSortValue(6, 1)).toBeGreaterThan(recordSortValue(5, 0) as number);
  });

  it("breaks a tie on wins by the fewer losses", () => {
    expect(recordSortValue(5, 0)).toBeGreaterThan(recordSortValue(5, 2) as number);
  });

  it("reads a missing loss count as none", () => {
    expect(recordSortValue(5, null)).toBe(recordSortValue(5, 0));
  });

  it("leaves a record the source never published unranked", () => {
    expect(recordSortValue(null, null)).toBeNull();
  });
});

describe("standingsGaps", () => {
  function row(rank: number, rankIsTier = false) {
    return { rank, rankIsTier };
  }

  it("finds the ranks missing inside a fetched field", () => {
    expect(standingsGaps([row(1), row(2), row(4)], 4)).toEqual([3]);
  });

  it("counts the tail the source reported but the archive never got", () => {
    expect(standingsGaps([row(1), row(2)], 5)).toEqual([3, 4, 5]);
  });

  it("still finds holes when the source reported no field size", () => {
    expect(standingsGaps([row(1), row(3)], null)).toEqual([2]);
  });

  it("leaves a field published as cut tiers alone", () => {
    expect(standingsGaps([row(1), row(2), row(4, true), row(4, true)], 8)).toEqual([]);
  });

  it("treats an event with no standings as pending, not incomplete", () => {
    expect(standingsGaps([], 128)).toEqual([]);
  });

  it("reports nothing for a complete field", () => {
    expect(standingsGaps([row(1), row(2), row(3)], 3)).toEqual([]);
  });
});

describe("formatRankRuns", () => {
  it("names scattered holes one by one", () => {
    expect(formatRankRuns([83, 118])).toBe("83, 118");
  });

  it("collapses a run into a range", () => {
    expect(formatRankRuns([91, 92, 93])).toBe("91–93");
  });

  it("mixes single ranks and ranges", () => {
    expect(formatRankRuns([4, 91, 92, 93, 120])).toBe("4, 91–93, 120");
  });

  it("counts the runs it stops naming", () => {
    expect(formatRankRuns([1, 3, 5, 7, 9, 11, 13, 15], 3)).toBe("1, 3, 5 and 5 more");
  });

  it("says nothing for no ranks at all", () => {
    expect(formatRankRuns([])).toBe("");
  });
});

describe("metaPlayerClaimChips", () => {
  it("gives an unclaimed row no chips", () => {
    expect(metaPlayerClaimChips([])).toEqual([]);
  });

  it("names a claimed field in the reader's words, not the column's", () => {
    expect(metaPlayerClaimChips(["rank"])).toEqual([{ field: "rank", label: "Finish" }]);
  });

  it("collapses a list and its status into one chip, since they release together", () => {
    expect(metaPlayerClaimChips(["cards", "listStatus"])).toEqual([
      { field: "cards", label: "Decklist" },
    ]);
  });

  it("stands in for the pair when only the status is claimed", () => {
    expect(metaPlayerClaimChips(["listStatus"])).toEqual([{ field: "cards", label: "Decklist" }]);
  });

  it("orders chips the same way whatever order they arrive in", () => {
    const forward = metaPlayerClaimChips(["rank", "playerName", "wins"]);
    expect(forward).toEqual(metaPlayerClaimChips(["wins", "rank", "playerName"]));
    expect(forward.map((chip) => chip.field)).toEqual(["playerName", "rank", "wins"]);
  });

  it("drops a field it has no label for rather than printing a slug", () => {
    expect(metaPlayerClaimChips(["somethingNew"])).toEqual([]);
  });
});
