import type { PackRandom as Random } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildSpotlightSequence, chooseRandomId, spotlightStepDelay } from "./match-helpers";

function constantRandom(value: number): Random {
  return { next: () => value };
}

describe("chooseRandomId", () => {
  it("maps the RNG range onto the id list", () => {
    const ids = ["a", "b", "c", "d"];
    expect(chooseRandomId(ids, constantRandom(0))).toBe("a");
    expect(chooseRandomId(ids, constantRandom(0.5))).toBe("c");
  });

  it("clamps when the RNG returns its upper bound", () => {
    const ids = ["a", "b", "c"];
    expect(chooseRandomId(ids, constantRandom(0.999999))).toBe("c");
  });

  it("returns null for an empty list", () => {
    expect(chooseRandomId([], constantRandom(0.5))).toBeNull();
  });
});

describe("buildSpotlightSequence", () => {
  it("always ends on the winner", () => {
    expect(buildSpotlightSequence(["a", "b"], "a").at(-1)).toBe("a");
    expect(buildSpotlightSequence(["a", "b"], "b").at(-1)).toBe("b");
    expect(buildSpotlightSequence(["a", "b", "c", "d"], "c").at(-1)).toBe("c");
  });

  it("cycles through the roster in order for the given number of loops", () => {
    const ids = ["a", "b", "c"];
    const sequence = buildSpotlightSequence(ids, "a", 2);
    expect(sequence).toEqual(["a", "b", "c", "a", "b", "c", "a"]);
  });

  it("returns an empty sequence for an empty roster", () => {
    expect(buildSpotlightSequence([], "a")).toEqual([]);
  });

  it("falls back to a valid step when the winner is not in the roster", () => {
    const sequence = buildSpotlightSequence(["a", "b"], "ghost");
    expect(sequence.length).toBeGreaterThan(0);
    expect(sequence.every((id) => id === "a" || id === "b")).toBe(true);
  });
});

describe("spotlightStepDelay", () => {
  it("eases out: later steps dwell longer than earlier ones", () => {
    const early = spotlightStepDelay(0, 10);
    const late = spotlightStepDelay(9, 10);
    expect(early).toBeLessThan(late);
  });

  it("returns the max dwell when there is only one step", () => {
    expect(spotlightStepDelay(0, 1)).toBe(320);
  });

  it("stays within the configured bounds", () => {
    for (let step = 0; step < 8; step++) {
      const delay = spotlightStepDelay(step, 8);
      expect(delay).toBeGreaterThanOrEqual(60);
      expect(delay).toBeLessThanOrEqual(320);
    }
  });
});
