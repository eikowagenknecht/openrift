import { afterEach, describe, expect, it } from "bun:test";

import { fetchJson } from "./fetch";

// ---------------------------------------------------------------------------
// fetchJson
// ---------------------------------------------------------------------------

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed JSON body and null lastModified when no header", async () => {
    globalThis.fetch = (async () =>
      Response.json({ hello: "world" }, { status: 200 })) as unknown as typeof fetch;

    const result = await fetchJson<{ hello: string }>("https://example.com/api");
    expect(result.data).toEqual({ hello: "world" });
    expect(result.lastModified).toBeNull();
  });

  it("parses Last-Modified header into a Date", async () => {
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

  it("throws on non-OK response (404)", async () => {
    globalThis.fetch = (async () =>
      new Response("Not Found", { status: 404 })) as unknown as typeof fetch;

    await expect(fetchJson("https://example.com/missing")).rejects.toThrow("HTTP 404");
  });

  it("throws on non-OK response (500)", async () => {
    globalThis.fetch = (async () =>
      new Response("Internal Server Error", { status: 500 })) as unknown as typeof fetch;

    await expect(fetchJson("https://example.com/error")).rejects.toThrow("HTTP 500");
  });

  it("includes URL in error message", async () => {
    globalThis.fetch = (async () =>
      new Response("Gone", { status: 410 })) as unknown as typeof fetch;

    await expect(fetchJson("https://example.com/gone")).rejects.toThrow("https://example.com/gone");
  });

  it("includes response body text in error message", async () => {
    globalThis.fetch = (async () =>
      new Response("custom error body", { status: 502 })) as unknown as typeof fetch;

    await expect(fetchJson("https://example.com/bad")).rejects.toThrow("custom error body");
  });

  it("returns null lastModified when Last-Modified header is absent", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { data: 123 },
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const result = await fetchJson<{ data: number }>("https://example.com/api");
    expect(result.lastModified).toBeNull();
    expect(result.data).toEqual({ data: 123 });
  });

  it("passes a signal option to fetch for timeout", async () => {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return Response.json({ ok: true }, { status: 200 });
    }) as unknown as typeof fetch;

    await fetchJson("https://example.com/api");
    expect(capturedInit?.signal).toBeDefined();
  });
});
