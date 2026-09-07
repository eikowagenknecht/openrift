import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import { createDbContext } from "../../../test/integration-context.js";
import { jobRunsRepo } from "./job-runs.js";

const ctx = createDbContext("a0000000-0101-4000-a000-000000000001");

describe.skipIf(!ctx)("jobRunsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = jobRunsRepo(db);

  async function begin(kind: string, trigger: "cron" | "admin" = "cron"): Promise<{ id: string }> {
    const started = await repo.start({ kind, trigger });
    if (started === null) {
      throw new Error(`expected to claim a run for ${kind}`);
    }
    return started;
  }

  afterEach(async () => {
    await db.deleteFrom("jobRuns").execute();
  });

  it("start writes a running row", async () => {
    const { id } = await begin("test.kind", "cron");
    const rows = await repo.listRecent({ kind: "test.kind" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.status).toBe("running");
    expect(rows[0]?.trigger).toBe("cron");
    expect(rows[0]?.finishedAt).toBeNull();
  });

  it("start refuses a second concurrent run of the same kind", async () => {
    const first = await begin("test.kind");
    expect(await repo.start({ kind: "test.kind", trigger: "admin" })).toBeNull();
    expect(await repo.start({ kind: "other.kind", trigger: "cron" })).not.toBeNull();
    await repo.succeed(first.id, { durationMs: 1 });
    expect(await repo.start({ kind: "test.kind", trigger: "cron" })).not.toBeNull();
  });

  it("succeed updates status to succeeded and stores result JSONB", async () => {
    const { id } = await begin("test.kind", "admin");
    await repo.succeed(id, { durationMs: 1234, result: { transformed: 42 } });
    const rows = await repo.listRecent({ kind: "test.kind" });
    expect(rows[0]?.status).toBe("succeeded");
    expect(rows[0]?.durationMs).toBe(1234);
    expect(rows[0]?.finishedAt).toBeInstanceOf(Date);
    expect(rows[0]?.result).toEqual({ transformed: 42 });
  });

  it("fail updates status to failed and stores error message", async () => {
    const { id } = await begin("test.kind", "admin");
    await repo.fail(id, { durationMs: 500, errorMessage: "upstream 502" });
    const rows = await repo.listRecent({ kind: "test.kind" });
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.errorMessage).toBe("upstream 502");
    expect(rows[0]?.durationMs).toBe(500);
  });

  it("findRunning returns the running row for a kind", async () => {
    const { id } = await begin("test.kind", "cron");
    const running = await repo.findRunning("test.kind");
    expect(running?.id).toBe(id);

    await repo.succeed(id, { durationMs: 1 });
    expect(await repo.findRunning("test.kind")).toBeNull();
  });

  it("getLatestPerKind returns one row per distinct kind (the most recent)", async () => {
    const a1 = await begin("kind.a");
    await repo.succeed(a1.id, { durationMs: 1 });
    const a2 = await begin("kind.a");
    await repo.succeed(a2.id, { durationMs: 2 });
    const b1 = await begin("kind.b");
    await repo.succeed(b1.id, { durationMs: 3 });

    const latest = await repo.getLatestPerKind();
    expect(latest["kind.a"]?.id).toBe(a2.id);
    expect(latest["kind.b"]?.id).toBe(b1.id);
  });

  it("sweepOrphaned marks running rows as failed and returns count", async () => {
    await begin("test.kind", "cron");
    await begin("other.kind", "admin");
    const swept = await repo.sweepOrphaned();
    expect(swept).toBe(2);
    const rows = await repo.listRecent({});
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "failed")).toBe(true);
    expect(rows.every((r) => r.errorMessage === "server restarted during run")).toBe(true);
    expect(rows.every((r) => r.finishedAt instanceof Date)).toBe(true);
    expect(rows.every((r) => (r.durationMs ?? -1) >= 0)).toBe(true);
  });

  it("updateResult overwrites only the result column without changing status", async () => {
    const { id } = await begin("test.kind", "admin");
    await repo.updateResult(id, { processed: 5, total: 10 });
    const firstRows = await repo.listRecent({ kind: "test.kind" });
    expect(firstRows[0]?.status).toBe("running");
    expect(firstRows[0]?.finishedAt).toBeNull();
    expect(firstRows[0]?.result).toEqual({ processed: 5, total: 10 });

    await repo.updateResult(id, { processed: 10, total: 10 });
    const secondRows = await repo.listRecent({ kind: "test.kind" });
    expect(secondRows[0]?.result).toEqual({ processed: 10, total: 10 });
  });

  it("mergeResult keeps the keys the patch does not name", async () => {
    const { id } = await begin("test.kind", "admin");
    await repo.updateResult(id, { due: 40, processed: 3 });

    await repo.mergeResult(id, { phase: "decks", decksFetched: 25 });

    expect(await repo.getResult(id)).toEqual({
      due: 40,
      processed: 3,
      phase: "decks",
      decksFetched: 25,
    });
  });

  it("mergeResult starts from an empty object when the run has no result yet", async () => {
    const { id } = await begin("test.kind", "admin");

    await repo.mergeResult(id, { processed: 1 });

    expect(await repo.getResult(id)).toEqual({ processed: 1 });
  });

  it("requestCancel sets the flag without reading the row, and a heartbeat cannot undo it", async () => {
    const { id } = await begin("test.kind", "admin");
    await repo.updateResult(id, { processed: 3, cancelRequested: false });

    await repo.requestCancel(id);
    await repo.mergeResult(id, { processed: 4, cancelRequested: false });

    expect(await repo.getResult(id)).toEqual({ processed: 4, cancelRequested: true });
  });

  it("getResult returns the parsed JSONB or null", async () => {
    const { id } = await begin("test.kind", "admin");
    expect(await repo.getResult(id)).toBeNull();
    await repo.updateResult(id, { foo: "bar" });
    expect(await repo.getResult(id)).toEqual({ foo: "bar" });
    expect(await repo.getResult("00000000-0000-4000-a000-000000000000")).toBeNull();
  });

  it("findLatestForResume returns the most recent run with a non-null result", async () => {
    expect(await repo.findLatestForResume("test.kind")).toBeNull();
    const a = await begin("test.kind");
    await repo.fail(a.id, { durationMs: 100, errorMessage: "boom" });
    const b = await begin("test.kind", "admin");
    await repo.succeed(b.id, { durationMs: 200, result: { ok: true } });
    const latest = await repo.findLatestForResume("test.kind");
    expect(latest?.id).toBe(b.id);
    expect(latest?.status).toBe("succeeded");
  });

  it("findLatestForResume skips later runs whose result is null", async () => {
    // A failure that never wrote a checkpoint must not shadow the watermark
    // from an earlier partially-progressed run.
    const old = await begin("test.kind");
    await repo.updateResult(old.id, { lastPostedDate: "2026-04-17" });
    await repo.fail(old.id, { durationMs: 100, errorMessage: "boom" });
    const fresh = await begin("test.kind", "admin");
    await repo.fail(fresh.id, { durationMs: 50, errorMessage: "first post 400'd" });
    const latest = await repo.findLatestForResume("test.kind");
    expect(latest?.id).toBe(old.id);
    expect(latest?.result).toEqual({ lastPostedDate: "2026-04-17" });
  });

  it("stores a result as a real jsonb object and reads it back on every path", async () => {
    // `jsonb_typeof` is asserted directly because a round trip alone cannot
    // tell a real jsonb object apart from a double-encoded string scalar.
    const result = { processed: 5, total: 10, errors: ["a", "b"] };
    const { id } = await begin("test.kind", "admin");
    await repo.updateResult(id, result);

    const stored = await sql<{
      type: string;
    }>`SELECT jsonb_typeof(result) AS type FROM job_runs WHERE id = ${id}`.execute(db);
    expect(stored.rows[0]?.type).toBe("object");

    expect(await repo.getResult(id)).toEqual(result);
    const list = await repo.listRecent({ kind: "test.kind" });
    expect(list[0]?.result).toEqual(result);
    const latest = await repo.findLatestForResume("test.kind");
    expect(latest?.result).toEqual(result);
    const perKind = await repo.getLatestPerKind();
    expect(perKind["test.kind"]?.result).toEqual(result);
  });

  it("listPage returns a page of rows plus the total matching count", async () => {
    for (let index = 0; index < 5; index++) {
      const { id } = await begin("page.kind");
      await repo.succeed(id, { durationMs: index });
    }

    const firstPage = await repo.listPage({ limit: 2, offset: 0 });
    expect(firstPage.total).toBe(5);
    expect(firstPage.rows).toHaveLength(2);

    const secondPage = await repo.listPage({ limit: 2, offset: 2 });
    expect(secondPage.rows).toHaveLength(2);

    const lastPage = await repo.listPage({ limit: 2, offset: 4 });
    expect(lastPage.rows).toHaveLength(1);

    const ids = [...firstPage.rows, ...secondPage.rows, ...lastPage.rows].map((row) => row.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("listPage counts only rows matching the filters", async () => {
    const cron = await begin("kind.x");
    await repo.succeed(cron.id, { durationMs: 1 });
    const admin = await begin("kind.x", "admin");
    await repo.fail(admin.id, { durationMs: 2, errorMessage: "boom" });
    const other = await begin("kind.y");
    await repo.succeed(other.id, { durationMs: 3 });

    const byKind = await repo.listPage({ kind: "kind.x", limit: 10, offset: 0 });
    expect(byKind.total).toBe(2);
    const byTrigger = await repo.listPage({ trigger: "admin", limit: 10, offset: 0 });
    expect(byTrigger.total).toBe(1);
    const byStatus = await repo.listPage({ status: "failed", limit: 10, offset: 0 });
    expect(byStatus.total).toBe(1);
    const combined = await repo.listPage({
      kind: "kind.x",
      status: "succeeded",
      limit: 10,
      offset: 0,
    });
    expect(combined.total).toBe(1);
    expect(combined.rows[0]?.id).toBe(cron.id);
  });

  it("listPage takes a kind prefix literally, wildcards and all", async () => {
    const sync = await begin("meta.uvsgames_sync");
    await repo.succeed(sync.id, { durationMs: 1 });
    const recheck = await begin("meta.uvsgames_recheck");
    await repo.succeed(recheck.id, { durationMs: 2 });
    const other = await begin("meta.playloltcg_sync");
    await repo.succeed(other.id, { durationMs: 3 });
    const lookalike = await begin("meta.uvsgamesXsync");
    await repo.succeed(lookalike.id, { durationMs: 4 });

    const family = await repo.listPage({ kindPrefix: "meta.uvsgames_", limit: 10, offset: 0 });
    expect(family.total).toBe(2);
    expect(family.rows.map((row) => row.kind).toSorted()).toEqual([
      "meta.uvsgames_recheck",
      "meta.uvsgames_sync",
    ]);
  });

  it("listKinds returns distinct kinds sorted alphabetically", async () => {
    const b1 = await begin("kind.b");
    await repo.succeed(b1.id, { durationMs: 1 });
    await begin("kind.a");
    await begin("kind.b", "admin");
    expect(await repo.listKinds()).toEqual(["kind.a", "kind.b"]);
  });

  it("purgeOlderThan deletes rows whose started_at is before the cutoff", async () => {
    const { id } = await begin("test.kind");
    await db
      .updateTable("jobRuns")
      .set({ startedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) })
      .where("id", "=", id)
      .execute();

    const deleted = await repo.purgeOlderThan(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    expect(deleted).toBe(1);
    const rows = await repo.listRecent({ kind: "test.kind" });
    expect(rows).toHaveLength(0);
  });
});
