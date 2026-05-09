import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { fetchApi, fetchApiJson } from "./fetch-api";

function mockResponse(
  body: string,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  const { ok = true, status = 200, statusText = "OK" } = init;
  return {
    ok,
    status,
    statusText,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as Response;
}

describe("fetchApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the response when res.ok", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchApi({ errorTitle: "Couldn't load", path: "/api/v1/x" });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the cookie header when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchApi({ errorTitle: "Couldn't load", path: "/api/v1/x", cookie: "session=abc" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ cookie: "session=abc" });
  });

  it("serializes a JSON body and sets content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchApi({
      errorTitle: "Couldn't create",
      path: "/api/v1/x",
      method: "POST",
      body: { name: "A" },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ name: "A" }));
  });

  it("throws a title/details structured error on !res.ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse("Not found", { ok: false, status: 404, statusText: "Not Found" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchApi({
        errorTitle: "Couldn't delete collection",
        path: "/api/v1/collections/1",
        method: "DELETE",
      }),
    ).rejects.toThrow(/^Couldn't delete collection\n---\nDELETE .+ → 404 Not Found\nNot found$/u);
  });

  it("logs the failure details to console.error on !res.ok", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse("boom", { ok: false, status: 500, statusText: "Server Error" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchApi({ errorTitle: "Couldn't do thing", path: "/api/v1/x", method: "POST" }),
    ).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      "[Couldn't do thing]",
      expect.objectContaining({ status: 500, body: "boom", method: "POST" }),
    );
  });

  it("returns non-ok responses without logging or throwing when the status is accepted", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse("{}", { ok: false, status: 403, statusText: "Forbidden" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchApi({
      errorTitle: "Couldn't check admin access",
      path: "/api/v1/admin/me",
      acceptStatuses: [401, 403],
    });

    expect(res.status).toBe(403);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("still throws for non-ok statuses not in acceptStatuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse("boom", { ok: false, status: 500, statusText: "Server Error" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchApi({
        errorTitle: "Couldn't check admin access",
        path: "/api/v1/admin/me",
        acceptStatuses: [401, 403],
      }),
    ).rejects.toThrow(/500 Server Error/u);
  });

  it("falls back to '<no body>' when the response body cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const badResponse = {
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => {
        throw new Error("stream closed");
      },
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValueOnce(badResponse);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi({ errorTitle: "Couldn't load", path: "/api/v1/x" })).rejects.toThrow(
      /<no body>$/u,
    );
  });
});

describe("fetchApi traceparent injection", () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    trace.setGlobalTracerProvider(provider);
    context.setGlobalContextManager(contextManager.enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  });

  afterAll(async () => {
    contextManager.disable();
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    exporter.reset();
  });

  it("injects a W3C traceparent when called inside an active span", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "{}",
      json: async () => ({}),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("parent", async (span) => {
      try {
        await fetchApi({ errorTitle: "Couldn't load", path: "/api/v1/x" });
      } finally {
        span.end();
      }
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-/u);
  });

  it("does not set traceparent when no span is active", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "{}",
      json: async () => ({}),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await fetchApi({ errorTitle: "Couldn't load", path: "/api/v1/x" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.traceparent).toBeUndefined();
  });
});

describe("fetchApiJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the JSON body on success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse(JSON.stringify({ n: 1 })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchApiJson<{ n: number }>({
      errorTitle: "Couldn't load",
      path: "/api/v1/x",
    });

    expect(result).toEqual({ n: 1 });
  });
});
