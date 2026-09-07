import { describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";

import type { ScanAddJob } from "./scan-commit";
import { addInChunks, addJobsFor, reconcileJobs, settleAdd } from "./scan-commit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const jobsFor = (printingIds: string[]): ScanAddJob[] =>
  printingIds.map((printingId, index) => ({ id: `job-${index}`, printingId }));

describe("addJobsFor", () => {
  it("emits one job per copy, in list order", () => {
    resetIdCounter();
    const jobs = addJobsFor([
      { printing: stubPrinting({ id: "p1" }), count: 2 },
      { printing: stubPrinting({ id: "p2" }), count: 1 },
    ]);

    expect(jobs.map((job) => job.printingId)).toEqual(["p1", "p1", "p2"]);
  });

  it("mints a distinct uuid per job so the server can dedupe a replay", () => {
    const jobs = addJobsFor([{ printing: stubPrinting({ id: "p1" }), count: 3 }]);

    expect(jobs.every((job) => UUID.test(job.id))).toBe(true);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(3);
  });

  it("skips rows with nothing to add", () => {
    expect(addJobsFor([{ printing: stubPrinting({ id: "p1" }), count: 0 }])).toEqual([]);
  });
});

describe("reconcileJobs", () => {
  const p1 = stubPrinting({ id: "p1" });
  const p2 = stubPrinting({ id: "p2" });

  it("replays the same ids when the list has not moved", () => {
    const pending = [
      { id: "job-1", printingId: "p1" },
      { id: "job-2", printingId: "p1" },
      { id: "job-3", printingId: "p2" },
    ];

    expect(
      reconcileJobs(pending, [
        { printing: p1, count: 2 },
        { printing: p2, count: 1 },
      ]),
    ).toEqual(pending);
  });

  it("mints an id for a copy scanned since the failed add", () => {
    const jobs = reconcileJobs([{ id: "job-1", printingId: "p1" }], [{ printing: p1, count: 3 }]);

    expect(jobs.map((job) => job.printingId)).toEqual(["p1", "p1", "p1"]);
    expect(jobs[0].id).toBe("job-1");
    expect(jobs[1].id).not.toBe(jobs[2].id);
    expect(UUID.test(jobs[1].id)).toBe(true);
    expect(UUID.test(jobs[2].id)).toBe(true);
  });

  it("drops the surplus ids when the count fell", () => {
    const jobs = reconcileJobs(
      [
        { id: "job-1", printingId: "p1" },
        { id: "job-2", printingId: "p1" },
        { id: "job-3", printingId: "p1" },
      ],
      [{ printing: p1, count: 1 }],
    );

    expect(jobs).toEqual([{ id: "job-1", printingId: "p1" }]);
  });

  it("drops the ids of a printing that left the list", () => {
    const jobs = reconcileJobs(
      [
        { id: "job-1", printingId: "p1" },
        { id: "job-2", printingId: "p2" },
      ],
      [{ printing: p2, count: 1 }],
    );

    expect(jobs).toEqual([{ id: "job-2", printingId: "p2" }]);
  });

  it("mints every id when nothing was pending for the list", () => {
    const jobs = reconcileJobs([], [{ printing: p1, count: 2 }]);

    expect(jobs.every((job) => UUID.test(job.id))).toBe(true);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(2);
  });
});

describe("addInChunks", () => {
  it("hands each job's minted id to the caller, so a retry can reuse it", async () => {
    const jobs = addJobsFor([{ printing: stubPrinting({ id: "p1" }), count: 2 }]);
    const seen: ScanAddJob[] = [];

    await addInChunks(jobs, (job) => {
      seen.push(job);
      return Promise.resolve({ id: job.id });
    });

    expect(seen).toEqual(jobs);
  });

  it("splits a list past the contract cap into sequential requests", async () => {
    const jobs = addJobsFor([{ printing: stubPrinting({ id: "p1" }), count: 1200 }]);
    const inFlight: number[] = [];
    let open = 0;

    const outcomes = await addInChunks(jobs, (job) => {
      open += 1;
      return Promise.resolve({ id: job.id }).finally(() => {
        inFlight.push(open);
        open -= 1;
      });
    });

    expect(outcomes).toHaveLength(1200);
    expect(Math.max(...inFlight)).toBe(500);
  });

  it("keeps the outcomes aligned with the jobs across chunk boundaries", async () => {
    const jobs = addJobsFor([
      { printing: stubPrinting({ id: "p1" }), count: 500 },
      { printing: stubPrinting({ id: "p2" }), count: 2 },
    ]);

    const outcomes = await addInChunks(jobs, (job) => Promise.resolve({ id: job.id }));
    const settled = settleAdd(jobs, outcomes);

    expect([...settled.confirmed]).toEqual([
      ["p1", 500],
      ["p2", 2],
    ]);
    expect(settled.failed).toBe(0);
  });

  it("settles a rejected chunk instead of throwing, and still runs the next one", async () => {
    const jobs = addJobsFor([{ printing: stubPrinting({ id: "p1" }), count: 501 }]);
    let call = 0;

    const outcomes = await addInChunks(jobs, () => {
      call += 1;
      return call <= 500 ? Promise.reject(new Error("nope")) : Promise.resolve({ id: "c1" });
    });

    expect(settleAdd(jobs, outcomes).failed).toBe(500);
    expect(settleAdd(jobs, outcomes).copyIds).toEqual(["c1"]);
  });

  it("makes no request for an empty job list", async () => {
    let calls = 0;
    const outcomes = await addInChunks([], () => {
      calls += 1;
      return Promise.resolve({ id: "c1" });
    });

    expect(outcomes).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("settleAdd", () => {
  const fulfilled = (id: string): PromiseSettledResult<{ id: string }> => ({
    status: "fulfilled",
    value: { id },
  });
  const rejected: PromiseSettledResult<{ id: string }> = {
    status: "rejected",
    reason: new Error("nope"),
  };

  it("groups confirmed copies by printing and collects their ids", () => {
    const jobs = jobsFor(["p1", "p1", "p2"]);
    const result = settleAdd(jobs, [fulfilled("c1"), fulfilled("c2"), fulfilled("c3")]);

    expect([...result.confirmed]).toEqual([
      ["p1", 2],
      ["p2", 1],
    ]);
    expect(result.copyIds).toEqual(["c1", "c2", "c3"]);
    expect(result.failed).toBe(0);
  });

  it("counts a replayed job whose row already existed as confirmed", () => {
    const jobs = jobsFor(["p1", "p2"]);
    const result = settleAdd(jobs, [fulfilled(jobs[0].id), fulfilled(jobs[1].id)]);

    expect([...result.confirmed]).toEqual([
      ["p1", 1],
      ["p2", 1],
    ]);
    expect(result.copyIds).toEqual([jobs[0].id, jobs[1].id]);
    expect(result.failed).toBe(0);
  });

  it("counts rejections and leaves them out of the confirmed counts", () => {
    const jobs = jobsFor(["p1", "p1", "p2"]);
    const result = settleAdd(jobs, [fulfilled("c1"), rejected, rejected]);

    expect([...result.confirmed]).toEqual([["p1", 1]]);
    expect(result.copyIds).toEqual(["c1"]);
    expect(result.failed).toBe(2);
  });

  it("treats a resolved value with no copy id as a failure", () => {
    const jobs = jobsFor(["p1", "p2"]);
    const result = settleAdd(jobs, [
      fulfilled("c1"),
      { status: "fulfilled", value: undefined as unknown as { id: string } },
    ]);

    expect(result.failed).toBe(1);
    expect(result.copyIds).toEqual(["c1"]);
  });

  it("treats a missing outcome as a failure", () => {
    const result = settleAdd(jobsFor(["p1", "p2"]), [fulfilled("c1")]);

    expect(result.failed).toBe(1);
    expect([...result.confirmed]).toEqual([["p1", 1]]);
  });

  it("confirms nothing for an empty job list", () => {
    const result = settleAdd([], []);

    expect(result.confirmed.size).toBe(0);
    expect(result.copyIds).toEqual([]);
    expect(result.failed).toBe(0);
  });
});
