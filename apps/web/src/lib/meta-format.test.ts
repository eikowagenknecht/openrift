import { describe, expect, it } from "vitest";

import {
  formatRank,
  formatRankRuns,
  formatRecord,
  metaEventCounts,
  recordSortValue,
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
  it("renders wins and losses", () => {
    expect(formatRecord(5, 1, null)).toBe("5-1");
    expect(formatRecord(0, 3, null)).toBe("0-3");
  });

  it("always shows a known draw count, zero included", () => {
    expect(formatRecord(5, 1, 2)).toBe("5-1-2");
    expect(formatRecord(5, 1, 0)).toBe("5-1-0");
  });

  it("renders nothing without both wins and losses", () => {
    expect(formatRecord(null, null, null)).toBeNull();
    expect(formatRecord(5, null, null)).toBeNull();
    expect(formatRecord(null, 1, 0)).toBeNull();
  });
});

describe("metaEventCounts", () => {
  it("counts the field and the lists behind it", () => {
    expect(metaEventCounts(64, 8)).toEqual(["64 players", "8 decks"]);
  });

  it("says an event with nothing fetched yet is waiting, not empty", () => {
    expect(metaEventCounts(0, 0)).toEqual(["Results pending"]);
  });

  it("keeps a one-player event singular, and its deckless field plural", () => {
    expect(metaEventCounts(1, 0)).toEqual(["1 player", "0 decks"]);
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
