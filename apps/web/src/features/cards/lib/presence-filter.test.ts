import { PRESENCE_DIMENSIONS } from "@openrift/shared/types/search";
import { describe, expect, it } from "vitest";

import { PRESENCE_LABELS, presenceFlagCount, presenceToFlagState } from "./presence-filter";

describe("presenceToFlagState", () => {
  it("maps 'any' to a check (true), 'none' to a minus (false), null to off", () => {
    expect(presenceToFlagState("any")).toBe(true);
    expect(presenceToFlagState("none")).toBe(false);
    expect(presenceToFlagState(null)).toBe(null);
  });
});

describe("presenceFlagCount", () => {
  const counts = { any: 42, none: 7 };

  it("shows the any count when off or requiring any", () => {
    expect(presenceFlagCount(counts, null)).toBe(42);
    expect(presenceFlagCount(counts, true)).toBe(42);
  });

  it("shows the none count when forbidding (state false)", () => {
    expect(presenceFlagCount(counts, false)).toBe(7);
  });

  it("returns undefined when counts are not loaded", () => {
    expect(presenceFlagCount(undefined, true)).toBe(undefined);
  });
});

describe("PRESENCE_LABELS", () => {
  it("has a label for every presence dimension", () => {
    for (const dimension of PRESENCE_DIMENSIONS) {
      expect(PRESENCE_LABELS[dimension]).toBeTruthy();
    }
  });
});
