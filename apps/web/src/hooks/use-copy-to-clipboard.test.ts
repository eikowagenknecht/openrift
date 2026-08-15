import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard, useCopyToClipboard } from "./use-copy-to-clipboard";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue();
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("copyTextToClipboard", () => {
  it("writes the text to the clipboard", async () => {
    await copyTextToClipboard("https://openrift.app/groups/join?code=ABC123");

    expect(writeText).toHaveBeenCalledWith("https://openrift.app/groups/join?code=ABC123");
  });

  it("writes an empty string rather than skipping the call", async () => {
    await copyTextToClipboard("");

    expect(writeText).toHaveBeenCalledWith("");
  });

  it("rejects when the write is denied, so callers can show their own error", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));

    await expect(copyTextToClipboard("link")).rejects.toThrow("NotAllowedError");
  });
});

describe("useCopyToClipboard", () => {
  it("writes the text and raises the copied flag", async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.copied).toBe(false);

    await act(async () => {
      await result.current.copy("https://openrift.app/lists/share/abc");
    });

    expect(writeText).toHaveBeenCalledWith("https://openrift.app/lists/share/abc");
    expect(result.current.copied).toBe(true);
  });

  it("clears the copied flag after the reset delay", async () => {
    // Do not add `shouldAdvanceTime` here. It ticks the fake clock from real
    // time on top of what the test advances, so the 1ms left below elapses on
    // its own under load and the timer fires a step early.
    vi.useFakeTimers();
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("link");
    });
    expect(result.current.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1499);
    });
    expect(result.current.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it("restarts the window when copied again before it elapses", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("link");
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await act(async () => {
      await result.current.copy("link");
    });
    // The first timer would have fired here had it not been cancelled.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.copied).toBe(false);
  });

  it("reports a denied write without raising the flag or throwing", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    const { result } = renderHook(() => useCopyToClipboard());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy("link");
    });

    expect(outcome).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it("reports a successful write", async () => {
    const { result } = renderHook(() => useCopyToClipboard());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy("link");
    });

    expect(outcome).toBe(true);
  });

  it("clears the flag immediately on reset", async () => {
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("link");
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.copied).toBe(false);
  });

  it("cancels the pending window on reset so it cannot re-clear later", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("link");
    });
    act(() => {
      result.current.reset();
    });

    // Copy again inside the first window: the cancelled timer must not fire and
    // clear this second confirmation early.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      await result.current.copy("link");
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.copied).toBe(true);
  });

  it("is a no-op when nothing was copied", () => {
    const { result } = renderHook(() => useCopyToClipboard());

    act(() => {
      result.current.reset();
    });
    expect(result.current.copied).toBe(false);
  });

  it("does not update state after unmount", async () => {
    // The only test here that keeps `shouldAdvanceTime`: `waitFor` polls on a
    // real interval and never settles under a clock that only the test moves.
    // Safe because this test asserts no timing boundary, just that nothing
    // logged after the window elapsed.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
    const { result, unmount } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("link");
    });
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => expect(errors).toHaveLength(0));
    spy.mockRestore();
  });
});
