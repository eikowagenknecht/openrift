import { describe, expect, it } from "vitest";

import type { EngineProgress, ResourceProgress } from "@/hooks/use-scan-engine";

import { scanLoadProgress } from "./scan-load-progress";

function resource(overrides: Partial<ResourceProgress> = {}): ResourceProgress {
  return { loaded: 0, total: 0, ready: false, ...overrides };
}

function engine(opencv: ResourceProgress, encoder: ResourceProgress): EngineProgress {
  return { opencv, encoder };
}

describe("scanLoadProgress", () => {
  it("starts at zero while nothing has arrived", () => {
    expect(scanLoadProgress(false, engine(resource(), resource()))).toEqual({
      percent: 0,
      phase: "downloading",
    });
  });

  it("weights the bank and both resources equally", () => {
    const half = resource({ loaded: 50, total: 100 });
    expect(scanLoadProgress(true, engine(half, half)).percent).toBe(67);
  });

  it("counts a ready resource as complete regardless of its byte counts", () => {
    expect(
      scanLoadProgress(true, engine(resource({ ready: true }), resource({ ready: true }))),
    ).toEqual({ percent: 100, phase: "starting" });
  });

  it("switches to starting once every download is in but the engine is not ready", () => {
    const done = resource({ loaded: 100, total: 100 });
    expect(scanLoadProgress(true, engine(done, done))).toEqual({ percent: 100, phase: "starting" });
  });

  it("stays downloading while the bank is missing", () => {
    const done = resource({ loaded: 100, total: 100 });
    expect(scanLoadProgress(false, engine(done, done)).phase).toBe("downloading");
  });

  it("clamps over-reported byte counts", () => {
    const over = resource({ loaded: 150, total: 100 });
    expect(scanLoadProgress(true, engine(over, over)).percent).toBe(100);
  });
});
