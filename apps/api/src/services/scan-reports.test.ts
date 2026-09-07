import type { ScanReportJournalEntry } from "@openrift/shared/contracts/scan-reports";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { createScanReport, SCAN_REPORT_HOURLY_LIMIT } from "./scan-reports.js";

interface Inserted {
  userId: string;
  reference: string;
  note: string | null;
  userAgent: string | null;
  journal: ScanReportJournalEntry[];
}

function createMockRepos(overrides: {
  recent?: number;
  takenReferences?: string[];
  inserted?: Inserted[];
}) {
  const taken = new Set(overrides.takenReferences);
  return {
    scanReports: {
      lockUser: () => Promise.resolve(),
      countRecentByUser: () => Promise.resolve(overrides.recent ?? 0),
      referenceExists: (reference: string) => Promise.resolve(taken.has(reference)),
      insert: (values: Inserted) => {
        overrides.inserted?.push(values);
        taken.add(values.reference);
        return Promise.resolve();
      },
    },
  } as unknown as Repos;
}

function mockTransact(repos: Repos): Transact {
  return (fn) => fn(repos) as never;
}

const NOW = new Date("2026-09-07T12:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createScanReport", () => {
  it("stores the report and hands back an SC- reference", async () => {
    const inserted: Inserted[] = [];
    const repos = createMockRepos({ inserted });

    const result = await createScanReport(mockTransact(repos), {
      userId: "user-1",
      note: "the retry double-added",
      userAgent: "Firefox",
      journal: [{ t: 1, type: "scan" }],
      now: NOW,
    });

    expect(result).toEqual({ status: "ok", reference: inserted[0].reference });
    expect(inserted[0].reference).toMatch(/^SC-[A-HJ-NP-Z2-9]{4}$/u);
    expect(inserted[0].userId).toBe("user-1");
    expect(inserted[0].note).toBe("the retry double-added");
  });

  it("mints a reference free of the characters that read as each other", async () => {
    const references = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const inserted: Inserted[] = [];
      const result = await createScanReport(mockTransact(createMockRepos({ inserted })), {
        userId: "user-1",
        note: null,
        userAgent: null,
        journal: [],
        now: NOW,
      });
      if (result.status === "ok") {
        references.add(result.reference);
      }
    }

    expect([...references].every((reference) => /^SC-[A-HJ-NP-Z2-9]{4}$/u.test(reference))).toBe(
      true,
    );
    expect(references.size).toBeGreaterThan(1);
  });

  it("mints another reference when the first one is already taken", async () => {
    let call = 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      call += 1;
      (array as Uint8Array).fill(call === 1 ? 0 : 1);
      return array;
    });
    const inserted: Inserted[] = [];
    const repos = createMockRepos({ inserted, takenReferences: ["SC-AAAA"] });

    const result = await createScanReport(mockTransact(repos), {
      userId: "user-1",
      note: null,
      userAgent: null,
      journal: [],
      now: NOW,
    });

    expect(result).toEqual({ status: "ok", reference: "SC-BBBB" });
    expect(inserted[0].reference).toBe("SC-BBBB");
  });

  it("refuses once the hourly allowance is spent", async () => {
    const inserted: Inserted[] = [];
    const repos = createMockRepos({ recent: SCAN_REPORT_HOURLY_LIMIT, inserted });

    const result = await createScanReport(mockTransact(repos), {
      userId: "user-1",
      note: null,
      userAgent: null,
      journal: [],
      now: NOW,
    });

    expect(result).toEqual({ status: "rate_limited", limit: SCAN_REPORT_HOURLY_LIMIT });
    expect(inserted).toEqual([]);
  });

  it("stores an empty journal and no note", async () => {
    const inserted: Inserted[] = [];
    const repos = createMockRepos({ inserted });

    await createScanReport(mockTransact(repos), {
      userId: "user-1",
      note: null,
      userAgent: null,
      journal: [],
      now: NOW,
    });

    expect(inserted[0].journal).toEqual([]);
    expect(inserted[0].note).toBeNull();
    expect(inserted[0].userAgent).toBeNull();
  });
});
