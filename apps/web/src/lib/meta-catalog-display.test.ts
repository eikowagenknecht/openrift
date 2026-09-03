import type { MetaOverlayQueueRow } from "@openrift/shared";
import type {
  MetaSyncStatus,
  PlayloltcgCatalogRow,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { describe, expect, it } from "vitest";

import {
  backfillDisplay,
  catalogDayBoundary,
  catalogStatusDisplay,
  catalogTriageDisplay,
  catalogVenueText,
  metaSyncAlerts,
  overlayCountsForProvider,
  PLAYLOLTCG_STATUS_CHOICES,
  playloltcgCoverageRow,
  playloltcgStatusDisplay,
  runningRunId,
  syncTriggerAnnouncement,
} from "./meta-catalog-display";

describe("catalogStatusDisplay", () => {
  it("names each status the source publishes", () => {
    expect(catalogStatusDisplay("inProgress").label).toBe("In progress");
    expect(catalogStatusDisplay("complete").label).toBe("Complete");
  });

  it("shows a status it has never seen verbatim rather than dropping it", () => {
    expect(catalogStatusDisplay("cancelled")).toEqual({ label: "cancelled", variant: "outline" });
  });
});

describe("playloltcgStatusDisplay", () => {
  it("names each step of the source's lifecycle", () => {
    expect(playloltcgStatusDisplay(1)?.label).toBe("Reg open");
    expect(playloltcgStatusDisplay(4)).toEqual({ label: "In progress", variant: "warning" });
    expect(playloltcgStatusDisplay(5)).toEqual({ label: "Finished", variant: "success" });
  });

  it("says nothing about a step outside the five the source documents", () => {
    expect(playloltcgStatusDisplay(9)).toBeUndefined();
    expect(playloltcgStatusDisplay(null)).toBeUndefined();
  });

  it("offers the whole lifecycle as filter choices, in the order it runs", () => {
    expect(PLAYLOLTCG_STATUS_CHOICES.map((choice) => choice.value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });
});

describe("playloltcgCoverageRow", () => {
  function catalogRow(overrides: Partial<PlayloltcgCatalogRow> = {}): PlayloltcgCatalogRow {
    return {
      activityShopId: 4021,
      name: "Summoner Skirmish",
      shopName: "Piltover Games",
      city: "Zaun",
      status: 5,
      battleMode: "1v1",
      playerCount: 32,
      startAt: "2026-08-15",
      triage: "accepted",
      metaEventId: "event-1",
      metaEventSlug: "summoner-skirmish",
      fetchedAt: "2026-08-16T00:00:00.000Z",
      missingSince: null,
      nextCheckAt: "2026-08-17T00:00:00.000Z",
      stagedPlayerCount: 32,
      stagedLegendCount: 30,
      stagedDeckCount: 8,
      sourceUrl: "https://example.test/activity/4021",
      ...overrides,
    };
  }

  it("maps the lifecycle onto the three statuses the chips speak", () => {
    expect(playloltcgCoverageRow(catalogRow({ status: 2 })).displayStatus).toBe("upcoming");
    expect(playloltcgCoverageRow(catalogRow({ status: 4 })).displayStatus).toBe("inProgress");
    expect(playloltcgCoverageRow(catalogRow({ status: 5 })).displayStatus).toBe("complete");
  });

  it("treats a step it does not know as not yet run, rather than as finished", () => {
    expect(playloltcgCoverageRow(catalogRow({ status: null })).displayStatus).toBe("upcoming");
    expect(playloltcgCoverageRow(catalogRow({ status: 9 })).displayStatus).toBe("upcoming");
  });

  it("reads the start as an instant, and keeps a missing day missing", () => {
    expect(playloltcgCoverageRow(catalogRow()).startAt).toBe("2026-08-15T00:00:00.000Z");
    expect(playloltcgCoverageRow(catalogRow({ startAt: null })).startAt).toBeNull();
  });

  it("says nothing about published decklists, which the source never publishes", () => {
    expect(playloltcgCoverageRow(catalogRow()).decklistStatus).toBeNull();
  });
});

describe("catalogTriageDisplay", () => {
  it("tones the untriaged state as the one needing attention", () => {
    expect(catalogTriageDisplay("new")).toEqual({ label: "New", variant: "warning" });
    expect(catalogTriageDisplay("dismissed").variant).toBe("muted");
  });
});

describe("catalogVenueText", () => {
  it("joins the store and the location", () => {
    expect(catalogVenueText({ storeName: "Piltover Games", location: "Zaun" })).toBe(
      "Piltover Games, Zaun",
    );
  });

  it("keeps whichever half the source published", () => {
    expect(catalogVenueText({ storeName: null, location: "Zaun" })).toBe("Zaun");
    expect(catalogVenueText({ storeName: "Piltover Games", location: null })).toBe(
      "Piltover Games",
    );
  });

  it("falls back to a placeholder when the source published neither", () => {
    expect(catalogVenueText({ storeName: null, location: null })).toBe("—");
  });
});

describe("catalogDayBoundary", () => {
  it("opens the range at the start of the UTC day", () => {
    expect(catalogDayBoundary("2026-08-15", "start")).toBe("2026-08-15T00:00:00.000Z");
  });

  it("closes the range at the last instant of the UTC day, so that day is included", () => {
    expect(catalogDayBoundary("2026-08-15", "end")).toBe("2026-08-15T23:59:59.999Z");
  });

  it("has no boundary for an empty or half-typed day", () => {
    expect(catalogDayBoundary("", "start")).toBeUndefined();
    expect(catalogDayBoundary("2026-08", "start")).toBeUndefined();
  });

  it("rejects a well-shaped day that is not a real one", () => {
    expect(catalogDayBoundary("2026-13-01", "start")).toBeUndefined();
  });
});

const BACKFILL_KIND = "meta.uvsgames_backfill";

function backfillRun(
  status: MetaSyncStatus["runs"][number]["status"],
  result: Record<string, unknown> | null,
  kind = BACKFILL_KIND,
): MetaSyncStatus["runs"][number] {
  return {
    id: "run-backfill",
    kind,
    trigger: "admin",
    status,
    startedAt: "2026-08-29T11:00:00.000Z",
    finishedAt: null,
    durationMs: null,
    errorMessage: null,
    result,
  };
}

describe("backfillDisplay", () => {
  it("is idle when the source has never run a backfill", () => {
    expect(backfillDisplay([], BACKFILL_KIND)).toEqual({ phase: "idle" });
  });

  it("ignores another source's backfill runs", () => {
    const runs = [backfillRun("running", null, "meta.playloltcg_backfill")];
    expect(backfillDisplay(runs, BACKFILL_KIND)).toEqual({ phase: "idle" });
  });

  it("carries the resume point of a run still going", () => {
    const runs = [backfillRun("running", { coveredThrough: "2026-04-06T13:00:00.000Z" })];
    expect(backfillDisplay(runs, BACKFILL_KIND)).toEqual({
      phase: "running",
      coveredThrough: "2026-04-06T13:00:00.000Z",
    });
  });

  it("runs without a resume point until the first checkpoint lands", () => {
    expect(backfillDisplay([backfillRun("running", null)], BACKFILL_KIND)).toEqual({
      phase: "running",
      coveredThrough: null,
    });
  });

  it("offers to resume a run that stopped early and said where", () => {
    const runs = [
      backfillRun("succeeded", {
        complete: false,
        cancelRequested: true,
        rows: 120_000,
        coveredThrough: "2026-04-06T13:00:00.000Z",
      }),
    ];
    expect(backfillDisplay(runs, BACKFILL_KIND)).toEqual({
      phase: "resumable",
      coveredThrough: "2026-04-06T13:00:00.000Z",
      cancelled: true,
    });
  });

  it("is idle again once a backfill covered the whole history", () => {
    const runs = [
      backfillRun("succeeded", {
        complete: true,
        cancelRequested: false,
        rows: 260_000,
        coveredThrough: "2026-04-06T13:00:00.000Z",
      }),
    ];
    expect(backfillDisplay(runs, BACKFILL_KIND)).toEqual({ phase: "idle" });
  });

  it("has nothing to resume from a partial run that never said where it got to", () => {
    const runs = [
      backfillRun("succeeded", {
        complete: false,
        cancelRequested: false,
        rows: 10,
        coveredThrough: null,
      }),
    ];
    expect(backfillDisplay(runs, BACKFILL_KIND)).toEqual({ phase: "idle" });
  });
});

describe("runningRunId", () => {
  const RECHECK_KIND = "meta.uvsgames_recheck";

  it("has nothing to stop when the kind has never run", () => {
    expect(runningRunId([], RECHECK_KIND)).toBeNull();
  });

  it("names the run while it is still going", () => {
    const runs = [backfillRun("running", null, RECHECK_KIND)];
    expect(runningRunId(runs, RECHECK_KIND)).toBe("run-backfill");
  });

  it("has nothing to stop once the newest run of the kind finished", () => {
    const runs = [backfillRun("succeeded", null, RECHECK_KIND)];
    expect(runningRunId(runs, RECHECK_KIND)).toBeNull();
  });

  it("ignores a run of another kind that is still going", () => {
    const runs = [backfillRun("running", null, BACKFILL_KIND)];
    expect(runningRunId(runs, RECHECK_KIND)).toBeNull();
  });
});

describe("syncTriggerAnnouncement", () => {
  it("says a crawl started rather than claiming it finished", () => {
    const announcement = syncTriggerAnnouncement("Recent window", {
      status: "running",
      runId: "run-1",
      message: null,
      result: null,
    });
    expect(announcement).toMatchObject({ title: "Recent window started", ok: true });
  });

  it("answers a second click while one of the kind is in flight", () => {
    const announcement = syncTriggerAnnouncement("Rechecks", {
      status: "already_running",
      runId: "run-1",
      message: null,
      result: null,
    });
    expect(announcement.title).toBe("Rechecks is already running");
    expect(announcement.ok).toBe(false);
  });

  it("carries the failure's own message", () => {
    const announcement = syncTriggerAnnouncement("Fetch", {
      status: "failed",
      runId: null,
      message: "Upstream returned 503",
      result: null,
    });
    expect(announcement).toEqual({
      title: "Fetch failed",
      description: "Upstream returned 503",
      ok: false,
    });
  });

  it("summarizes what a trigger that waited actually did", () => {
    const announcement = syncTriggerAnnouncement("Fetch", {
      status: "succeeded",
      runId: null,
      message: null,
      result: { players: 64, decks: 8 },
    });
    expect(announcement).toEqual({
      title: "Fetch finished",
      description: "64 players · 8 decks",
      ok: true,
    });
  });
});

const NOW = new Date("2026-08-29T12:00:00.000Z");

function syncStatus(
  catalog: Partial<MetaSyncStatus["catalog"]> = {},
  overrides: Partial<MetaSyncStatus> = {},
): MetaSyncStatus {
  return {
    catalog: {
      total: 266_000,
      completed: 190_000,
      decklistPublished: 1200,
      missing: 12,
      queued: 40,
      dueRecheck: 3,
      acceptedAwaitingResults: 17,
      acceptedMissing: 0,
      lastSeenAt: "2026-08-29T09:00:00.000Z",
      ...catalog,
    },
    archive: { events: 480, eventsWithStandings: 420, eventsWithDecklists: 310, decks: 2600 },
    counts: { new: 30, accepted: 8, dismissed: 4 },
    runs: [],
    schedules: { "meta.uvsgames_sync": true, "meta.uvsgames_recheck": true },
    ...overrides,
  };
}

function failedRun(startedAt: string): MetaSyncStatus["runs"][number] {
  return {
    id: `run-${startedAt}`,
    kind: "meta.uvsgames_recheck",
    trigger: "cron",
    status: "failed",
    startedAt,
    finishedAt: startedAt,
    durationMs: 100,
    errorMessage: "Upstream returned 503",
    result: null,
  };
}

function partialRun(
  startedAt: string,
  result: Record<string, unknown>,
): MetaSyncStatus["runs"][number] {
  return {
    id: `run-${startedAt}`,
    kind: "meta.uvsgames_sync",
    trigger: "cron",
    status: "succeeded",
    startedAt,
    finishedAt: startedAt,
    durationMs: 100,
    errorMessage: null,
    result,
  };
}

function alertIds(status: MetaSyncStatus, unresolved = 0): string[] {
  return metaSyncAlerts(status, unresolved, NOW).map((alert) => alert.id);
}

describe("metaSyncAlerts", () => {
  it("stays quiet on a sync that is keeping up", () => {
    expect(alertIds(syncStatus())).toEqual([]);
  });

  it("raises a mirror no crawl has reached in over a week", () => {
    expect(alertIds(syncStatus({ lastSeenAt: "2026-08-19T00:00:00.000Z" }))).toContain(
      "stale-crawl",
    );
  });

  it("keeps quiet about staleness where no cron is registered at all", () => {
    const status = syncStatus(
      { lastSeenAt: null },
      { schedules: { "meta.uvsgames_recheck": false } },
    );
    expect(alertIds(status)).toEqual([]);
  });

  it("counts only the failures from the last day", () => {
    const runs = [failedRun("2026-08-29T06:00:00.000Z"), failedRun("2026-08-20T06:00:00.000Z")];
    const alerts = metaSyncAlerts(syncStatus({}, { runs }), 0, NOW);
    expect(alerts.find((alert) => alert.id === "failed-runs")?.message).toBe(
      "1 sync run failed in the last 24 hours.",
    );
  });

  it("heals a failure once a newer run of the same kind succeeds", () => {
    const success = {
      ...partialRun("2026-08-29T08:00:00.000Z", { complete: true }),
      kind: "meta.uvsgames_recheck",
    };
    const runs = [success, failedRun("2026-08-29T06:00:00.000Z")];
    expect(alertIds(syncStatus({}, { runs }))).not.toContain("failed-runs");
  });

  it("keeps alerting while the only newer success is another kind", () => {
    const runs = [
      partialRun("2026-08-29T08:00:00.000Z", { complete: true }),
      failedRun("2026-08-29T06:00:00.000Z"),
    ];
    expect(alertIds(syncStatus({}, { runs }))).toContain("failed-runs");
  });

  it("heals a partial crawl only once a complete run of the same kind lands", () => {
    const partial = partialRun("2026-08-29T06:00:00.000Z", { complete: false, skipped: 1 });
    const another = partialRun("2026-08-29T08:00:00.000Z", { complete: false, skipped: 2 });
    const full = partialRun("2026-08-29T10:00:00.000Z", { complete: true });

    expect(alertIds(syncStatus({}, { runs: [another, partial] }))).toContain("partial-crawls");
    expect(alertIds(syncStatus({}, { runs: [full, another, partial] }))).not.toContain(
      "partial-crawls",
    );
  });

  it("raises a crawl that succeeded without covering its window", () => {
    const runs = [partialRun("2026-08-29T06:00:00.000Z", { complete: false, skipped: 1 })];
    expect(alertIds(syncStatus({}, { runs }))).toContain("partial-crawls");
  });

  it("stays quiet about a crawl the maintainer cancelled on purpose", () => {
    const runs = [
      partialRun("2026-08-29T06:00:00.000Z", { complete: false, cancelRequested: true }),
    ];
    expect(alertIds(syncStatus({}, { runs }))).not.toContain("partial-crawls");
  });

  it("raises rechecks only once they outgrow a single batch", () => {
    expect(alertIds(syncStatus({ dueRecheck: 40 }))).not.toContain("due-rechecks");
    expect(alertIds(syncStatus({ dueRecheck: 41 }))).toContain("due-rechecks");
  });

  it("sends the events that vanished from the source to exactly those rows", () => {
    const alerts = metaSyncAlerts(syncStatus({ acceptedMissing: 2 }), 0, NOW);
    expect(alerts.find((alert) => alert.id === "accepted-missing")).toEqual({
      id: "accepted-missing",
      message: "2 events live on /meta have disappeared from the source listing.",
      target: "catalogue-accepted-missing",
    });
  });

  it("leaves the overdue rechecks on the unfiltered accepted rows", () => {
    const alerts = metaSyncAlerts(syncStatus({ dueRecheck: 60 }), 0, NOW);
    expect(alerts.find((alert) => alert.id === "due-rechecks")?.target).toBe("catalogue-accepted");
  });

  it("sends unmatched card names to the review queue", () => {
    const alerts = metaSyncAlerts(syncStatus(), 5, NOW);
    expect(alerts.find((alert) => alert.id === "unresolved-cards")).toEqual({
      id: "unresolved-cards",
      message: "5 card names across staged decks match no live card.",
      target: "review",
    });
  });
});

describe("overlayCountsForProvider", () => {
  function overlay(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
    return {
      id: "overlay-1",
      kind: "player",
      status: "pending",
      provider: "uvsgames",
      sourceEventExternalId: "evt-1",
      sourcePlayerExternalId: "evt-1-p1",
      metaEventPlayerId: "row-1",
      metaEventId: "event-1",
      metaEventName: "Summoner Skirmish",
      proposedName: null,
      playerName: "Ashe Main",
      submittedBy: null,
      submissionNote: null,
      changes: [],
      cards: [],
      unresolvedNames: [],
      createdAt: "2026-08-20T00:00:00.000Z",
      ...overrides,
    };
  }

  it("counts nothing on an empty queue", () => {
    expect(overlayCountsForProvider([], "uvsgames")).toEqual({
      pendingReview: 0,
      unresolvedCards: 0,
    });
  });

  it("drops the other source's rows, so the two tabs stop reporting one number", () => {
    const rows = [
      overlay({ id: "a" }),
      overlay({ id: "b", provider: "playloltcg", unresolvedNames: ["X"] }),
    ];

    expect(overlayCountsForProvider(rows, "uvsgames")).toEqual({
      pendingReview: 1,
      unresolvedCards: 0,
    });
    expect(overlayCountsForProvider(rows, "playloltcg")).toEqual({
      pendingReview: 1,
      unresolvedCards: 1,
    });
  });

  it("counts a person's overlay on both tabs, since it names no source", () => {
    const rows = [overlay({ id: "c", provider: null, unresolvedNames: ["X", "Y"] })];

    expect(overlayCountsForProvider(rows, "uvsgames")).toEqual({
      pendingReview: 1,
      unresolvedCards: 2,
    });
    expect(overlayCountsForProvider(rows, "playloltcg")).toEqual({
      pendingReview: 1,
      unresolvedCards: 2,
    });
  });

  it("sums the unmatched names across the rows it keeps", () => {
    const rows = [
      overlay({ id: "a", unresolvedNames: ["X", "Y"] }),
      overlay({ id: "b", unresolvedNames: ["Z"] }),
    ];

    expect(overlayCountsForProvider(rows, "uvsgames").unresolvedCards).toBe(3);
  });
});
