import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScanLayout } from "./use-scan-layout";

interface FakeQuery {
  matches: boolean;
  listeners: Set<() => void>;
}

function stubMatchMedia(initial: Record<string, boolean>): Map<string, FakeQuery> {
  const queries = new Map<string, FakeQuery>();
  vi.stubGlobal("matchMedia", (query: string) => {
    let entry = queries.get(query);
    if (!entry) {
      entry = { matches: initial[query] ?? false, listeners: new Set() };
      queries.set(query, entry);
    }
    const current = entry;
    return {
      get matches() {
        return current.matches;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => current.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => current.listeners.delete(listener),
    };
  });
  return queries;
}

function setMatches(queries: Map<string, FakeQuery>, query: string, matches: boolean): void {
  const entry = queries.get(query);
  if (!entry) {
    throw new Error(`query never registered: ${query}`);
  }
  entry.matches = matches;
  for (const listener of entry.listeners) {
    listener();
  }
}

const LANDSCAPE = "(orientation: landscape) and (max-height: 600px)";
const PORTRAIT = "(max-width: 767px)";

describe("useScanLayout", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports boxed when neither phone query matches", () => {
    stubMatchMedia({});
    const { result } = renderHook(() => useScanLayout());
    expect(result.current).toBe("boxed");
  });

  it("reports portrait on a narrow upright viewport", () => {
    stubMatchMedia({ [PORTRAIT]: true });
    const { result } = renderHook(() => useScanLayout());
    expect(result.current).toBe("portrait");
  });

  it("reports landscape on a short sideways viewport", () => {
    stubMatchMedia({ [LANDSCAPE]: true });
    const { result } = renderHook(() => useScanLayout());
    expect(result.current).toBe("landscape");
  });

  it("prefers landscape when a phone is narrow and sideways at once", () => {
    stubMatchMedia({ [LANDSCAPE]: true, [PORTRAIT]: true });
    const { result } = renderHook(() => useScanLayout());
    expect(result.current).toBe("landscape");
  });

  it("re-renders when the viewport rotates", () => {
    const queries = stubMatchMedia({ [PORTRAIT]: true });
    const { result } = renderHook(() => useScanLayout());
    expect(result.current).toBe("portrait");

    act(() => {
      setMatches(queries, PORTRAIT, false);
      setMatches(queries, LANDSCAPE, true);
    });
    expect(result.current).toBe("landscape");

    act(() => {
      setMatches(queries, LANDSCAPE, false);
    });
    expect(result.current).toBe("boxed");
  });

  it("drops its listeners on unmount", () => {
    const queries = stubMatchMedia({ [PORTRAIT]: true });
    const { unmount } = renderHook(() => useScanLayout());
    expect(queries.get(PORTRAIT)?.listeners.size).toBe(1);
    expect(queries.get(LANDSCAPE)?.listeners.size).toBe(1);

    unmount();
    expect(queries.get(PORTRAIT)?.listeners.size).toBe(0);
    expect(queries.get(LANDSCAPE)?.listeners.size).toBe(0);
  });

  it("falls back to boxed where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useScanLayout());
    expect(result.current).toBe("boxed");
  });
});
