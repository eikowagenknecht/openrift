import { describe, expect, it } from "vitest";

import { countSignups, toUserGrowthSeries } from "@/features/admin/lib/user-growth";

const series = [
  { date: "2026-01-01", count: 2 },
  { date: "2026-01-02", count: 0 },
  { date: "2026-01-03", count: 3 },
];

describe("toUserGrowthSeries", () => {
  it("accumulates signups into a running user total", () => {
    expect(toUserGrowthSeries(series, "all")).toEqual([
      { date: "2026-01-01", users: 2, signups: 2 },
      { date: "2026-01-02", users: 2, signups: 0 },
      { date: "2026-01-03", users: 5, signups: 3 },
    ]);
  });

  it("keeps the real total on a windowed range instead of restarting at zero", () => {
    const window = toUserGrowthSeries(series, "30d");
    expect(window).toHaveLength(3);

    const long = Array.from({ length: 40 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 1, 1 + i)).toISOString().slice(0, 10),
      count: 1,
    }));
    const tail = toUserGrowthSeries(long, "30d");
    expect(tail).toHaveLength(30);
    expect(tail.at(0)?.users).toBe(11);
    expect(tail.at(-1)?.users).toBe(40);
  });

  it("returns nothing for an empty series", () => {
    expect(toUserGrowthSeries([], "all")).toEqual([]);
    expect(toUserGrowthSeries([], "90d")).toEqual([]);
  });
});

describe("countSignups", () => {
  it("sums the signups in the given window", () => {
    expect(countSignups(toUserGrowthSeries(series, "all"))).toBe(5);
    expect(countSignups([])).toBe(0);
  });
});
