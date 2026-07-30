import { describe, expect, it } from "vitest";

import { RulesCache } from "./rules-cache.js";
import { makeRule, makeRulesSnapshot } from "./test/factories.js";

function makeFetcher() {
  const snapshot = makeRulesSnapshot(
    [makeRule({ ruleNumber: "100", content: "First rule." })],
    [makeRule({ ruleNumber: "200", content: "First tournament rule." })],
  );
  return {
    fetchRules: (kind: "core" | "tournament") =>
      Promise.resolve(kind === "core" ? snapshot.core : snapshot.tournament),
  };
}

describe("RulesCache", () => {
  it("starts empty and exposes both kinds after a refresh", async () => {
    const cache = new RulesCache(makeFetcher());
    expect(cache.snapshot).toBeNull();
    await cache.refresh();
    expect(cache.snapshot?.core.rules).toHaveLength(1);
    expect(cache.snapshot?.tournament.kind).toBe("tournament");
  });

  it("keeps the previous snapshot when a refresh fails", async () => {
    let fail = false;
    const working = makeFetcher();
    const cache = new RulesCache({
      fetchRules: (kind) =>
        fail ? Promise.reject(new Error("api down")) : working.fetchRules(kind),
    });
    await cache.refresh();
    const before = cache.snapshot;
    fail = true;
    await expect(cache.refresh()).rejects.toThrow("api down");
    expect(cache.snapshot).toBe(before);
  });
});
