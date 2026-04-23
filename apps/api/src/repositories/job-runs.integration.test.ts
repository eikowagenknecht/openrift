import { afterEach, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { jobRunsRepo } from "./job-runs.js";

const ctx = createDbContext("a0000000-0101-4000-a000-000000000001");

describe.skipIf(!ctx)("jobRunsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = jobRunsRepo(db);

  afterEach(async () => {
    await db.deleteFrom("jobRuns").execute();
  });

  it("start writes a running row", async () => {
    const { id } = await repo.start({ kind: "test.kind", trigger: "cron" });
    const rows = await repo.listRecent({ kind: "test.kind" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.status).toBe("running");
    expect(rows[0]?.trigger).toBe("cron");
    expect(rows[0]?.finishedAt).toBeNull();
  });

  it("succeed updates status to succeeded and stores result JSONB", async () => {
    const { id } = await repo.start({ kind: "test.kind", trigger: "admin" });
    await repo.succeed(id, { durationMs: 1234, result: { transformed: 42 } });
    const rows = await repo.listRecent({ kind: "test.kind" });
    expect(rows[0]?.status).toBe("succeeded");
    expect(rows[0]?.durationMs).toBe(1234);
    expect(rows[0]?.finishedAt).toBeInstanceOf(Date);
    expect(rows[0]?.result).toEqual({ transformed: 42 });
  });

  it("fail updates status to failed and stores error message", async () => {
    const { id } = await repo.start({ kind: "test.kind", trigger: "admin" });
    await repo.fail(id, { durationMs: 500, errorMessage: "upstream 502" });
    const rows = await repo.listRecent({ kind: "test.kind" });
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.errorMessage).toBe("upstream 502");
    expect(rows[0]?.durationMs).toBe(500);
  });

  it("findRunning returns the latest running row for a kind", async () => {
    const { id } = await repo.start({ kind: "test.kind", trigger: "cron" });
    const running = await repo.findRunning("test.kind");
    expect(running?.id).toBe(id);

    await repo.succeed(id, { durationMs: 1 });
    expect(await repo.findRunning("test.kind")).toBeNull();
  });

  it("getLatestPerKind returns one row per distinct kind (the most recent)", async () => {
    const a1 = await repo.start({ kind: "kind.a", trigger: "cron" });
    await repo.succeed(a1.id, { durationMs: 1 });
    const a2 = await repo.start({ kind: "kind.a", trigger: "cron" });
    await repo.succeed(a2.id, { durationMs: 2 });
    const b1 = await repo.start({ kind: "kind.b", trigger: "cron" });
    await repo.succeed(b1.id, { durationMs: 3 });

    const latest = await repo.getLatestPerKind();
    expect(latest["kind.a"]?.id).toBe(a2.id);
    expect(latest["kind.b"]?.id).toBe(b1.id);
  });

  it("sweepOrphaned marks running rows as failed and returns count", async () => {
    await repo.start({ kind: "test.kind", trigger: "cron" });
    await repo.start({ kind: "test.kind", trigger: "admin" });
    const swept = await repo.sweepOrphaned();
    expect(swept).toBe(2);
    const rows = await repo.listRecent({ kind: "test.kind" });
    expect(rows.every((r) => r.status === "failed")).toBe(true);
    expect(rows.every((r) => r.errorMessage === "server restarted during run")).toBe(true);
  });

  it("purgeOlderThan deletes rows whose started_at is before the cutoff", async () => {
    const { id } = await repo.start({ kind: "test.kind", trigger: "cron" });
    // Backdate the row so the cutoff catches it
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
