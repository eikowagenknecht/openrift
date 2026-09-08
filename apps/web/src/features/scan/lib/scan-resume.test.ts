import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeLastScan, shouldPromptResume } from "@/features/scan/lib/scan-resume";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-05-04T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("shouldPromptResume", () => {
  it("prompts when the session has no recorded scan", () => {
    expect(shouldPromptResume(null)).toBe(true);
  });

  it("stays quiet within a day of the last scan", () => {
    expect(shouldPromptResume(NOW - 23 * HOUR)).toBe(false);
  });

  it("prompts once a full day has passed", () => {
    expect(shouldPromptResume(NOW - DAY)).toBe(true);
  });
});

describe("describeLastScan", () => {
  it("falls back when there is no timestamp", () => {
    expect(describeLastScan(null)).toBe("in an earlier session");
  });

  it("describes the same day, the day before, and older sessions", () => {
    expect(describeLastScan(NOW - 3 * HOUR)).toBe("earlier today");
    expect(describeLastScan(NOW - DAY)).toBe("yesterday");
    expect(describeLastScan(NOW - 5 * DAY)).toBe("5 days ago");
  });
});
