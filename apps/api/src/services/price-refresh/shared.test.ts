import { afterEach, describe, expect, it } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import { toCents } from "@openrift/shared/utils";

import { cmProductUrl } from "./cardmarket";
import { fetchJson } from "./fetch";
import { logUpsertCounts } from "./log";
import type { UpsertCounts } from "./types";
import { BATCH_SIZE } from "./upsert";

// ---------------------------------------------------------------------------
// BATCH_SIZE
// ---------------------------------------------------------------------------

describe("BATCH_SIZE", () => {
  it("is 200", () => {
    expect(BATCH_SIZE).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// toCents
// ---------------------------------------------------------------------------

describe("toCents", () => {
  it("returns null for null", () => {
    expect(toCents(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- testing the undefined path explicitly
    const val = undefined;
    expect(toCents(val)).toBeNull();
  });

  it("returns null for 0", () => {
    expect(toCents(0)).toBeNull();
  });

  it("converts dollars to cents", () => {
    expect(toCents(1.5)).toBe(150);
  });

  it("converts exact dollars", () => {
    expect(toCents(5)).toBe(500);
  });

  it("rounds to nearest cent", () => {
    expect(toCents(1.995)).toBe(200);
  });

  it("handles large amounts", () => {
    expect(toCents(999.99)).toBe(99_999);
  });
});

// ---------------------------------------------------------------------------
// cmProductUrl
// ---------------------------------------------------------------------------

describe("cmProductUrl", () => {
  it("builds correct URL", () => {
    expect(cmProductUrl(12_345)).toBe(
      "https://www.cardmarket.com/en/Riftbound/Products?idProduct=12345",
    );
  });

  it("works with small IDs", () => {
    expect(cmProductUrl(1)).toBe("https://www.cardmarket.com/en/Riftbound/Products?idProduct=1");
  });
});

// ---------------------------------------------------------------------------
// logUpsertCounts
// ---------------------------------------------------------------------------

function makeMockLogger(): { log: Logger; messages: string[] } {
  const messages: string[] = [];
  const log = {
    info: (msg: string) => messages.push(msg),
  } as unknown as Logger;
  return { log, messages };
}

describe("logUpsertCounts", () => {
  it("logs non-zero inserted counts", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 20, new: 10, updated: 0, unchanged: 10 },
      staging: { total: 15, new: 3, updated: 0, unchanged: 12 },
    };
    logUpsertCounts(log, counts);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain("10 snapshots");
    expect(messages[0]).toContain("3 staged");
  });

  it("logs non-zero updated counts", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 20, new: 0, updated: 5, unchanged: 15 },
      staging: { total: 15, new: 0, updated: 2, unchanged: 13 },
    };
    logUpsertCounts(log, counts);
    expect(messages[1]).toContain("5 snapshots");
    expect(messages[1]).toContain("2 staged");
  });

  it("logs non-zero unchanged counts", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 20, new: 0, updated: 0, unchanged: 20 },
      staging: { total: 15, new: 0, updated: 0, unchanged: 15 },
    };
    logUpsertCounts(log, counts);
    expect(messages[2]).toContain("20 snapshots");
    expect(messages[2]).toContain("15 staged");
  });

  it("logs dash when all counts are zero", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 0, new: 0, updated: 0, unchanged: 0 },
      staging: { total: 0, new: 0, updated: 0, unchanged: 0 },
    };
    logUpsertCounts(log, counts);
    expect(messages[0]).toContain("\u2014");
    expect(messages[1]).toContain("\u2014");
    expect(messages[2]).toContain("\u2014");
  });

  it("mixes present and absent categories", () => {
    const { log, messages } = makeMockLogger();
    const counts: UpsertCounts = {
      snapshots: { total: 5, new: 5, updated: 0, unchanged: 0 },
      staging: { total: 0, new: 0, updated: 0, unchanged: 0 },
    };
    logUpsertCounts(log, counts);
    expect(messages[0]).toContain("5 snapshots");
    expect(messages[0]).not.toContain("staged");
  });
});

// ---------------------------------------------------------------------------
// fetchJson
// ---------------------------------------------------------------------------

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed JSON and null lastModified when no header", async () => {
    globalThis.fetch = (async () =>
      Response.json({ hello: "world" }, { status: 200 })) as unknown as typeof fetch;

    const result = await fetchJson<{ hello: string }>("https://example.com/api");
    expect(result.data).toEqual({ hello: "world" });
    expect(result.lastModified).toBeNull();
  });

  it("parses Last-Modified header into Date", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { ok: true },
        {
          status: 200,
          headers: { "Last-Modified": "Wed, 01 Jan 2025 00:00:00 GMT" },
        },
      )) as unknown as typeof fetch;

    const result = await fetchJson("https://example.com/api");
    expect(result.lastModified).toBeInstanceOf(Date);
    expect(result.lastModified?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = (async () =>
      new Response("Not Found", { status: 404 })) as unknown as typeof fetch;

    await expect(fetchJson("https://example.com/missing")).rejects.toThrow("HTTP 404");
  });
});
