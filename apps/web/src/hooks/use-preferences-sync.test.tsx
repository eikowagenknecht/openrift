// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import { readFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import path from "node:path";

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
vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));

const { usePreferencesSync } = await import("./use-preferences-sync");
const { useDisplayStore } = await import("@/stores/display-store");
const { useThemeStore } = await import("@/stores/theme-store");
const { queryKeys } = await import("@/lib/query-keys");
const { createStoreResetter } = await import("@/test/store-helpers");

const resetDisplay = createStoreResetter(useDisplayStore);
const resetTheme = createStoreResetter(useThemeStore);

interface FetchCall {
  method: string;
  body: unknown;
}

/**
 * Stubs global fetch: GET returns `prefs`, everything else succeeds. oRPC's
 * OpenAPI link sends a body-bearing request as a `Request` object, so the
 * method/body are read from whichever shape the call used.
 * @param prefs The preferences the GET should answer with.
 * @returns The recorded calls plus a setter for later GET responses.
 */
function stubFetch(prefs: UserPreferencesResponse) {
  const calls: FetchCall[] = [];
  let current = prefs;
  const fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    let method = init?.method ?? "GET";
    let bodyText = init?.body;
    if (input instanceof Request) {
      method = input.method;
      bodyText = await input.clone().text();
    }
    calls.push({ method, body: bodyText ? JSON.parse(bodyText) : undefined });
    if (method === "GET") {
      return Response.json(current);
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    patches: () => calls.filter((call) => call.method !== "GET"),
    setServerPrefs: (next: UserPreferencesResponse) => {
      current = next;
    },
  };
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

// The save is debounced by 1s. Real timers rather than fake ones: waitFor does
// not drive vitest's fake clock, and the query round trips run on real
// microtasks anyway.
const SAVE_DEBOUNCE_MS = 1000;

/** Waits out the save debounce and lets any resulting request settle. @returns Nothing. */
async function flushSaveDebounce() {
  await act(async () => {
    // oxlint-disable-next-line promise/avoid-new -- a real delay is the point: "the debounce elapsed and nothing was sent" has no promise to await.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, SAVE_DEBOUNCE_MS + 250);
    });
  });
}

/** Lets pending microtasks (query resolution, effects) settle. @returns Nothing. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  resetDisplay();
  resetTheme();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePreferencesSync", () => {
  it("hydrates the stores from the first server payload", async () => {
    stubFetch({ showImages: false, theme: "dark" } as UserPreferencesResponse);
    const { Wrapper } = wrap();
    renderHook(() => usePreferencesSync(true), { wrapper: Wrapper });

    await waitFor(() => expect(useDisplayStore.getState().prefsHydrated).toBe(true));
    expect(useDisplayStore.getState().showImages).toBe(false);
    expect(useThemeStore.getState().preference).toBe("dark");
  });

  it("does not PATCH back the values it just hydrated", async () => {
    // The hydration writes wake the store subscriber. Nothing must come of
    // that: the stores end up agreeing with the server, so the debounced save
    // finds nothing to send.
    const { patches } = stubFetch({ showImages: false } as UserPreferencesResponse);
    const { Wrapper } = wrap();
    renderHook(() => usePreferencesSync(true), { wrapper: Wrapper });

    await waitFor(() => expect(useDisplayStore.getState().prefsHydrated).toBe(true));
    await flushSaveDebounce();

    expect(patches()).toHaveLength(0);
  });

  it("saves a preference the user changes", async () => {
    const { patches } = stubFetch({ showImages: true } as UserPreferencesResponse);
    const { Wrapper } = wrap();
    renderHook(() => usePreferencesSync(true), { wrapper: Wrapper });

    await waitFor(() => expect(useDisplayStore.getState().prefsHydrated).toBe(true));
    act(() => useDisplayStore.getState().setShowImages(false));
    await flushSaveDebounce();

    expect(patches()).toHaveLength(1);
    expect(patches()[0]?.body).toMatchObject({ showImages: false });
  });

  it("ignores device-local store changes that carry no preference", async () => {
    // maxColumns, filter expansion and the viewport measurements live in the
    // same store but are deliberately absent from the synced snapshot.
    const { patches } = stubFetch({} as UserPreferencesResponse);
    const { Wrapper } = wrap();
    renderHook(() => usePreferencesSync(true), { wrapper: Wrapper });

    await waitFor(() => expect(useDisplayStore.getState().prefsHydrated).toBe(true));
    act(() => useDisplayStore.getState().setMaxColumns(4));
    act(() => useDisplayStore.getState().setFiltersExpanded(true));
    await flushSaveDebounce();

    expect(patches()).toHaveLength(0);
  });

  it("saves a change made in the same frame a server payload lands", async () => {
    // Regression: the hydration guard used to be cleared inside a
    // requestAnimationFrame, and the subscriber returned early without
    // recording the new value, so a toggle made before that frame elapsed was
    // dropped from the save path entirely — it reached localStorage and never
    // reached the server unless some later change happened to wake the save.
    const { patches } = stubFetch({ showImages: true } as UserPreferencesResponse);
    const { client, Wrapper } = wrap();
    renderHook(() => usePreferencesSync(true), { wrapper: Wrapper });

    await waitFor(() => expect(useDisplayStore.getState().prefsHydrated).toBe(true));

    // Land a payload, then toggle before the animation frame could have run.
    act(() => {
      client.setQueryData(queryKeys.preferences.all("test-user-id"), {
        showImages: true,
        fancyFan: false,
      });
    });
    act(() => useDisplayStore.getState().setShowImages(false));
    await flushSaveDebounce();

    expect(patches()).toHaveLength(1);
    expect(patches()[0]?.body).toMatchObject({ showImages: false });
    expect(useDisplayStore.getState().showImages).toBe(false);
  });

  it("keeps a pending edit when a refetch resolves with the pre-edit value", async () => {
    // Regression: the save guard was a one-shot flag set after the PATCH
    // resolved and cleared by any render with no data, so a payload that was
    // already in flight could overwrite a just-made edit and the reverted value
    // would then be what got saved.
    const { patches, setServerPrefs } = stubFetch({ showImages: true } as UserPreferencesResponse);
    const { client, Wrapper } = wrap();
    renderHook(() => usePreferencesSync(true), { wrapper: Wrapper });

    await waitFor(() => expect(useDisplayStore.getState().prefsHydrated).toBe(true));
    act(() => useDisplayStore.getState().setShowImages(false));

    // A refetch that started before the toggle now resolves with the old value.
    setServerPrefs({ showImages: true } as UserPreferencesResponse);
    act(() => {
      client.setQueryData(queryKeys.preferences.all("test-user-id"), { showImages: true });
    });
    await flushMicrotasks();

    expect(useDisplayStore.getState().showImages).toBe(false);

    await flushSaveDebounce();
    expect(patches().at(-1)?.body).toMatchObject({ showImages: false });
  });

  it("still releases the hydration signal when it stands down for a pending edit", async () => {
    // Downstream consumers (the language seed) block until prefsHydrated flips,
    // so the skip path has to mark it explicitly.
    stubFetch({ showImages: true } as UserPreferencesResponse);
    const { client, Wrapper } = wrap();
    renderHook(() => usePreferencesSync(false), { wrapper: Wrapper });

    act(() => useDisplayStore.getState().setShowImages(false));
    act(() => {
      client.setQueryData(queryKeys.preferences.all("test-user-id"), { showImages: true });
    });
    await flushMicrotasks();

    expect(useDisplayStore.getState().prefsHydrated).toBe(true);
  });

  it("marks prefs hydrated for logged-out visitors without fetching", async () => {
    const { calls } = stubFetch({} as UserPreferencesResponse);
    const { Wrapper } = wrap();
    renderHook(() => usePreferencesSync(false), { wrapper: Wrapper });

    await waitFor(() => expect(useDisplayStore.getState().prefsHydrated).toBe(true));
    expect(calls).toHaveLength(0);
  });

  it("keeps the stores diverged when the save fails, so the edit survives", async () => {
    const { patches } = stubFetch({ showImages: true } as UserPreferencesResponse);
    const { Wrapper } = wrap();
    renderHook(() => usePreferencesSync(true), { wrapper: Wrapper });

    await waitFor(() => expect(useDisplayStore.getState().prefsHydrated).toBe(true));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    act(() => useDisplayStore.getState().setShowImages(false));
    await flushSaveDebounce();

    expect(useDisplayStore.getState().showImages).toBe(false);
    expect(patches()).toHaveLength(0);
  });

  // Regression: the React Compiler cannot lower `??=` (Todo::lowerExpression)
  // and bails out of the whole hook when it sees one, so the debounced saver
  // and its store subscriptions get rebuilt on every render. The compiler
  // logger in vite.config.ts surfaces the CompileError, but this source-level
  // guard catches the pattern where the compiler doesn't run (vitest).
  it("does not use `??=` assignments (React Compiler cannot lower them)", () => {
    const source = readFileSync(path.resolve(__dirname, "./use-preferences-sync.ts"), "utf-8");
    expect(source).not.toMatch(/[\w)\]]\s*\?\?=/u);
  });
});
