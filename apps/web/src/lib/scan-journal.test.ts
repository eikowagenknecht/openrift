import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendScanJournal,
  hasScanJournal,
  MAX_SCAN_JOURNAL_ENTRIES,
  readScanJournal,
} from "./scan-journal";

const KEY = "openrift-scan-journal";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("appendScanJournal", () => {
  it("stamps each entry with the time it was written", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    appendScanJournal({ type: "scan", printingId: "p1" });

    expect(readScanJournal()).toEqual([{ t: 1_700_000_000_000, type: "scan", printingId: "p1" }]);
  });

  it("appends in order", () => {
    appendScanJournal({ type: "scan", printingId: "p1" });
    appendScanJournal({ type: "clear", cards: 3 });

    expect(readScanJournal().map((entry) => entry.type)).toEqual(["scan", "clear"]);
  });

  it("keeps the newest entries once the ring is full", () => {
    for (let i = 0; i < MAX_SCAN_JOURNAL_ENTRIES + 10; i++) {
      appendScanJournal({ type: "add-settled", batchId: `b${i}`, confirmed: 1, failed: 0 });
    }
    const journal = readScanJournal();

    expect(journal).toHaveLength(MAX_SCAN_JOURNAL_ENTRIES);
    expect(journal[0]).toMatchObject({ batchId: "b10" });
    expect(journal.at(-1)).toMatchObject({ batchId: `b${MAX_SCAN_JOURNAL_ENTRIES + 9}` });
  });

  it("stores nothing beyond the fields it was given", () => {
    appendScanJournal({ type: "add-start", batchId: "b1", collectionId: "col-1", jobs: 4 });

    expect(Object.keys(readScanJournal()[0]!).toSorted()).toEqual([
      "batchId",
      "collectionId",
      "jobs",
      "t",
      "type",
    ]);
  });

  it("survives a storage that refuses to write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => appendScanJournal({ type: "reload-prompt" })).not.toThrow();
  });
});

describe("readScanJournal", () => {
  it("returns nothing when the device has no journal", () => {
    expect(readScanJournal()).toEqual([]);
  });

  it("returns nothing for a blob that is not JSON", () => {
    localStorage.setItem(KEY, "{not json");

    expect(readScanJournal()).toEqual([]);
  });

  it("returns nothing for a blob that is not an array", () => {
    localStorage.setItem(KEY, JSON.stringify({ type: "scan" }));

    expect(readScanJournal()).toEqual([]);
  });

  it("drops entries missing a timestamp or a type", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { t: 1, type: "scan", printingId: "p1" },
        { type: "scan", printingId: "p2" },
        { t: "soon", type: "scan" },
        "junk",
        null,
      ]),
    );

    expect(readScanJournal()).toEqual([{ t: 1, type: "scan", printingId: "p1" }]);
  });

  it("survives a storage that refuses to read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(readScanJournal()).toEqual([]);
  });
});

describe("hasScanJournal", () => {
  it("is false on a device that never scanned", () => {
    expect(hasScanJournal()).toBe(false);
  });

  it("is true once anything has been written", () => {
    appendScanJournal({ type: "scan", printingId: "p1" });

    expect(hasScanJournal()).toBe(true);
  });

  it("is false when the storage refuses to read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(hasScanJournal()).toBe(false);
  });
});

describe("a runtime with no localStorage at all", () => {
  it("reads nothing and writes nothing instead of throwing", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(readScanJournal()).toEqual([]);
    expect(hasScanJournal()).toBe(false);
    expect(() => appendScanJournal({ type: "reload-prompt" })).not.toThrow();

    vi.unstubAllGlobals();
  });
});
