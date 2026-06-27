import { NonRetriableError } from "@tanstack/offline-transactions";
import { describe, expect, it } from "vitest";

import { ApiError } from "./server-fns/api-error";
import { asNonRetriableIfPermanent, rethrowAsNetworkError } from "./sync-mutation-helpers";

describe("rethrowAsNetworkError", () => {
  it("maps a fetch TypeError to a user-facing connection error", () => {
    expect(() => {
      rethrowAsNetworkError(new TypeError("Failed to fetch"));
    }).toThrowError("Can't reach the server — check your connection");
  });

  it("propagates non-TypeError values untouched", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(() => {
      rethrowAsNetworkError(abort);
    }).toThrow(abort);
  });
});

describe("asNonRetriableIfPermanent", () => {
  it("wraps 4xx ApiErrors as NonRetriableError, keeping the message", () => {
    const result = asNonRetriableIfPermanent(
      new ApiError("Forbidden", { status: 403, diagnostic: "POST /x 403" }),
    );
    expect(result).toBeInstanceOf(NonRetriableError);
    expect((result as Error).message).toBe("Forbidden");
  });

  it("keeps 5xx ApiErrors retriable", () => {
    const original = new ApiError("Server exploded", { status: 500, diagnostic: "POST /x 500" });
    expect(asNonRetriableIfPermanent(original)).toBe(original);
  });

  it("keeps plain errors (network failures) retriable", () => {
    const original = new Error("Can't reach the server");
    expect(asNonRetriableIfPermanent(original)).toBe(original);
  });
});
