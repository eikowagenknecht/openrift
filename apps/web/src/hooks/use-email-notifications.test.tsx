import type { UserPreferencesResponse } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler:
        (fn: (args: { context: { cookie: string }; data: unknown }) => unknown) =>
        (args?: { data?: unknown }) =>
          fn({ context: { cookie: "" }, data: args?.data }),
      middleware: () => chain,
      validator: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/middleware", () => ({ withCookies: () => {} }));
vi.mock("@/lib/auth-session", () => ({ useUserId: () => "test-user-id" }));

// Controllable client-hydration flag — the fix gates the read on this.
let hydratedValue = true;
vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => hydratedValue }));

const { useEmailNotifications } = await import("./use-email-notifications");

interface FetchCall {
  method: string;
  body: unknown;
}

// Stubs global fetch: GET returns `prefs`, PATCH/other returns 200. Records
// calls. oRPC's OpenAPI link sends a body-bearing request as a `Request` object
// (first arg) rather than `(url, init)`, so read the method/body from whichever
// shape the call used.
function stubFetch(prefs: UserPreferencesResponse) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    let method = init?.method ?? "GET";
    let bodyText = init?.body;
    if (input instanceof Request) {
      method = input.method;
      bodyText = await input.clone().text();
    }
    calls.push({ method, body: bodyText ? JSON.parse(bodyText) : undefined });
    if (method === "GET") {
      return Response.json(prefs);
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  hydratedValue = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEmailNotifications", () => {
  it("reports not-loading and never fetches until the client has hydrated", () => {
    // Before hydration the controls must render in their non-loading (enabled)
    // state, matching the SSR and first-client render. `useUserId()` reads the
    // session query, which is present during SSR but not on the first client
    // render, so gating isLoading on `hydrated` is what keeps the switches'
    // disabled/tabIndex from flipping and tripping a hydration mismatch.
    hydratedValue = false;
    const { fetchMock } = stubFetch({});
    const { result } = renderHook(() => useEmailNotifications(), { wrapper: wrap() });

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the gates from the server preferences once hydrated", async () => {
    stubFetch({
      emailNotifications: {
        tradeMatches: true,
        tradeRequests: false,
        tradeRequestCadence: "30min",
      },
    });
    const { result } = renderHook(() => useEmailNotifications(), { wrapper: wrap() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.gates).toEqual({
      tradeMatches: true,
      tradeRequests: false,
      tradeStatus: true,
      tradeRequestCadence: "30min",
      cardSubmissions: false,
    });
  });

  it("falls back to per-setting defaults when the preference is absent", async () => {
    stubFetch({});
    const { result } = renderHook(() => useEmailNotifications(), { wrapper: wrap() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.gates).toEqual({
      tradeMatches: false,
      tradeRequests: true,
      tradeStatus: true,
      tradeRequestCadence: "5min",
      cardSubmissions: false,
    });
  });

  it("ignores a toggle while the preferences are still loading", () => {
    hydratedValue = false;
    const { calls } = stubFetch({});
    const { result } = renderHook(() => useEmailNotifications(), { wrapper: wrap() });

    act(() => result.current.setChannel("tradeMatches", true));
    expect(calls.some((call) => call.method !== "GET")).toBe(false);
  });

  it("PATCHes the whole object, preserving the sibling channel", async () => {
    const { calls } = stubFetch({ emailNotifications: { tradeRequests: false } });
    const { result } = renderHook(() => useEmailNotifications(), { wrapper: wrap() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setChannel("tradeMatches", true));

    await waitFor(() => expect(calls.some((call) => call.method !== "GET")).toBe(true));
    const patch = calls.find((call) => call.method !== "GET");
    expect(patch?.body).toEqual({
      emailNotifications: { tradeRequests: false, tradeMatches: true },
    });
  });

  it("PATCHes a cadence change while preserving the channel toggles", async () => {
    const { calls } = stubFetch({ emailNotifications: { tradeMatches: true } });
    const { result } = renderHook(() => useEmailNotifications(), { wrapper: wrap() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setCadence("instant"));

    await waitFor(() => expect(calls.some((call) => call.method !== "GET")).toBe(true));
    const patch = calls.find((call) => call.method !== "GET");
    expect(patch?.body).toEqual({
      emailNotifications: { tradeMatches: true, tradeRequestCadence: "instant" },
    });
  });
});
