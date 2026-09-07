import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { sanitizeViewPrefsBlob } from "@/lib/view-prefs";
import { useCookieViewPrefsStore, useLocalViewPrefsStore } from "@/stores/view-prefs-store";
import { createStoreResetter } from "@/test/store-helpers";

import {
  ResolvedViewPrefsProvider,
  useSurfaceViewDefaults,
  useViewPrefsWriter,
  ViewSurfaceProvider,
} from "./use-view-prefs";

const resetCookieStore = createStoreResetter(useCookieViewPrefsStore);
const resetLocalStore = createStoreResetter(useLocalViewPrefsStore);

beforeEach(() => {
  resetCookieStore();
  resetLocalStore();
});

function makeWrapper(
  surface: string | null,
  resolved?: Parameters<typeof sanitizeViewPrefsBlob>[0],
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const body = resolved ? (
      <ResolvedViewPrefsProvider value={sanitizeViewPrefsBlob(resolved, ["cards", "promos"])}>
        {children}
      </ResolvedViewPrefsProvider>
    ) : (
      children
    );
    return <ViewSurfaceProvider value={surface as never}>{body}</ViewSurfaceProvider>;
  };
}

describe("useSurfaceViewDefaults", () => {
  it("returns the unscoped catalog defaults outside any surface", () => {
    const { result } = renderHook(() => useSurfaceViewDefaults());

    expect(result.current).toEqual({ sort: "id", sortDir: "asc", groupBy: "set", groupDir: "asc" });
  });

  it("returns the local store's value for a local surface", () => {
    useLocalViewPrefsStore.getState().setSort("decks", "name");

    const { result } = renderHook(() => useSurfaceViewDefaults(), {
      wrapper: makeWrapper("decks"),
    });

    expect(result.current.sort).toBe("name");
  });

  it("falls back to the surface's in-code defaults when the local store has no entry yet", () => {
    const { result } = renderHook(() => useSurfaceViewDefaults(), {
      wrapper: makeWrapper("decks"),
    });

    expect(result.current).toEqual({
      sort: "updated",
      sortDir: "desc",
      groupBy: "none",
      groupDir: "asc",
    });
  });

  it("prefers the resolved (SSR cookie) value for a cookie-backed surface", () => {
    const { result } = renderHook(() => useSurfaceViewDefaults(), {
      wrapper: makeWrapper("cards", {
        cards: { sort: "name", sortDir: "desc", groupBy: "rarity", groupDir: "desc" },
      }),
    });

    expect(result.current).toEqual({
      sort: "name",
      sortDir: "desc",
      groupBy: "rarity",
      groupDir: "desc",
    });
  });

  it("falls back to catalog defaults for a cookie surface with no resolved context", () => {
    const { result } = renderHook(() => useSurfaceViewDefaults(), {
      wrapper: makeWrapper("cards"),
    });

    expect(result.current).toEqual({ sort: "id", sortDir: "asc", groupBy: "set", groupDir: "asc" });
  });
});

describe("useViewPrefsWriter", () => {
  it("returns no-op setters outside any surface", () => {
    const { result } = renderHook(() => useViewPrefsWriter());

    expect(() => {
      result.current.setSort("name");
      result.current.setSortDir("desc");
      result.current.setGroupBy("rarity");
      result.current.setGroupDir("desc");
    }).not.toThrow();
    expect(useCookieViewPrefsStore.getState().cards.sort).toBe("id");
    expect(useLocalViewPrefsStore.getState().decks.sort).toBe("updated");
  });

  it("writes to the cookie store for a cookie-backed surface", () => {
    const { result } = renderHook(() => useViewPrefsWriter(), {
      wrapper: makeWrapper("cards"),
    });

    result.current.setSort("name");
    result.current.setGroupBy("rarity");

    expect(useCookieViewPrefsStore.getState().cards).toMatchObject({
      sort: "name",
      groupBy: "rarity",
    });
    expect(useLocalViewPrefsStore.getState().decks.sort).toBe("updated");
  });

  it("writes to the local store for a local surface", () => {
    const { result } = renderHook(() => useViewPrefsWriter(), {
      wrapper: makeWrapper("decks"),
    });

    result.current.setSortDir("desc");

    expect(useLocalViewPrefsStore.getState().decks.sortDir).toBe("desc");
    expect(useCookieViewPrefsStore.getState().cards.sortDir).toBe("asc");
  });

  it("clamps an unrecognized value on write, falling back to the surface default", () => {
    const { result } = renderHook(() => useViewPrefsWriter(), {
      wrapper: makeWrapper("decks"),
    });

    result.current.setSort("not-a-real-sort");

    expect(useLocalViewPrefsStore.getState().decks.sort).toBe("updated");
  });
});
