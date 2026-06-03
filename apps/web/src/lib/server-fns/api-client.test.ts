import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ClientResponse } from "hono/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { callApi, callApiJson, encodeParams, serverApiClient } from "./api-client";
import { isApiError } from "./api-error";

// Minimal stand-in for Hono's ClientResponse — only the members callApi reads.
function clientResponse(
  body: string,
  init: { ok?: boolean; status?: number; statusText?: string; url?: string } = {},
) {
  const {
    ok = true,
    status = 200,
    statusText = "OK",
    url = "http://localhost:3000/api/v1/x",
  } = init;
  return {
    ok,
    status,
    statusText,
    url,
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
  } as unknown as ClientResponse<unknown>;
}

describe("callApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the response when res.ok", async () => {
    const res = await callApi(Promise.resolve(clientResponse("{}")), "Couldn't load");
    expect(res.ok).toBe(true);
  });

  it("throws an ApiError with the server message + code on a JSON envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await callApi(
      Promise.resolve(
        clientResponse('{"error":"Channel not found","code":"NOT_FOUND"}', {
          ok: false,
          status: 404,
          statusText: "Not Found",
          url: "http://localhost:3000/api/v1/admin/distribution-channels/x",
        }),
      ),
      "Couldn't delete distribution channel",
    ).catch((error: unknown) => error);

    if (!isApiError(err)) {
      throw new Error("expected an ApiError");
    }
    expect(err.message).toBe("Channel not found"); // server message wins, not errorTitle
    expect(err.code).toBe("NOT_FOUND");
    // The diagnostic (console-only) carries the url, status and raw envelope body.
    expect(err.diagnostic).toContain("/api/v1/admin/distribution-channels/x → 404 Not Found");
    expect(err.diagnostic).toContain('"error":"Channel not found"');
  });

  it("falls back to errorTitle when the body is not a JSON envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await callApi(
      Promise.resolve(
        clientResponse("<html>oops</html>", {
          ok: false,
          status: 500,
          statusText: "Server Error",
        }),
      ),
      "Couldn't do thing",
    ).catch((error: unknown) => error);

    if (!isApiError(err)) {
      throw new Error("expected an ApiError");
    }
    expect(err.message).toBe("Couldn't do thing");
    expect(err.code).toBeUndefined();
    expect(err.diagnostic).toContain("<html>oops</html>");
  });

  it("logs the failure details to console.error on !res.ok", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      callApi(
        Promise.resolve(
          clientResponse("boom", { ok: false, status: 500, statusText: "Server Error" }),
        ),
        "Couldn't do thing",
      ),
    ).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      "[Couldn't do thing]",
      expect.objectContaining({ status: 500, body: "boom" }),
    );
  });

  it("returns non-ok responses without throwing when the status is accepted", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await callApi(
      Promise.resolve(clientResponse("{}", { ok: false, status: 403, statusText: "Forbidden" })),
      "Couldn't check admin access",
      [401, 403],
    );

    expect(res.status).toBe(403);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("still throws for non-ok statuses not in acceptStatuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await callApi(
      Promise.resolve(
        clientResponse("boom", { ok: false, status: 500, statusText: "Server Error" }),
      ),
      "Couldn't check admin access",
      [401, 403],
    ).catch((error: unknown) => error);

    if (!isApiError(err)) {
      throw new Error("expected an ApiError");
    }
    expect(err.diagnostic).toContain("500 Server Error");
  });
});

describe("callApiJson", () => {
  it("parses the JSON body on success", async () => {
    // Full generics (status + "json" format) so the inferred body type is
    // `{ n: number }`, not `unknown` — the latter would trip callApiJson's
    // bodyless-route guard, which is exactly what real hc json routes avoid.
    type JsonRes = ClientResponse<{ n: number }, 200, "json">;
    const result = await callApiJson<JsonRes>(
      Promise.resolve(clientResponse(JSON.stringify({ n: 1 })) as JsonRes),
      "Couldn't load",
    );
    expect(result).toEqual({ n: 1 });
  });
});

// Type-level regression (validated by tsgo, never executed at runtime): callApiJson
// must reject a bodyless route (only a 204 success status, so hc infers json() as
// `Promise<unknown>`) at compile time — otherwise the sweep could call it on a void
// route, erasing the type to `unknown` and crashing on `res.json()` of an empty body.
// Exported so noUnusedLocals doesn't flag the intentionally-uncalled assertion.
export async function _callApiJsonRejectsBodylessRoutes() {
  // @ts-expect-error — cache/purge is a 204 route; callers must use callApi, not callApiJson.
  await callApiJson(serverApiClient("c").api.v1.admin.cache.purge.$post(), "unused");
}

describe("encodeParams", () => {
  it("percent-encodes characters that would break a raw path segment", () => {
    expect(encodeParams({ name: "Double Strike", id: "a/b" })).toEqual({
      name: "Double%20Strike",
      id: "a%2Fb",
    });
  });

  it("passes already-safe values (UUIDs, slugs) through unchanged", () => {
    const uuid = "019d4999-4219-72f6-b7bb-64004e1b1bff";
    expect(encodeParams({ id: uuid })).toEqual({ id: uuid });
  });
});

describe("serverApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the cookie header on the request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(clientResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await serverApiClient("session=abc").api.v1.admin.cache.status.$get();

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(url).toBe("http://localhost:3000/api/v1/admin/cache/status");
    expect(init.headers.get("cookie")).toBe("session=abc");
  });

  it("omits the cookie header when no cookie is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(clientResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await serverApiClient().api.v1.admin.cache.status.$get();

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(init.headers.get("cookie")).toBeNull();
  });

  it("builds path params and query into the URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(clientResponse("", { status: 204, statusText: "No Content" }));
    vi.stubGlobal("fetch", fetchMock);

    await serverApiClient("c").api.v1.admin["distribution-channels"][":id"].$delete({
      param: { id: "abc" },
      query: { force: "true" },
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/api/v1/admin/distribution-channels/abc?force=true");
  });

  it("percent-encodes free-text path params via encodeParams (hc does not encode them)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(clientResponse("", { status: 204, statusText: "No Content" }));
    vi.stubGlobal("fetch", fetchMock);

    // A value with a space + slash would otherwise produce a literal `/a b/c`
    // segment and break the route match; encodeParams restores the old
    // fetchApi behavior of encodeURIComponent on every path param.
    await serverApiClient("c").api.v1.admin["distribution-channels"][":id"].$delete({
      param: encodeParams({ id: "a b/c" }),
      query: {},
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/api/v1/admin/distribution-channels/a%20b%2Fc?");
  });
});

describe("serverApiClient traceparent injection", () => {
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
    const fetchMock = vi.fn().mockResolvedValueOnce(clientResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const tracer = trace.getTracer("test");
    await tracer.startActiveSpan("parent", async (span) => {
      try {
        await serverApiClient("c").api.v1.admin.cache.status.$get();
      } finally {
        span.end();
      }
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(init.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-/u);
  });

  it("does not set traceparent when no span is active", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(clientResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await serverApiClient("c").api.v1.admin.cache.status.$get();

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(init.headers.get("traceparent")).toBeNull();
  });
});
