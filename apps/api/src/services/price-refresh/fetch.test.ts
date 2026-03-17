import { describe, expect, it } from "bun:test";

import type { Fetch } from "../../io";
import { fetchJson } from "./fetch";

// ---------------------------------------------------------------------------
// fetchJson
// ---------------------------------------------------------------------------

describe("fetchJson", () => {
  it("returns parsed JSON body and null lastModified when no header", async () => {
    const mockFetch: Fetch = async () => Response.json({ hello: "world" }, { status: 200 });

    const result = await fetchJson<{ hello: string }>(mockFetch, "https://example.com/api");
    expect(result.data).toEqual({ hello: "world" });
    expect(result.lastModified).toBeNull();
  });

  it("parses Last-Modified header into a Date", async () => {
    const mockFetch: Fetch = async () =>
      Response.json(
        { ok: true },
        {
          status: 200,
          headers: { "Last-Modified": "Wed, 01 Jan 2025 00:00:00 GMT" },
        },
      );

    const result = await fetchJson(mockFetch, "https://example.com/api");
    expect(result.lastModified).toBeInstanceOf(Date);
    expect(result.lastModified?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("throws on non-OK response (404)", async () => {
    const mockFetch: Fetch = async () => new Response("Not Found", { status: 404 });

    await expect(fetchJson(mockFetch, "https://example.com/missing")).rejects.toThrow("HTTP 404");
  });

  it("throws on non-OK response (500)", async () => {
    const mockFetch: Fetch = async () => new Response("Internal Server Error", { status: 500 });

    await expect(fetchJson(mockFetch, "https://example.com/error")).rejects.toThrow("HTTP 500");
  });

  it("includes URL in error message", async () => {
    const mockFetch: Fetch = async () => new Response("Gone", { status: 410 });

    await expect(fetchJson(mockFetch, "https://example.com/gone")).rejects.toThrow(
      "https://example.com/gone",
    );
  });

  it("includes response body text in error message", async () => {
    const mockFetch: Fetch = async () => new Response("custom error body", { status: 502 });

    await expect(fetchJson(mockFetch, "https://example.com/bad")).rejects.toThrow(
      "custom error body",
    );
  });

  it("returns null lastModified when Last-Modified header is absent", async () => {
    const mockFetch: Fetch = async () =>
      Response.json(
        { data: 123 },
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const result = await fetchJson<{ data: number }>(mockFetch, "https://example.com/api");
    expect(result.lastModified).toBeNull();
    expect(result.data).toEqual({ data: 123 });
  });

  it("passes a signal option to fetch for timeout", async () => {
    let capturedInit: RequestInit | undefined;
    const mockFetch: Fetch = async (_url, init?) => {
      capturedInit = init;
      return Response.json({ ok: true }, { status: 200 });
    };

    await fetchJson(mockFetch, "https://example.com/api");
    expect(capturedInit?.signal).toBeDefined();
  });
});
