import { describe, expect, it } from "vitest";

import { openRoundRefetchInterval } from "./open-round-polling";

describe("openRoundRefetchInterval", () => {
  it("polls while a round is reporting", () => {
    const interval = openRoundRefetchInterval({
      rounds: [{ status: "finalized" }, { status: "reporting" }],
    });
    expect(interval).toBeGreaterThan(0);
  });

  it("stops once every round is finalized", () => {
    expect(
      openRoundRefetchInterval({ rounds: [{ status: "finalized" }, { status: "finalized" }] }),
    ).toBe(false);
  });

  it("stops when there are no rounds", () => {
    expect(openRoundRefetchInterval({ rounds: [] })).toBe(false);
  });

  it("stops before the first fetch resolves", () => {
    expect(openRoundRefetchInterval(undefined)).toBe(false);
  });
});
