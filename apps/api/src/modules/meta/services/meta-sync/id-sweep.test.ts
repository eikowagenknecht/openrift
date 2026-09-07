import { createLogger } from "@openrift/shared/logger";
import { describe, expect, it } from "vitest";

import type { Repos, Transact } from "../../../../deps.js";
import type {
  UvsgamesIdProbeInput,
  UvsgamesUpsertInput,
} from "../../repositories/uvsgames-events.js";
import type { MetaSyncDeps } from "./deps.js";
import { isIdSweepNoop, sweepEventIds } from "./id-sweep.js";
import type { UvsClient, UvsQuery } from "./uvsgames-client.js";
import { UvsHttpError } from "./uvsgames-client.js";

const NOW = new Date("2026-09-03T12:00:00Z");

function detail(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    game: 3,
    game_type: "RIFTBOUND",
    name: `Event ${id}`,
    start_datetime: "2025-12-06T15:30:00+00:00",
    display_status: "complete",
    event_status: "UNLISTED",
    gameplay_format: { name: "Constructed" },
    ...over,
  };
}

type FakeSource = Record<number, Record<string, unknown> | "absent" | "error">;

function fakeClient(source: FakeSource): { client: UvsClient; asked: number[] } {
  const asked: number[] = [];
  let count = 0;
  const client: UvsClient = {
    get: <T>(path: string) => {
      const id = Number(/\/events\/(?<id>\d+)\//u.exec(path)?.groups?.id);
      asked.push(id);
      count++;
      const row = source[id];
      if (row === undefined || row === "absent") {
        return Promise.reject(new UvsHttpError(404, path, "Not found"));
      }
      if (row === "error") {
        return Promise.reject(new UvsHttpError(503, path, "Service unavailable"));
      }
      return Promise.resolve(row as T);
    },
    page: <T>(_path: string, _query: UvsQuery, _page: number) =>
      Promise.reject(new Error("the sweep never pages")) as Promise<T>,
    get requests() {
      return count;
    },
  };
  return { client, asked };
}

interface FakeStore {
  deps: MetaSyncDeps;
  upserted: UvsgamesUpsertInput[];
  probes: UvsgamesIdProbeInput[];
  candidateCalls: { fromId: number; toId: number; limit: number }[];
  stored: { value: unknown };
}

function fakeDeps(
  client: UvsClient,
  known: number[],
  bounds: { fromId: number; toId: number } | null,
): FakeStore {
  const upserted: UvsgamesUpsertInput[] = [];
  const probes: UvsgamesIdProbeInput[] = [];
  const candidateCalls: { fromId: number; toId: number; limit: number }[] = [];
  const stored: { value: unknown } = { value: null };
  const mirrored = new Set(known);

  const uvsgamesEvents = {
    sweepBounds: () => Promise.resolve(bounds ?? undefined),
    sweepCandidates: (fromId: number, toId: number, limit: number) => {
      candidateCalls.push({ fromId, toId, limit });
      const probed = new Set(probes.map((probe) => probe.externalId));
      const out: number[] = [];
      for (let id = fromId; id <= toId && out.length < limit; id++) {
        if (!mirrored.has(id) && !probed.has(id)) {
          out.push(id);
        }
      }
      return Promise.resolve(out);
    },
    sweepRemaining: () => Promise.resolve(0),
    recordProbes: (rows: readonly UvsgamesIdProbeInput[]) => {
      probes.push(...rows);
      return Promise.resolve();
    },
    upsertBatch: (rows: readonly UvsgamesUpsertInput[]) => {
      upserted.push(...rows);
      for (const row of rows) {
        mirrored.add(Number(row.externalId));
      }
      return Promise.resolve({
        inserted: rows.map((row) => row.externalId),
        changed: [],
        unchanged: [],
      });
    },
    settings: () =>
      Promise.resolve({
        autoAcceptMinPlayers: null,
        autoAcceptNotable: false,
        autoAcceptOfficial: false,
        updatedAt: NOW,
      }),
  };

  const jobRuns = {
    getResult: () => Promise.resolve(stored.value),
    mergeResult: (_runId: string, patch: object) => {
      const previous = (stored.value ?? {}) as Record<string, unknown>;
      stored.value = {
        ...previous,
        ...patch,
        ...(previous.cancelRequested === true ? { cancelRequested: true } : {}),
      };
      return Promise.resolve();
    },
  };

  const deps: MetaSyncDeps = {
    repos: { uvsgamesEvents, jobRuns } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no writes here"))) as unknown as Transact,
    client,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, upserted, probes, candidateCalls, stored };
}

describe("sweepEventIds", () => {
  it("mirrors an unlisted event of this game and remembers every other id", async () => {
    const { client, asked } = fakeClient({
      1: detail(1),
      2: detail(2, { game: 1, game_type: "LORCANA" }),
      3: "absent",
    });
    const { deps, upserted, probes } = fakeDeps(client, [], { fromId: 1, toId: 3 });

    const result = await sweepEventIds(deps, undefined, {});

    expect(asked).toEqual([1, 2, 3]);
    expect(upserted.map((row) => row.externalId)).toEqual(["1"]);
    expect(probes).toEqual([
      { externalId: 2, outcome: "other_game", gameType: "LORCANA" },
      { externalId: 3, outcome: "absent", gameType: null },
    ]);
    expect(result.found).toBe(1);
    expect(result.otherGame).toBe(1);
    expect(result.absent).toBe(1);
    expect(result.range).toBe("1..3");
    expect(result.complete).toBe(true);
  });

  it("never asks about an id the mirror already holds", async () => {
    const { client, asked } = fakeClient({ 1: detail(1), 2: detail(2), 3: detail(3) });
    const { deps } = fakeDeps(client, [1, 3], { fromId: 1, toId: 3 });

    await sweepEventIds(deps, undefined, {});

    expect(asked).toEqual([2]);
  });

  it("stops at the probe budget and says so", async () => {
    const source: FakeSource = {};
    for (let id = 1; id <= 10; id++) {
      source[id] = detail(id);
    }
    const { client, asked } = fakeClient(source);
    const { deps } = fakeDeps(client, [], { fromId: 1, toId: 10 });

    const result = await sweepEventIds(deps, undefined, { maxProbes: 4 });

    expect(asked).toEqual([1, 2, 3, 4]);
    expect(result.probed).toBe(4);
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("Stopped at the 4-probe budget");
  });

  it("leaves an errored id undecided so the next run retries it", async () => {
    const { client } = fakeClient({ 1: "error", 2: detail(2) });
    const { deps, probes } = fakeDeps(client, [], { fromId: 1, toId: 2 });

    const result = await sweepEventIds(deps, undefined, {});

    expect(probes.map((probe) => probe.externalId)).toEqual([]);
    expect(result.failed).toBe(1);
    expect(result.found).toBe(1);
    expect(result.complete).toBe(false);
  });

  it("gives up on a source that is down instead of spending the slice on it", async () => {
    const source: FakeSource = {};
    for (let id = 1; id <= 200; id++) {
      source[id] = "error";
    }
    const { client, asked } = fakeClient(source);
    const { deps } = fakeDeps(client, [], { fromId: 1, toId: 200 });

    const result = await sweepEventIds(deps, undefined, {});

    expect(asked.length).toBe(20);
    expect(result.errors).toContain("Stopped after 20 probes failed in a row");
  });

  it("keeps going when a failure is followed by an answer", async () => {
    const source: FakeSource = { 1: "error" };
    for (let id = 2; id <= 30; id++) {
      source[id] = detail(id);
    }
    const { client, asked } = fakeClient(source);
    const { deps } = fakeDeps(client, [], { fromId: 1, toId: 30 });

    const result = await sweepEventIds(deps, undefined, {});

    expect(asked.length).toBe(30);
    expect(result.failed).toBe(1);
    expect(result.found).toBe(29);
  });

  it("remembers an id of this game whose row cannot be projected", async () => {
    const { client } = fakeClient({ 1: detail(1, { start_datetime: null }) });
    const { deps, upserted, probes } = fakeDeps(client, [], { fromId: 1, toId: 1 });

    const result = await sweepEventIds(deps, undefined, {});

    expect(upserted).toEqual([]);
    expect(probes).toEqual([{ externalId: 1, outcome: "unreadable", gameType: "RIFTBOUND" }]);
    expect(result.unreadable).toBe(1);
  });

  it("reads the game id when the source names no game type", async () => {
    const { client } = fakeClient({
      1: detail(1, { game_type: null }),
      2: detail(2, { game: 1, game_type: null }),
    });
    const { deps, upserted, probes } = fakeDeps(client, [], { fromId: 1, toId: 2 });

    await sweepEventIds(deps, undefined, {});

    expect(upserted.map((row) => row.externalId)).toEqual(["1"]);
    expect(probes).toEqual([{ externalId: 2, outcome: "other_game", gameType: null }]);
  });

  it("walks the given window instead of the mirror's span", async () => {
    const { client, asked } = fakeClient({ 7: detail(7), 8: detail(8) });
    const { deps, candidateCalls } = fakeDeps(client, [], { fromId: 1, toId: 100 });

    await sweepEventIds(deps, undefined, { fromId: 7, toId: 8 });

    expect(candidateCalls[0]).toMatchObject({ fromId: 7, toId: 8 });
    expect(asked).toEqual([7, 8]);
  });

  it("stops when the admin cancels and keeps what it decided", async () => {
    const source: FakeSource = {};
    for (let id = 1; id <= 400; id++) {
      source[id] = detail(id);
    }
    const { client, asked } = fakeClient(source);
    const { deps, stored } = fakeDeps(client, [], { fromId: 1, toId: 400 });
    stored.value = { cancelRequested: true };

    const result = await sweepEventIds(deps, "run-1", {});

    expect(result.cancelRequested).toBe(true);
    expect(result.complete).toBe(false);
    expect(asked.length).toBe(100);
    expect(result.found).toBe(100);
  });

  it("reports nothing to do when the mirror is empty and no window is given", async () => {
    const { client, asked } = fakeClient({});
    const { deps } = fakeDeps(client, [], null);

    const result = await sweepEventIds(deps, undefined, {});

    expect(asked).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("No id range to sweep");
  });
});

describe("isIdSweepNoop", () => {
  it("is a noop only when nothing was probed and nothing failed", async () => {
    const { client } = fakeClient({ 1: detail(1) });
    const probed = await sweepEventIds(fakeDeps(client, [], { fromId: 1, toId: 1 }).deps);
    expect(isIdSweepNoop(probed)).toBe(false);

    const idle = await sweepEventIds(fakeDeps(client, [1], { fromId: 1, toId: 1 }).deps);
    expect(isIdSweepNoop(idle)).toBe(true);
  });
});
