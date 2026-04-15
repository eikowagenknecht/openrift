import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSearchUrlSync } from "./use-search-url-sync";

interface HookArgs {
  urlValue: string;
  onCommit: (value: string) => void;
}

describe("useSearchUrlSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes local state from the URL value", () => {
    const { result } = renderHook(() =>
      useSearchUrlSync({ urlValue: "initial", onCommit: vi.fn() }),
    );
    expect(result.current[0]).toBe("initial");
  });

  it("commits the local value to the URL after the debounce delay", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useSearchUrlSync({ urlValue: "", onCommit }));

    act(() => result.current[1]("hello"));
    act(() => vi.advanceTimersByTime(200));

    expect(onCommit).toHaveBeenCalledWith("hello");
  });

  it("syncs local state when the URL changes externally (e.g. clear all)", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook<readonly [string, (value: string) => void], HookArgs>(
      ({ urlValue }) => useSearchUrlSync({ urlValue, onCommit }),
      { initialProps: { urlValue: "foo", onCommit } },
    );

    rerender({ urlValue: "", onCommit });
    expect(result.current[0]).toBe("");
  });

  it("does not clobber in-progress typing when the navigate settles (regression)", () => {
    // Simulates the real router: onCommit schedules a URL update that lands
    // on the next rerender. During fast typing, the input should not be
    // overwritten by the stale-then-catching-up URL value.
    //
    // Real-world bug trigger: `useFilterActions` returns a fresh `setSearch`
    // closure each render, so the effect re-runs on every typing-triggered
    // rerender (not only when urlValue/debounced change). We simulate that
    // here by passing a fresh `onCommit` each render, which forces the effect
    // to observe the stale urlValue mid-flight.
    const commits: string[] = [];
    const makeOnCommit = () => (value: string) => {
      commits.push(value);
    };

    const { result, rerender } = renderHook<readonly [string, (value: string) => void], HookArgs>(
      ({ urlValue, onCommit }) => useSearchUrlSync({ urlValue, onCommit }),
      { initialProps: { urlValue: "", onCommit: makeOnCommit() } },
    );

    act(() => result.current[1]("T"));
    act(() => result.current[1]("Th"));
    act(() => result.current[1]("Thi"));

    act(() => vi.advanceTimersByTime(200));
    expect(commits.at(-1)).toBe("Thi");

    // User keeps typing BEFORE the URL has caught up. Rerender with a fresh
    // onCommit (mimicking the real hook) while urlValue is still stale.
    act(() => result.current[1]("This is not"));
    rerender({ urlValue: "", onCommit: makeOnCommit() });

    expect(result.current[0]).toBe("This is not");

    // URL finally catches up.
    rerender({ urlValue: "Thi", onCommit: makeOnCommit() });
    expect(result.current[0]).toBe("This is not");

    act(() => vi.advanceTimersByTime(200));
    expect(commits.at(-1)).toBe("This is not");
  });

  it("treats a URL change that doesn't match our last commit as external", () => {
    let pendingUrlValue = "";
    const onCommit = vi.fn((value: string) => {
      pendingUrlValue = value;
    });

    const { result, rerender } = renderHook<readonly [string, (value: string) => void], HookArgs>(
      ({ urlValue }) => useSearchUrlSync({ urlValue, onCommit }),
      { initialProps: { urlValue: "", onCommit } },
    );

    act(() => result.current[1]("foo"));
    act(() => vi.advanceTimersByTime(200));
    rerender({ urlValue: pendingUrlValue, onCommit });
    expect(result.current[0]).toBe("foo");

    // External "clear all": URL becomes "" via another code path.
    rerender({ urlValue: "", onCommit });
    expect(result.current[0]).toBe("");
  });

  it("does not re-commit the same value twice", () => {
    let pendingUrlValue = "";
    const onCommit = vi.fn((value: string) => {
      pendingUrlValue = value;
    });

    const { result, rerender } = renderHook<readonly [string, (value: string) => void], HookArgs>(
      ({ urlValue }) => useSearchUrlSync({ urlValue, onCommit }),
      { initialProps: { urlValue: "", onCommit } },
    );

    act(() => result.current[1]("foo"));
    act(() => vi.advanceTimersByTime(200));
    expect(onCommit).toHaveBeenCalledTimes(1);

    rerender({ urlValue: pendingUrlValue, onCommit });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
