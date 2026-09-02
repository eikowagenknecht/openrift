import { describe, expect, it } from "vitest";

import type { JobRun } from "../repositories/job-runs.js";
import { toJobScheduleView } from "./job-schedule-presenters.js";

const META = {
  kind: "tcgplayer.refresh",
  title: "TCGPlayer price refresh",
  description: "Pulls the latest TCGPlayer prices.",
  suggestedSchedule: "0 6 * * *",
} as const;

const RUN: JobRun = {
  id: "run-1",
  kind: "tcgplayer.refresh",
  trigger: "cron",
  status: "succeeded",
  startedAt: new Date("2026-09-01T06:00:00Z"),
  finishedAt: new Date("2026-09-01T06:01:00Z"),
  durationMs: 60_000,
  errorMessage: null,
  result: null,
  noop: false,
};

describe("toJobScheduleView", () => {
  it("reports a job with no stored row as off", () => {
    const view = toJobScheduleView({ meta: META, row: null, lastRun: undefined, nextRun: null });
    expect(view).toEqual({
      kind: "tcgplayer.refresh",
      title: "TCGPlayer price refresh",
      description: "Pulls the latest TCGPlayer prices.",
      suggestedSchedule: "0 6 * * *",
      schedule: null,
      available: true,
      unavailableReason: null,
      nextRun: null,
      lastRun: null,
      updatedAt: null,
    });
  });

  it("carries the stored schedule, the next run and the last run", () => {
    const view = toJobScheduleView({
      meta: META,
      row: {
        kind: "tcgplayer.refresh",
        schedule: "30 6 * * *",
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
      lastRun: RUN,
      nextRun: new Date("2026-09-02T06:30:00Z"),
    });
    expect(view.schedule).toBe("30 6 * * *");
    expect(view.updatedAt).toBe("2026-08-30T12:00:00.000Z");
    expect(view.nextRun).toBe("2026-09-02T06:30:00.000Z");
    expect(view.lastRun).toEqual({
      startedAt: "2026-09-01T06:00:00.000Z",
      finishedAt: "2026-09-01T06:01:00.000Z",
      durationMs: 60_000,
      status: "succeeded",
      errorMessage: null,
    });
  });

  it("marks a job with a missing secret unavailable", () => {
    const view = toJobScheduleView({
      meta: { ...META, unavailableReason: "CARDTRADER_API_TOKEN is not set." },
      row: null,
      lastRun: undefined,
      nextRun: null,
    });
    expect(view.available).toBe(false);
    expect(view.unavailableReason).toBe("CARDTRADER_API_TOKEN is not set.");
  });

  it("keeps a still-running last run's null finish", () => {
    const view = toJobScheduleView({
      meta: META,
      row: null,
      lastRun: { ...RUN, status: "running", finishedAt: null, durationMs: null },
      nextRun: null,
    });
    expect(view.lastRun).toEqual({
      startedAt: "2026-09-01T06:00:00.000Z",
      finishedAt: null,
      durationMs: null,
      status: "running",
      errorMessage: null,
    });
  });
});
