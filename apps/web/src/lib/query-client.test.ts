import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionQueryOptions } from "./auth-session";
import { createQueryClient } from "./query-client";
import { captureHandledError } from "./report-error";
import { _resetReloadStateForTesting } from "./stale-bundle-reload";
import { PERSISTENT_ERROR_TOAST } from "./toast";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./report-error", () => ({ captureHandledError: vi.fn() }));

// What a 401 ApiError looks like after the server-fn (seroval) boundary: a
// PLAIN object carrying the own properties, prototype gone. instanceof would
// fail here, which is why the 401 detection must stay structural.
const unauthorized = {
  name: "ApiError",
  message: "Unauthorized",
  status: 401,
  diagnostic: "GET /api/v1/decks/1 → 401 Unauthorized\nUnauthorized",
} as unknown as Error;

// A stale client bundle calling a server function ID the deployed server's
// manifest no longer has — what getServerFnById throws, as it reaches the
// client after the server-fn boundary (prototype dropped, message preserved).
const staleServerFn = {
  name: "Error",
  message: "Server function info not found for deadbeefcafef00d",
} as unknown as Error;

// Stub location.reload so the stale-bundle reload path can be asserted without
// tearing down the jsdom env, and reset the once-per-session loop guard so a
// reload in one test doesn't suppress the next.
const reloadSpy = vi.fn();
beforeEach(() => {
  reloadSpy.mockReset();
  _resetReloadStateForTesting();
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { ...globalThis.location, reload: reloadSpy },
  });
});

describe("createQueryClient mutation onError", () => {
  function getOnError() {
    const onError = createQueryClient().getDefaultOptions().mutations?.onError;
    if (!onError) {
      throw new Error("expected a default mutation onError");
    }
    return onError as (err: unknown, ...rest: unknown[]) => void;
  }

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(captureHandledError).mockClear();
  });

  it("toasts the server message and logs the diagnostic for an ApiError-shaped object", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // A PLAIN object with no prototype — what an ApiError becomes after it
    // crosses the server-function (seroval) boundary. instanceof would fail here.
    const serialized = {
      name: "ApiError",
      message: "Collection not found",
      code: "NOT_FOUND",
      diagnostic: "DELETE /api/v1/collections/1 → 404 Not Found\nCollection not found",
    };

    getOnError()(serialized, undefined, undefined);

    // Persistent + dismissible: a failed action the user must acknowledge,
    // not an auto-dismissing toast that's easy to miss.
    expect(toast.error).toHaveBeenCalledWith("Collection not found", PERSISTENT_ERROR_TOAST);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Collection not found"),
      serialized,
    );
    errorSpy.mockRestore();
  });

  it("toasts a non-ApiError error's message and logs the error itself", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("network down");

    getOnError()(err, undefined, undefined);

    expect(toast.error).toHaveBeenCalledWith("network down", PERSISTENT_ERROR_TOAST);
    expect(errorSpy).toHaveBeenCalledWith(err);
    errorSpy.mockRestore();
  });

  it("reloads instead of toasting when a mutation hits a stale server function", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    getOnError()(staleServerFn, undefined, undefined);

    // The user sees a reload, not a framework-internal error message.
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("reports a 5xx to Sentry", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    getOnError()(
      { name: "ApiError", message: "Internal error", status: 500, diagnostic: "" },
      undefined,
      undefined,
    );

    expect(captureHandledError).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("reports an error carrying no status to Sentry", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    getOnError()(new Error("boom"), undefined, undefined);

    expect(captureHandledError).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("does not report a 4xx to Sentry, since the toast already explains it", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    getOnError()(
      { name: "ApiError", message: "Input validation failed", status: 400, diagnostic: "" },
      undefined,
      undefined,
    );

    expect(toast.error).toHaveBeenCalledWith("Input validation failed", PERSISTENT_ERROR_TOAST);
    expect(captureHandledError).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("invalidates the session query when a mutation fails with a 401", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const onError = client.getDefaultOptions().mutations?.onError as (
      err: unknown,
      ...rest: unknown[]
    ) => void;

    onError(unauthorized, undefined, undefined);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionQueryOptions().queryKey });
    errorSpy.mockRestore();
  });
});

describe("createQueryClient session-expiry handling", () => {
  it("invalidates the session query when a query fails with a 401", async () => {
    const client = createQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    await expect(
      client.fetchQuery({
        queryKey: ["deck", "1"],
        // oxlint-disable-next-line prefer-promise-reject-errors -- deliberately a plain object: the post-seroval ApiError shape
        queryFn: () => Promise.reject(unauthorized),
      }),
    ).rejects.toBe(unauthorized);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionQueryOptions().queryKey });
  });

  it("does not invalidate the session for non-401 query errors", async () => {
    const client = createQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const serverError = new Error("boom");

    await expect(
      client.fetchQuery({
        queryKey: ["deck", "2"],
        queryFn: () => Promise.reject(serverError),
        retry: false,
      }),
    ).rejects.toBe(serverError);

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("reloads when a query (e.g. a poll) hits a stale server function", async () => {
    const client = createQueryClient();

    await expect(
      client.fetchQuery({
        queryKey: ["deck-check", "entries"],
        // oxlint-disable-next-line prefer-promise-reject-errors -- the post-boundary server-fn error shape
        queryFn: () => Promise.reject(staleServerFn),
        retry: false,
      }),
    ).rejects.toBe(staleServerFn);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("never retries a 401 or a stale server function but keeps 3 browser retries otherwise", () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: unknown,
    ) => boolean;

    // Retrying can't fix an invalid session cookie — fail fast so the session
    // refetch → /login redirect isn't delayed by retry backoff.
    expect(retry(0, unauthorized)).toBe(false);
    // Nor can it fix a missing manifest entry — three more failing SSR calls
    // before the reload is pure noise.
    expect(retry(0, staleServerFn)).toBe(false);
    // jsdom has a window, so this exercises the browser branch.
    expect(retry(0, new Error("boom"))).toBe(true);
    expect(retry(2, new Error("boom"))).toBe(true);
    expect(retry(3, new Error("boom"))).toBe(false);
  });
});
