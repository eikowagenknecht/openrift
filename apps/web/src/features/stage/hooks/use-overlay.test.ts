import { describe, expect, it, vi } from "vitest";

import { overlayKeys } from "@/features/stage/lib/stage-query-keys";

// Stubs the server-side modules the import graph touches, so the query
// options under test can load without pulling in server-fn machinery.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({ middleware: () => ({ handler: () => () => {} }) }),
    middleware: () => ({ handler: () => () => {} }),
  }),
}));
vi.mock("@/lib/server-fns/middleware", () => ({ withCookies: () => {} }));
vi.mock("@/lib/server-fns/orpc-client", () => ({
  apiOrpcClient: () => ({}),
  browserApiOrpcClient: () => ({ state: () => Promise.resolve({ version: 0, payload: {} }) }),
}));

const { OVERLAY_POLL_MS, overlayChannelQueryOptions, overlayStateQueryOptions } =
  await import("./use-overlay");

describe("overlayStateQueryOptions", () => {
  const options = overlayStateQueryOptions("tok-1");

  it("keys the poll by token", () => {
    expect(options.queryKey).toEqual(overlayKeys.stateByToken("tok-1"));
  });

  it("polls every second, even while the OBS tab is backgrounded", () => {
    expect(options.refetchInterval).toBe(OVERLAY_POLL_MS);
    expect(OVERLAY_POLL_MS).toBe(1000);
    expect(options.refetchIntervalInBackground).toBe(true);
  });

  it("never refetches on focus — the interval is the only trigger", () => {
    expect(options.refetchOnWindowFocus).toBe(false);
  });

  it("retries and treats data as always stale, so a blip keeps the last good frame", () => {
    expect(options.retry).toBe(true);
    expect(options.staleTime).toBe(0);
  });
});

describe("overlayChannelQueryOptions", () => {
  it("keys the dashboard channel by user", () => {
    expect(overlayChannelQueryOptions("user-1").queryKey).toEqual(overlayKeys.channel("user-1"));
  });
});
