import { describe, expect, it } from "vitest";

import { jobRunsSearchSchema } from "./admin-job-runs-search";

describe("jobRunsSearchSchema", () => {
  it("accepts an untouched tab as an empty search", () => {
    expect(jobRunsSearchSchema.parse({})).toEqual({});
  });

  it("ignores the unprefixed status the cards tab owns", () => {
    expect(jobRunsSearchSchema.parse({ status: "failed" })).toEqual({});
  });

  it("coerces the page number out of the URL string", () => {
    expect(jobRunsSearchSchema.parse({ page: "2" }).page).toBe(2);
  });

  it("rejects a page below one", () => {
    expect(jobRunsSearchSchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("rejects a fractional page", () => {
    expect(jobRunsSearchSchema.safeParse({ page: "2.5" }).success).toBe(false);
  });

  it("accepts every trigger", () => {
    for (const runTrigger of ["cron", "admin", "api"]) {
      expect(jobRunsSearchSchema.parse({ runTrigger }).runTrigger).toBe(runTrigger);
    }
  });

  it("rejects an unknown trigger", () => {
    expect(jobRunsSearchSchema.safeParse({ runTrigger: "manual" }).success).toBe(false);
  });

  it("accepts every status", () => {
    for (const runStatus of ["running", "succeeded", "failed"]) {
      expect(jobRunsSearchSchema.parse({ runStatus }).runStatus).toBe(runStatus);
    }
  });

  it("rejects an unknown status", () => {
    expect(jobRunsSearchSchema.safeParse({ runStatus: "pending" }).success).toBe(false);
  });

  it("accepts every activity", () => {
    for (const runActivity of ["did-work", "noop"]) {
      expect(jobRunsSearchSchema.parse({ runActivity }).runActivity).toBe(runActivity);
    }
  });

  it("rejects an unknown activity", () => {
    expect(jobRunsSearchSchema.safeParse({ runActivity: "skipped" }).success).toBe(false);
  });

  it("passes the kind and prefix through untouched", () => {
    expect(jobRunsSearchSchema.parse({ runKind: "price-refresh", runPrefix: "price" })).toEqual({
      runKind: "price-refresh",
      runPrefix: "price",
    });
  });
});
