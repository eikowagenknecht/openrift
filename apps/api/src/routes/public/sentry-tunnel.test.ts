import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sentryTunnelRoute } from "./sentry-tunnel.js";

const mockFetch = vi.fn();

const ALLOWED_DSN = "https://abc123@o123.ingest.de.sentry.io/456";
const EXPECTED_INGEST = "https://o123.ingest.de.sentry.io/api/456/envelope/";

function buildApp(sentryDsnSsr: string) {
  return new Hono()
    .use("*", async (c, next) => {
      c.set("io", { fetch: mockFetch } as never);
      c.set("config", { sentryDsnSsr } as never);
      await next();
    })
    .route("/api/v1", sentryTunnelRoute);
}

function envelope(dsn: string): string {
  return [
    JSON.stringify({ dsn, event_id: "abc", sent_at: "2026-04-30T00:00:00Z" }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({ message: "hello" }),
  ].join("\n");
}

describe("POST /api/v1/sentry-tunnel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("forwards the raw body to the ingest URL derived from the envelope DSN", async () => {
    mockFetch.mockResolvedValue(new Response('{"id":"abc"}', { status: 200 }));
    const app = buildApp(ALLOWED_DSN);
    const body = envelope(ALLOWED_DSN);

    const res = await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body,
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(EXPECTED_INGEST);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/x-sentry-envelope",
    );
    const forwardedBody = await new Response(init.body as BodyInit).text();
    expect(forwardedBody).toBe(body);
  });

  it("preserves Content-Encoding when the SDK sends a gzipped envelope", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const app = buildApp(ALLOWED_DSN);

    await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "content-encoding": "gzip",
      },
      body: envelope(ALLOWED_DSN),
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["content-encoding"]).toBe("gzip");
  });

  it("rejects envelopes whose DSN host doesn't match", async () => {
    const app = buildApp(ALLOWED_DSN);

    const res = await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      body: envelope("https://abc@evil.example.com/456"),
    });

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects envelopes whose project id doesn't match", async () => {
    const app = buildApp(ALLOWED_DSN);

    const res = await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      body: envelope("https://abc@o123.ingest.de.sentry.io/999"),
    });

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects bodies without a newline-terminated header", async () => {
    const app = buildApp(ALLOWED_DSN);

    const res = await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      body: "not-an-envelope",
    });

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects headers without a dsn field", async () => {
    const app = buildApp(ALLOWED_DSN);

    const res = await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      body: `${JSON.stringify({ event_id: "abc" })}\n{}`,
    });

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 503 when SENTRY_DSN_SSR is not configured", async () => {
    const app = buildApp("");

    const res = await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      body: envelope(ALLOWED_DSN),
    });

    expect(res.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 413 when the envelope exceeds the size cap", async () => {
    const app = buildApp(ALLOWED_DSN);
    const oversized = "x".repeat(1_000_001);

    const res = await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      body: oversized,
    });

    expect(res.status).toBe(413);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 404 for non-POST methods", async () => {
    const app = buildApp(ALLOWED_DSN);

    const res = await app.request("/api/v1/sentry-tunnel", { method: "GET" });

    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("propagates upstream status codes (e.g. 429 from Sentry)", async () => {
    mockFetch.mockResolvedValue(new Response("rate limited", { status: 429 }));
    const app = buildApp(ALLOWED_DSN);

    const res = await app.request("/api/v1/sentry-tunnel", {
      method: "POST",
      body: envelope(ALLOWED_DSN),
    });

    expect(res.status).toBe(429);
  });
});
