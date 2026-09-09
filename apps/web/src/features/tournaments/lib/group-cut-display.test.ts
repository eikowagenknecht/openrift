import { GROUP_CUT_TIERS } from "@openrift/shared/pairing/group-cut-types";
import { describe, expect, it } from "vitest";

import {
  checkGroupPlayerCount,
  CUT_SIZE_ITEMS,
  cutMatchShortLabel,
  cutRoundLabel,
  cutRoundLabels,
  formatWinRate,
  GROUP_CUT_TIER_LABEL,
  parseCutSize,
} from "./group-cut-display";

describe("checkGroupPlayerCount", () => {
  it("accepts every even count from six up", () => {
    for (const count of [6, 8, 10, 12, 16, 18, 32]) {
      expect(checkGroupPlayerCount(count)).toEqual({ valid: true, message: null });
    }
  });

  it("asks for one more or one fewer player on an odd count", () => {
    for (const count of [7, 9, 17, 31]) {
      const result = checkGroupPlayerCount(count);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Add or drop one player to fill the groups of four.");
    }
  });

  it("names the minimum instead below six", () => {
    for (const count of [0, 4, 5]) {
      const result = checkGroupPlayerCount(count);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("A group stage needs at least six players.");
    }
  });
});

describe("cut round labels", () => {
  it("names the columns of each cut size", () => {
    expect(cutRoundLabels(4)).toEqual(["Semifinals", "Final"]);
    expect(cutRoundLabels(8)).toEqual(["Quarterfinals", "Semifinals", "Final"]);
    expect(cutRoundLabels(16)).toEqual(["Round of 16", "Quarterfinals", "Semifinals", "Final"]);
  });

  it("counts cut rounds from round four", () => {
    expect(cutRoundLabel(8, 4)).toBe("Quarterfinals");
    expect(cutRoundLabel(8, 6)).toBe("Final");
    expect(cutRoundLabel(4, 4)).toBe("Semifinals");
    expect(cutRoundLabel(16, 4)).toBe("Round of 16");
  });

  it("falls back to the plain round number past the final", () => {
    expect(cutRoundLabel(4, 9)).toBe("Round 9");
  });

  it("numbers a match inside its round, and leaves the final unnumbered", () => {
    expect(cutMatchShortLabel(8, 4, 2)).toBe("QF 2");
    expect(cutMatchShortLabel(8, 5, 1)).toBe("SF 1");
    expect(cutMatchShortLabel(8, 6, 1)).toBe("Final");
    expect(cutMatchShortLabel(16, 4, 3)).toBe("R16 3");
  });
});

describe("cut size", () => {
  it("offers only the three supported sizes", () => {
    expect(CUT_SIZE_ITEMS.map((item) => item.label)).toEqual(["Top 4", "Top 8", "Top 16"]);
  });

  it("parses a select value and rejects anything else", () => {
    expect(parseCutSize("8")).toBe(8);
    expect(parseCutSize("6")).toBeNull();
    expect(parseCutSize("")).toBeNull();
  });
});

describe("GROUP_CUT_TIER_LABEL", () => {
  it("labels every tier the API can send", () => {
    for (const tier of GROUP_CUT_TIERS) {
      expect(GROUP_CUT_TIER_LABEL[tier]).toBeTruthy();
    }
  });

  it("tells the two win rates apart", () => {
    expect(GROUP_CUT_TIER_LABEL.mw).toBe("MW%");
    expect(GROUP_CUT_TIER_LABEL.gw).toBe("GW%");
  });

  it("warns in words on the pending meta tier", () => {
    expect(GROUP_CUT_TIER_LABEL.meta_pending).toBe("Needs meta share");
  });
});

describe("formatWinRate", () => {
  it("rounds to whole percent and leaves an unplayed rate blank", () => {
    expect(formatWinRate(0.6667)).toBe("67%");
    expect(formatWinRate(1)).toBe("100%");
    expect(formatWinRate(null)).toBe("-");
  });
});
