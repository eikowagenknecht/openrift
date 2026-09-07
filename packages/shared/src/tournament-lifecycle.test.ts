import { describe, expect, it } from "vitest";

import { effectiveTournamentState } from "./tournament-lifecycle.js";

const START = "2026-03-01T18:00:00.000Z";
const END = "2026-03-01T22:00:00.000Z";

describe("effectiveTournamentState", () => {
  it("reports a cancelled tournament as cancelled even after its end", () => {
    expect(
      effectiveTournamentState(START, END, "cancelled", new Date("2026-03-02T00:00:00.000Z")),
    ).toBe("cancelled");
  });

  it("reports a cancelled tournament as cancelled before it starts", () => {
    expect(
      effectiveTournamentState(START, END, "cancelled", new Date("2026-02-01T00:00:00.000Z")),
    ).toBe("cancelled");
  });

  it("keeps an explicitly completed tournament completed before its start", () => {
    expect(
      effectiveTournamentState(START, END, "completed", new Date("2026-02-01T00:00:00.000Z")),
    ).toBe("completed");
  });

  it("is upcoming while the start is still ahead", () => {
    expect(
      effectiveTournamentState(START, END, "setup", new Date("2026-03-01T17:59:59.999Z")),
    ).toBe("upcoming");
  });

  it("turns in_progress at the start instant", () => {
    expect(effectiveTournamentState(START, END, "setup", new Date(START))).toBe("in_progress");
  });

  it("stays in_progress up to the last instant before the end", () => {
    expect(
      effectiveTournamentState(START, END, "running", new Date("2026-03-01T21:59:59.999Z")),
    ).toBe("in_progress");
  });

  it("turns completed at the end instant", () => {
    expect(effectiveTournamentState(START, END, "running", new Date(END))).toBe("completed");
  });

  it("auto-completes 24 hours after the start when no end is set", () => {
    expect(
      effectiveTournamentState(START, null, "running", new Date("2026-03-02T17:59:59.999Z")),
    ).toBe("in_progress");
    expect(
      effectiveTournamentState(START, null, "running", new Date("2026-03-02T18:00:00.000Z")),
    ).toBe("completed");
  });

  it("treats an end before the start as already completed", () => {
    expect(
      effectiveTournamentState(END, START, "running", new Date("2026-03-01T20:00:00.000Z")),
    ).toBe("completed");
  });
});
