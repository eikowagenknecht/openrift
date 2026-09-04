import { describe, expect, it } from "vitest";

import { formatRank, formatRecord } from "./meta-standings.js";

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
    expect(formatRank(113, false)).toBe("113th");
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
