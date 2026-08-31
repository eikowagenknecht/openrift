import { createLogger } from "@openrift/shared/logger";
import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { deepFetchEvent } from "./deep-fetch.js";
import type { MetaSyncDeps } from "./deps.js";
import { processRechecks, RECHECK_BATCH_SIZE } from "./recheck.js";
import type { UvsClient } from "./uvsgames-client.js";

vi.mock("./deep-fetch.js", () => ({
  deepFetchEvent: vi.fn(() =>
    Promise.resolve({
      externalId: "4821",
      requests: 0,
      players: 0,
      decks: 0,
      dropped: 0,
      acceptedPlayers: 0,
      skippedPlayers: 0,
      errors: [],
    }),
  ),
}));

const NOW = new Date("2026-08-20T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
/** When an earlier pass completed this event's results fetch. */
const FETCHED_AT = new Date("2026-08-19T18:00:00Z");

function dueRow(overrides: Partial<UvsgamesListRow> = {}): UvsgamesListRow {
  return {
    externalId: "4821",
    name: "MTC Regional",
    startAt: new Date("2026-08-25T09:00:00Z"),
    endAtEstimate: null,
    displayStatus: "upcoming",
    decklistStatus: null,
    playerCount: 64,
    eventType: "LOCALS",
    eventFormat: "CONSTRUCTED",
    storeId: null,
    storeName: null,
    storeDisplayName: null,
    location: null,
    timezone: "UTC",
    eventConfigurationTemplate: null,
    contentHash: "hash",
    resultsFetchedAt: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    nextCheckAt: NOW,
    checkStage: 0,
    triage: "accepted",
    metaEventId: "live-1",
    metaEventSlug: "mtc-regional",
    ...overrides,
  };
}

interface RecheckWrite {
  externalId: string;
  nextCheckAt: Date | null;
  checkStage: number;
}

function fakeDeps(options: {
  due: UvsgamesListRow[];
  detail: (externalId: string) => unknown;
  /** Standings this event's mirror already holds. */
  mirroredStandings?: Record<string, unknown>[];
  /** Deck ids the mirror still owes. */
  outstandingDecks?: string[];
  /** Live standings, for the promotion-lag check. */
  livePlayers?: Record<string, unknown>[];
  source?: { metaEventId: string };
  /** The run row the pass reads its Stop flag back out of. */
  stored?: Record<string, unknown>;
  /** Template ids an admin is watching, which earn the quarter-hourly poll. */
  watchedTemplates?: string[];
}): { deps: MetaSyncDeps; writes: RecheckWrite[]; progress: unknown[] } {
  const writes: RecheckWrite[] = [];

  const client: UvsClient = {
    get: <T>(path: string) => {
      const externalId = path.split("/").at(-2) ?? "";
      const body = options.detail(externalId);
      return body instanceof Error ? Promise.reject(body) : Promise.resolve(body as T);
    },
    page: () => Promise.reject(new Error("the recheck reads details, not pages")),
    requests: 0,
  };

  const uvsgamesEvents = {
    dueForRecheck: () => Promise.resolve(options.due),
    watchedTemplates: () =>
      Promise.resolve(
        new Map<string, string | null>((options.watchedTemplates ?? []).map((id) => [id, null])),
      ),
    upsertBatch: () => Promise.resolve({ inserted: [], changed: [], unchanged: [] }),
    setRecheck: (externalId: string, values: Omit<RecheckWrite, "externalId">) => {
      writes.push({ externalId, ...values });
      return Promise.resolve();
    },
    formatMappings: () => Promise.resolve(new Map<string, string>()),
  };

  // Every "have we got this yet" the ladder asks is a mirror query now.
  const uvsgamesResults = {
    standings: () => Promise.resolve(options.mirroredStandings ?? []),
    deckCoverage: () => Promise.resolve({ outstanding: options.outstandingDecks ?? [], held: 0 }),
  };

  const meta = {
    sourceByKey: () => Promise.resolve(options.source ?? { metaEventId: "live-1" }),
    rawStandingsForEvent: () => Promise.resolve(options.livePlayers ?? []),
  };

  const progress: unknown[] = [];
  const stored: Record<string, unknown> = { ...options.stored };
  const jobRuns = {
    getResult: () => Promise.resolve(stored),
    mergeResult: (_runId: string, patch: object) => {
      const cancelled = stored.cancelRequested === true;
      Object.assign(stored, patch, cancelled ? { cancelRequested: true } : {});
      progress.push(structuredClone(stored));
      return Promise.resolve();
    },
  };

  const deps: MetaSyncDeps = {
    repos: { uvsgamesEvents, uvsgamesResults, meta, jobRuns } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no writes here"))) as unknown as Transact,
    client,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, writes, progress };
}

function detailRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 4821,
    name: "MTC Regional",
    start_datetime: "2026-08-25T09:00:00Z",
    display_status: "upcoming",
    event_format: "CONSTRUCTED",
    ...overrides,
  };
}

describe("processRechecks", () => {
  it("waits for the start time of an event that has not begun, without fetching", async () => {
    const { deps, writes } = fakeDeps({ due: [dueRow()], detail: () => detailRow() });

    const result = await processRechecks(deps);

    expect(result).toMatchObject({ due: 1, processed: 1, fetched: 0 });
    expect(writes).toEqual([
      {
        externalId: "4821",
        nextCheckAt: new Date("2026-08-25T09:00:00Z"),
        checkStage: 0,
      },
    ]);
  });

  it("polls hourly once the event is under way", async () => {
    const { deps, writes } = fakeDeps({
      due: [dueRow({ displayStatus: "inProgress" })],
      detail: () =>
        detailRow({ display_status: "inProgress", start_datetime: "2026-08-20T09:00:00Z" }),
    });

    const result = await processRechecks(deps);

    expect(result.fetched).toBe(0);
    expect(writes[0].nextCheckAt?.getTime()).toBe(NOW.getTime() + HOUR_MS);
  });

  it("polls a watched template every quarter hour while its event runs", async () => {
    const { deps, writes } = fakeDeps({
      due: [dueRow({ displayStatus: "inProgress", eventConfigurationTemplate: "tpl-live" })],
      detail: () =>
        detailRow({
          display_status: "inProgress",
          start_datetime: "2026-08-20T09:00:00Z",
          event_configuration_template: "tpl-live",
        }),
      watchedTemplates: ["tpl-live"],
    });

    await processRechecks(deps);

    expect(writes[0].nextCheckAt?.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);
  });

  it("gives a failing source an hour's grace without advancing the ladder", async () => {
    const { deps, writes } = fakeDeps({
      due: [dueRow({ checkStage: 3 })],
      detail: () => new Error("HTTP 503"),
    });

    const result = await processRechecks(deps);

    expect(result.processed).toBe(0);
    expect(result.errors[0]).toContain("HTTP 503");
    expect(writes).toEqual([
      { externalId: "4821", nextCheckAt: new Date(NOW.getTime() + HOUR_MS), checkStage: 3 },
    ]);
  });

  it("treats a detail row it cannot read the same way", async () => {
    const { deps, writes } = fakeDeps({ due: [dueRow()], detail: () => ({ nonsense: true }) });

    const result = await processRechecks(deps);

    expect(result.processed).toBe(0);
    expect(result.errors[0]).toContain("no readable projection");
    expect(writes[0].nextCheckAt?.getTime()).toBe(NOW.getTime() + HOUR_MS);
  });

  it("pulls results again while the live rows lag the mirror", async () => {
    const { deps } = fakeDeps({
      due: [dueRow({ displayStatus: "complete", checkStage: 2, resultsFetchedAt: FETCHED_AT })],
      detail: () =>
        detailRow({ display_status: "complete", start_datetime: "2026-08-19T09:00:00Z" }),
      // Two mirrored standings, one live row: promotion has work left.
      mirroredStandings: [{ registrationId: "reg-1" }, { registrationId: "reg-2" }],
      livePlayers: [{ id: "row-1" }],
    });

    const result = await processRechecks(deps);

    expect(result.fetched).toBe(1);
    expect(vi.mocked(deepFetchEvent)).toHaveBeenCalled();
  });

  it("does not refetch an event whose live rows already match its mirror", async () => {
    const { deps } = fakeDeps({
      due: [dueRow({ displayStatus: "complete", checkStage: 2, resultsFetchedAt: FETCHED_AT })],
      detail: () =>
        detailRow({ display_status: "complete", start_datetime: "2026-08-19T09:00:00Z" }),
      // Promotion has caught up: one mirrored standing, one live row.
      mirroredStandings: [{ registrationId: "reg-1" }],
      livePlayers: [{ id: "row-1" }],
    });

    const result = await processRechecks(deps);

    expect(result.fetched).toBe(0);
  });

  it("stops revisiting a completed event whose field was empty, once it has been fetched", async () => {
    const { deps } = fakeDeps({
      due: [dueRow({ displayStatus: "complete", checkStage: 2, resultsFetchedAt: FETCHED_AT })],
      detail: () =>
        detailRow({ display_status: "complete", start_datetime: "2026-08-19T09:00:00Z" }),
      // A cancelled event: the fetch completed and mirrored nobody. Reading
      // "fetched" off the row count would revisit it to the end of the ladder.
      mirroredStandings: [],
    });

    const result = await processRechecks(deps);

    expect(result.fetched).toBe(0);
  });

  it("pulls the results of a completed event nothing has fetched yet", async () => {
    const { deps } = fakeDeps({
      due: [dueRow({ displayStatus: "complete", checkStage: 2 })],
      detail: () =>
        detailRow({ display_status: "complete", start_datetime: "2026-08-19T09:00:00Z" }),
      mirroredStandings: [],
    });

    const result = await processRechecks(deps);

    expect(result.fetched).toBe(1);
  });

  it("reports an empty queue as a no-op run", async () => {
    const { deps, writes } = fakeDeps({ due: [], detail: () => detailRow() });

    const result = await processRechecks(deps);

    expect(result).toMatchObject({ due: 0, processed: 0, fetched: 0 });
    expect(writes).toEqual([]);
  });

  it("writes running totals after each visited row when given a run id", async () => {
    const { deps, progress } = fakeDeps({
      due: [dueRow(), dueRow({ externalId: "4822" })],
      detail: () => detailRow(),
    });

    await processRechecks(deps, RECHECK_BATCH_SIZE, "run-1");

    expect(progress).toHaveLength(2);
    expect(progress[0]).toMatchObject({ due: 2, processed: 1 });
    expect(progress[1]).toMatchObject({ due: 2, processed: 2 });
  });

  it("stops after the row it was on once the run is asked to", async () => {
    const { deps, writes } = fakeDeps({
      due: [dueRow(), dueRow({ externalId: "4822" }), dueRow({ externalId: "4823" })],
      detail: () => detailRow(),
      stored: { cancelRequested: true },
    });

    const result = await processRechecks(deps, RECHECK_BATCH_SIZE, "run-1");

    expect(result.cancelRequested).toBe(true);
    expect(result.processed).toBe(1);
    expect(writes.map((write) => write.externalId)).toEqual(["4821"]);
    expect(result.errors).toEqual(["Cancelled from the admin panel"]);
  });

  it("keeps going for a run nobody asked to stop", async () => {
    const { deps } = fakeDeps({
      due: [dueRow(), dueRow({ externalId: "4822" })],
      detail: () => detailRow(),
      stored: { cancelRequested: false },
    });

    const result = await processRechecks(deps, RECHECK_BATCH_SIZE, "run-1");

    expect(result).toMatchObject({ processed: 2, cancelRequested: false });
  });

  it("writes no progress without a run id", async () => {
    const { deps, progress } = fakeDeps({ due: [dueRow()], detail: () => detailRow() });

    await processRechecks(deps);

    expect(progress).toEqual([]);
  });
});
