import { describe, expect, it } from "vitest";

import { tradesKeys } from "./groups-query-keys";

describe("tradesKeys", () => {
  it("liveByPrinting nests under the trades all invalidation prefix", () => {
    const prefix = tradesKeys.all("user-1");
    const key = tradesKeys.liveByPrinting("user-1");
    expect(key).toEqual(["trades", "user-1", "live-by-printing"]);
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
  });

  it("copyOptions nests under the trades all invalidation prefix", () => {
    const prefix = tradesKeys.all("user-1");
    const key = tradesKeys.copyOptions("user-1", "trade-1");
    expect(key).toEqual(["trades", "user-1", "copy-options", "trade-1"]);
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
  });

  it("sheet nests under the trades all invalidation prefix", () => {
    const prefix = tradesKeys.all("user-1");
    const key = tradesKeys.sheet("user-1", "member-1");
    expect(key).toEqual(["trades", "user-1", "sheet", "member-1"]);
    expect(key.slice(0, prefix.length)).toEqual([...prefix]);
  });
});
