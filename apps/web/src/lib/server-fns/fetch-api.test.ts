import { afterEach, describe, expect, it, vi } from "vitest";

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
    ).rejects.toThrow(/^Couldn't delete collection\n---\nDELETE .+ → 404 Not Found\nNot found$/);
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
    ).rejects.toThrow(/500 Server Error/);
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
      /<no body>$/,
    );
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
