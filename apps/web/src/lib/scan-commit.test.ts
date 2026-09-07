import { describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";

import { addInChunks, addJobsFor, settleAdd } from "./scan-commit";

describe("addJobsFor", () => {
  it("emits one job per copy, in list order", () => {
    resetIdCounter();
    const jobs = addJobsFor([
      { printing: stubPrinting({ id: "p1" }), count: 2 },
      { printing: stubPrinting({ id: "p2" }), count: 1 },
    ]);

    expect(jobs).toEqual([{ printingId: "p1" }, { printingId: "p1" }, { printingId: "p2" }]);
  });

  it("skips rows with nothing to add", () => {
    expect(addJobsFor([{ printing: stubPrinting({ id: "p1" }), count: 0 }])).toEqual([]);
  });
});

describe("addInChunks", () => {
  it("splits a list past the contract cap into sequential requests", async () => {
    const jobs = addJobsFor([{ printing: stubPrinting({ id: "p1" }), count: 1200 }]);
    const inFlight: number[] = [];
    let open = 0;

    const outcomes = await addInChunks(jobs, (printingId) => {
      open += 1;
      return Promise.resolve({ id: printingId }).finally(() => {
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

    const outcomes = await addInChunks(jobs, (printingId) => Promise.resolve({ id: printingId }));
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
    const jobs = [{ printingId: "p1" }, { printingId: "p1" }, { printingId: "p2" }];
    const result = settleAdd(jobs, [fulfilled("c1"), fulfilled("c2"), fulfilled("c3")]);

    expect([...result.confirmed]).toEqual([
      ["p1", 2],
      ["p2", 1],
    ]);
    expect(result.copyIds).toEqual(["c1", "c2", "c3"]);
    expect(result.failed).toBe(0);
  });

  it("counts rejections and leaves them out of the confirmed counts", () => {
    const jobs = [{ printingId: "p1" }, { printingId: "p1" }, { printingId: "p2" }];
    const result = settleAdd(jobs, [fulfilled("c1"), rejected, rejected]);

    expect([...result.confirmed]).toEqual([["p1", 1]]);
    expect(result.copyIds).toEqual(["c1"]);
    expect(result.failed).toBe(2);
  });

  it("treats a resolved value with no copy id as a failure", () => {
    const jobs = [{ printingId: "p1" }, { printingId: "p2" }];
    const result = settleAdd(jobs, [
      fulfilled("c1"),
      { status: "fulfilled", value: undefined as unknown as { id: string } },
    ]);

    expect(result.failed).toBe(1);
    expect(result.copyIds).toEqual(["c1"]);
  });

  it("treats a missing outcome as a failure", () => {
    const result = settleAdd([{ printingId: "p1" }, { printingId: "p2" }], [fulfilled("c1")]);

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
