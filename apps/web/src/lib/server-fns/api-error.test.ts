import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  apiErrorFromResponse,
  errorStatus,
  isApiError,
  isSessionExpiredError,
} from "./api-error";

function mockResponse(body: string, init: { status?: number; statusText?: string } = {}) {
  const { status = 500, statusText = "Internal Server Error" } = init;
  return {
    status,
    statusText,
    text: () => Promise.resolve(body),
  };
}

describe("errorStatus", () => {
  it("reads the status off an ApiError instance", () => {
    expect(errorStatus(new ApiError("Boom", { status: 500, diagnostic: "" }))).toBe(500);
  });

  it("reads the status off a post-boundary plain object", () => {
    expect(errorStatus({ name: "Error", status: 409 })).toBe(409);
  });

  it("returns undefined for an error carrying no status", () => {
    expect(errorStatus(new Error("Failed to fetch"))).toBeUndefined();
  });

  it("returns undefined for a non-numeric status and for non-objects", () => {
    expect(errorStatus({ status: "500" })).toBeUndefined();
    expect(errorStatus(null)).toBeUndefined();
    expect(errorStatus("boom")).toBeUndefined();
  });
});

describe("isSessionExpiredError", () => {
  it("returns true for a status-401 object", () => {
    expect(isSessionExpiredError({ status: 401 })).toBe(true);
  });

  it("returns true for an ApiError instance with status 401", () => {
    expect(
      isSessionExpiredError(
        new ApiError("Unauthorized", { status: 401, diagnostic: "GET /x → 401" }),
      ),
    ).toBe(true);
  });

  it("returns true for a plain object shaped like ORPCError with status 401", () => {
    expect(isSessionExpiredError({ name: "Error", status: 401 })).toBe(true);
  });

  it("returns false for other status codes", () => {
    expect(isSessionExpiredError({ status: 404 })).toBe(false);
    expect(isSessionExpiredError({ status: "401" })).toBe(false);
  });

  it("returns false for non-objects and null", () => {
    expect(isSessionExpiredError(null)).toBe(false);
    expect(isSessionExpiredError(undefined)).toBe(false);
    expect(isSessionExpiredError("401")).toBe(false);
    expect(isSessionExpiredError(401)).toBe(false);
  });

  it("returns false for an object with no status", () => {
    expect(isSessionExpiredError({ message: "boom" })).toBe(false);
  });
});

describe("isApiError", () => {
  it("returns true for an ApiError instance", () => {
    expect(isApiError(new ApiError("Not found", { status: 404, diagnostic: "GET /x → 404" }))).toBe(
      true,
    );
  });

  it("returns true for a plain object with name ApiError and a string message (post-serialization shape)", () => {
    expect(isApiError({ name: "ApiError", message: "Not found" })).toBe(true);
  });

  it("returns false when name is not ApiError", () => {
    expect(isApiError({ name: "Error", message: "boom" })).toBe(false);
  });

  it("returns false when message is missing or not a string", () => {
    expect(isApiError({ name: "ApiError" })).toBe(false);
    expect(isApiError({ name: "ApiError", message: 123 })).toBe(false);
  });

  it("returns false for non-objects and null", () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError(undefined)).toBe(false);
    expect(isApiError("ApiError")).toBe(false);
  });
});

describe("apiErrorFromResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the server's error message and code from a JSON envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockResponse('{"error":"Collection not found","code":"NOT_FOUND"}', {
      status: 404,
      statusText: "Not Found",
    });

    const err = await apiErrorFromResponse(res, "Couldn't load", {
      method: "GET",
      url: "/api/v1/collections/1",
    });

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Collection not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(err.diagnostic).toContain("GET /api/v1/collections/1 → 404 Not Found");
  });

  it("carries details through from the envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockResponse('{"error":"Bad input","details":{"field":"name"}}', { status: 400 });

    const err = await apiErrorFromResponse(res, "Couldn't save", { url: "/api/v1/x" });

    expect(err.details).toEqual({ field: "name" });
  });

  it("falls back to errorTitle for a non-JSON body (HTML error page)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockResponse("<html>502 Bad Gateway</html>", {
      status: 502,
      statusText: "Bad Gateway",
    });

    const err = await apiErrorFromResponse(res, "Couldn't load", { url: "/api/v1/x" });

    expect(err.message).toBe("Couldn't load");
    expect(err.code).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it("falls back to errorTitle when the JSON body has no error field", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockResponse('{"unrelated":true}', { status: 400 });

    const err = await apiErrorFromResponse(res, "Couldn't load", { url: "/api/v1/x" });

    expect(err.message).toBe("Couldn't load");
  });

  it("labels the diagnostic by URL alone when method is omitted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockResponse("oops", { status: 500 });

    const err = await apiErrorFromResponse(res, "Couldn't load", { url: "/api/v1/x" });

    expect(err.diagnostic.startsWith("/api/v1/x →")).toBe(true);
  });

  it("falls back to <no body> when reading the body itself rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = {
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.reject(new Error("stream errored")),
    };

    const err = await apiErrorFromResponse(res, "Couldn't load", { url: "/api/v1/x" });

    expect(err.message).toBe("Couldn't load");
    expect(err.diagnostic).toContain("<no body>");
  });

  it("logs the failure to the console, not the toast", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockResponse('{"error":"Not found"}', { status: 404 });

    await apiErrorFromResponse(res, "Couldn't load", { method: "GET", url: "/api/v1/x" });

    expect(consoleSpy).toHaveBeenCalledWith(
      "[Couldn't load]",
      expect.objectContaining({ url: "/api/v1/x", method: "GET", status: 404 }),
    );
  });
});
