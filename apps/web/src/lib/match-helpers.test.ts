import type { PackRandom as Random } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { flipCoin, rollDie } from "./match-helpers";

function constantRandom(value: number): Random {
  return { next: () => value };
}

describe("flipCoin", () => {
  it("returns heads below 0.5 and tails at or above 0.5", () => {
    expect(flipCoin(constantRandom(0))).toBe("heads");
    expect(flipCoin(constantRandom(0.49))).toBe("heads");
    expect(flipCoin(constantRandom(0.5))).toBe("tails");
    expect(flipCoin(constantRandom(0.99))).toBe("tails");
  });
});

describe("rollDie", () => {
  it("maps the RNG range onto [1, sides]", () => {
    expect(rollDie(6, constantRandom(0))).toBe(1);
    expect(rollDie(6, constantRandom(0.999_999))).toBe(6);
    expect(rollDie(20, constantRandom(0.5))).toBe(11);
  });

  it("clamps invalid side counts to at least one", () => {
    expect(rollDie(0, constantRandom(0.9))).toBe(1);
    expect(rollDie(-4, constantRandom(0.9))).toBe(1);
  });
});
