import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";

// The hooks in use-overlay.ts pull in server-fn machinery; the query options
// are what's under test, so stub the server-side modules the import graph
// touches (same pattern as use-loans.test.ts).
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
    expect(options.queryKey).toEqual(queryKeys.overlay.stateByToken("tok-1"));
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
    expect(overlayChannelQueryOptions("user-1").queryKey).toEqual(
      queryKeys.overlay.channel("user-1"),
    );
  });
});
