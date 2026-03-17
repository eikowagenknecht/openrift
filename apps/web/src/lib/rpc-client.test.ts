/* oxlint-disable no-empty-function -- test file: mock implementations use empty fns */
import type { ClientResponse } from "hono/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./api-client";
import { rpc } from "./rpc-client";

function mockResponse(
  overrides: Partial<Response>,
): Promise<ClientResponse<unknown, number, string>> {
  return Promise.resolve({
    ok: true,
    status: 200,
    url: "/test",
    json: async () => ({}),
    text: async () => "{}",
    ...overrides,
  } as unknown as ClientResponse<unknown, number, string>);
}

describe("rpc", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    const data = { id: 1, name: "card" };
    const result = await rpc(mockResponse({ text: async () => JSON.stringify(data) }));
    expect(result).toEqual(data);
  });

  it("returns undefined on success with empty body", async () => {
    const result = await rpc(mockResponse({ text: async () => "" }));
    expect(result).toBeUndefined();
  });

  it("throws ApiError with string error message", async () => {
    const err = await rpc(
      mockResponse({
        ok: false,
        status: 400,
        json: async () => ({ error: "bad request" }),
      }),
    ).catch((error: unknown) => error);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.message).toBe("bad request");
    expect(apiErr.status).toBe(400);
    expect(apiErr.code).toBe("UNKNOWN");
  });

  it("throws ApiError with parsed Zod error details", async () => {
    const issues = [{ path: ["name"], message: "Required" }];
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = await rpc(
      mockResponse({
        ok: false,
        status: 422,
        json: async () => ({
          error: { name: "ZodError", message: JSON.stringify({ issues }) },
        }),
      }),
    ).catch((error: unknown) => error);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.details).toEqual({ issues });
    expect(consoleSpy).toHaveBeenCalledWith("[rpc]", "/test", expect.any(String), { issues });
  });

  it("throws ApiError with string details when error.message is not valid JSON", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = await rpc(
      mockResponse({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: "not json" },
        }),
      }),
    ).catch((error: unknown) => error);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.details).toBe("not json");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("throws ApiError with error object as details when error has no message", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = await rpc(
      mockResponse({
        ok: false,
        status: 500,
        json: async () => ({
          error: { foo: "bar" },
        }),
      }),
    ).catch((error: unknown) => error);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.details).toEqual({ foo: "bar" });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("throws ApiError with generic message when json() throws", async () => {
    const err = await rpc(
      mockResponse({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("parse error");
        },
      }),
    ).catch((error: unknown) => error);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.message).toBe("Request failed: 500");
    expect(apiErr.code).toBe("UNKNOWN");
    expect(apiErr.details).toBeUndefined();
  });

  it("extracts code from response body", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = await rpc(
      mockResponse({
        ok: false,
        status: 403,
        json: async () => ({
          error: "forbidden",
          code: "FORBIDDEN",
          details: { reason: "no access" },
        }),
      }),
    ).catch((error: unknown) => error);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe("FORBIDDEN");
    expect(apiErr.details).toEqual({ reason: "no access" });
    expect(consoleSpy).toHaveBeenCalledWith("[rpc]", "/test", "forbidden", { reason: "no access" });
  });

  it("does not call console.error when there are no details", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await rpc(
      mockResponse({
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      }),
    ).catch(() => {});

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
