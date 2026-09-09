import { describe, expect, it } from "vitest";

import type { MetaRecheckState } from "./meta-recheck-schedule.js";
import { lifecycleStatus, nextRecheck } from "./meta-recheck-schedule.js";

const NOW = new Date("2026-08-20T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function state(overrides: Partial<MetaRecheckState> = {}): MetaRecheckState {
  return {
    now: NOW,
    checkStage: 0,
    displayStatus: "complete",
    startAt: new Date("2026-08-19T12:00:00Z"),
    decklistStatus: null,
    fetched: false,
    decksComplete: false,
    playersPending: false,
    newRounds: false,
    watched: false,
    ...overrides,
  };
}

describe("nextRecheck", () => {
  it("waits for the start time of an event that has not begun", () => {
    const startAt = new Date("2026-08-25T09:00:00Z");
    const decision = nextRecheck(state({ displayStatus: "upcoming", startAt }));

    expect(decision).toEqual({ nextCheckAt: startAt, checkStage: 0, deepFetch: false });
  });

  it("polls hourly once an event has started but not finished", () => {
    const decision = nextRecheck(state({ displayStatus: "inProgress" }));

    expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + HOUR_MS);
    expect(decision.checkStage).toBe(0);
    expect(decision.deepFetch).toBe(false);
  });

  it("polls a live watched event every ten minutes instead", () => {
    const decision = nextRecheck(state({ displayStatus: "inProgress", watched: true }));

    expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + 10 * 60 * 1000);
    expect(decision.checkStage).toBe(0);
    expect(decision.deepFetch).toBe(false);
  });

  it("stops polling an event the source leaves unfinished for days", () => {
    const decision = nextRecheck(
      state({ displayStatus: "inProgress", startAt: new Date("2026-08-16T12:00:00Z") }),
    );

    expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + DAY_MS);
    expect(decision.checkStage).toBe(1);
    expect(decision.deepFetch).toBe(false);
  });

  it("drops a stale unfinished event once its ladder runs out", () => {
    const decision = nextRecheck(
      state({
        displayStatus: "upcoming",
        startAt: new Date("2026-06-01T12:00:00Z"),
        checkStage: 5,
      }),
    );

    expect(decision.nextCheckAt).toBeNull();
    expect(decision.deepFetch).toBe(false);
  });

  it("fetches a running event again once the source finishes another round", () => {
    const decision = nextRecheck(state({ displayStatus: "inProgress", newRounds: true }));

    expect(decision.deepFetch).toBe(true);
    expect(decision.checkStage).toBe(0);
    expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + HOUR_MS);
  });

  it("pulls the results the first time an event reads as complete", () => {
    const decision = nextRecheck(state());

    expect(decision.deepFetch).toBe(true);
    expect(decision.checkStage).toBe(1);
    expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + DAY_MS);
  });

  it("pulls the final standings over a mid-event fetch once the event completes", () => {
    const decision = nextRecheck(state({ fetched: true }));

    expect(decision.deepFetch).toBe(true);
    expect(decision.checkStage).toBe(1);
  });

  it("walks the decaying ladder without re-fetching an unchanged event", () => {
    const steps = [1, 3, 7, 30, 90];
    let stage = 1;
    for (const days of steps.slice(1)) {
      const decision = nextRecheck(state({ checkStage: stage, fetched: true }));
      expect(decision.deepFetch).toBe(false);
      expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + days * DAY_MS);
      stage = decision.checkStage;
    }
    expect(stage).toBe(5);
  });

  it("leaves the queue once the ladder is exhausted", () => {
    const decision = nextRecheck(state({ checkStage: 5, fetched: true }));

    expect(decision.nextCheckAt).toBeNull();
    expect(decision.checkStage).toBe(5);
  });

  it("fetches again the first time an organizer publishes the decklists", () => {
    const published = nextRecheck(
      state({ checkStage: 3, fetched: true, decklistStatus: "PUBLISHED" }),
    );
    const alreadyHave = nextRecheck(
      state({ checkStage: 3, fetched: true, decklistStatus: "PUBLISHED", decksComplete: true }),
    );

    expect(published.deepFetch).toBe(true);
    expect(alreadyHave.deepFetch).toBe(false);
  });

  it("fetches again while staged players still wait on their accept", () => {
    const decision = nextRecheck(state({ checkStage: 2, fetched: true, playersPending: true }));

    expect(decision.deepFetch).toBe(true);
  });
});

describe("lifecycleStatus", () => {
  const started = new Date("2026-08-20T09:00:00Z");

  it("reads the source's own lifecycle for an event on its day", () => {
    expect(lifecycleStatus({ now: NOW, displayStatus: "inProgress", startAt: started })).toBe(
      "in_progress",
    );
    expect(lifecycleStatus({ now: NOW, displayStatus: "complete", startAt: started })).toBe(
      "complete",
    );
  });

  it("calls an event upcoming until its start time whatever the source says", () => {
    const startAt = new Date("2026-08-25T09:00:00Z");
    expect(lifecycleStatus({ now: NOW, displayStatus: "inProgress", startAt })).toBe("upcoming");
  });

  it("treats an event that started but the source never advanced as upcoming, not live", () => {
    expect(lifecycleStatus({ now: NOW, displayStatus: "upcoming", startAt: started })).toBe(
      "upcoming",
    );
  });

  it("closes an event the source leaves running for days", () => {
    const startAt = new Date("2026-08-16T12:00:00Z");
    expect(lifecycleStatus({ now: NOW, displayStatus: "inProgress", startAt })).toBe("complete");
  });
});
