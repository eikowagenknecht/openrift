import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCopyToClipboard } from "./use-copy-to-clipboard";

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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useCopyToClipboard(1500));

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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useCopyToClipboard(1500));

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

  it("does not update state after unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
    const { result, unmount } = renderHook(() => useCopyToClipboard(1500));

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
