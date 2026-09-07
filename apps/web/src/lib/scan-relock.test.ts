import { describe, expect, it } from "vitest";

import { RELOCK_EMPTY_GUIDE_MS, createRelockGuard } from "./scan-relock";

/** Holds the guide empty for `ms`, in the small steps a frame loop delivers. */
function holdEmpty(guard: ReturnType<typeof createRelockGuard>, from: number, ms: number): number {
  for (let at = from; at <= from + ms; at += 100) {
    guard.observe(false, at);
  }
  return from + ms;
}

describe("createRelockGuard", () => {
  it("allows an artwork nobody has added yet", () => {
    const guard = createRelockGuard();
    expect(guard.allows("lux")).toBe(true);
  });

  it("blocks the same artwork while it stays in the guide", () => {
    const guard = createRelockGuard();
    guard.observe(true, 0);
    guard.note("lux", 0);
    guard.observe(true, 400);
    expect(guard.allows("lux")).toBe(false);
  });

  it("blocks a re-lock after a dropout too short to be a new card", () => {
    const guard = createRelockGuard();
    guard.note("lux", 0);
    const at = holdEmpty(guard, 100, RELOCK_EMPTY_GUIDE_MS - 500);
    guard.observe(true, at + 100);
    expect(guard.allows("lux")).toBe(false);
  });

  it("allows the same artwork again once the guide has been properly empty", () => {
    const guard = createRelockGuard();
    guard.note("lux", 0);
    const at = holdEmpty(guard, 100, RELOCK_EMPTY_GUIDE_MS + 200);
    guard.observe(true, at + 100);
    expect(guard.allows("lux")).toBe(true);
  });

  it("restarts the empty stretch when a card comes back into the guide", () => {
    const guard = createRelockGuard();
    guard.note("lux", 0);
    holdEmpty(guard, 100, RELOCK_EMPTY_GUIDE_MS - 400);
    guard.observe(true, 2000);
    holdEmpty(guard, 2100, RELOCK_EMPTY_GUIDE_MS - 400);
    expect(guard.allows("lux")).toBe(false);
  });

  it("allows an artwork again once a different card was added in between", () => {
    const guard = createRelockGuard();
    guard.note("lux", 0);
    expect(guard.allows("lux")).toBe(false);
    guard.note("jinx", 500);
    expect(guard.allows("lux")).toBe(true);
  });

  it("blocks the newest artwork again after it was the one that came between", () => {
    const guard = createRelockGuard();
    guard.note("lux", 0);
    guard.note("jinx", 500);
    expect(guard.allows("jinx")).toBe(false);
  });

  it("never blocks an artwork the session has not seen", () => {
    const guard = createRelockGuard();
    guard.note("lux", 0);
    expect(guard.allows("teemo")).toBe(true);
  });

  it("forgets everything on reset", () => {
    const guard = createRelockGuard();
    guard.note("lux", 0);
    expect(guard.allows("lux")).toBe(false);
    guard.reset();
    expect(guard.allows("lux")).toBe(true);
  });

  it("takes the empty-guide window from the caller", () => {
    const guard = createRelockGuard(300);
    guard.note("lux", 0);
    guard.observe(false, 100);
    guard.observe(false, 500);
    expect(guard.allows("lux")).toBe(true);
  });
});
