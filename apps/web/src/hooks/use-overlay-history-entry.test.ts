import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  closeOverlayHistoryEntry,
  hasOverlayHistoryEntry,
  useOverlayHistoryEntry,
} from "./use-overlay-history-entry";

const navigateMock = vi.fn();
// One stable object, like the real useRouter: the hook keys its effect on the
// router identity, so a fresh stub per render would push on every render.
const routerStub = {
  navigate: navigateMock,
  latestLocation: { href: "/decks/share/abc?view=grid" },
};
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => routerStub,
}));

beforeEach(() => {
  navigateMock.mockReset();
  history.replaceState(null, "");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOverlayHistoryEntry", () => {
  it("pushes an entry flagged with the overlay's key", () => {
    renderHook(() =>
      useOverlayHistoryEntry({ active: true, stateKey: "cardDetail", onPop: vi.fn() }),
    );

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const options = navigateMock.mock.calls[0]?.[0];
    expect(options.href).toBe("/decks/share/abc?view=grid");
    expect(options.state({ __TSR_index: 0 })).toEqual({ __TSR_index: 0, cardDetail: true });
  });

  it("passes resetScroll: false so opening the overlay does not jump the page to the top (regression)", () => {
    renderHook(() =>
      useOverlayHistoryEntry({ active: true, stateKey: "cardDetail", onPop: vi.fn() }),
    );

    // A bare history.pushState reaches the router as a real PUSH navigation
    // (@tanstack/history patches it), and scroll restoration then scrolls to
    // the top for the unknown key.
    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ resetScroll: false }));
  });

  it("pushes nothing while inactive", () => {
    const onPop = vi.fn();
    renderHook(() => useOverlayHistoryEntry({ active: false, stateKey: "cardDetail", onPop }));

    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(navigateMock).not.toHaveBeenCalled();
    expect(onPop).not.toHaveBeenCalled();
  });

  it("runs onPop when the entry is popped", () => {
    const onPop = vi.fn();
    renderHook(() => useOverlayHistoryEntry({ active: true, stateKey: "cardDetail", onPop }));

    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(onPop).toHaveBeenCalledTimes(1);
  });

  it("uses the newest onPop without pushing a second entry", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onPop }: { onPop: () => void }) =>
        useOverlayHistoryEntry({ active: true, stateKey: "cardDetail", onPop }),
      { initialProps: { onPop: first } },
    );

    rerender({ onPop: second });
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    // A second entry would need a second back press to undo.
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops listening once unmounted", () => {
    const onPop = vi.fn();
    const { unmount } = renderHook(() =>
      useOverlayHistoryEntry({ active: true, stateKey: "cardDetail", onPop }),
    );

    unmount();
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(onPop).not.toHaveBeenCalled();
  });

  it("keeps two overlays on one page apart", () => {
    const onPop = vi.fn();
    renderHook(() =>
      useOverlayHistoryEntry({ active: true, stateKey: "missingCardDetail", onPop }),
    );

    const options = navigateMock.mock.calls[0]?.[0];
    expect(options.state({ __TSR_index: 0 })).toEqual({
      __TSR_index: 0,
      missingCardDetail: true,
    });
  });
});

describe("closeOverlayHistoryEntry", () => {
  it("pops the pushed entry instead of leaving it behind", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const close = vi.fn();
    history.pushState({ cardDetail: true }, "");

    closeOverlayHistoryEntry("cardDetail", close);

    expect(back).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes directly when the entry is not there", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const close = vi.fn();

    closeOverlayHistoryEntry("cardDetail", close);

    expect(back).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ignores another overlay's entry", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const close = vi.fn();
    history.pushState({ missingCardDetail: true }, "");

    closeOverlayHistoryEntry("cardDetail", close);

    expect(back).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("hasOverlayHistoryEntry", () => {
  it("reports the flag on the top entry", () => {
    history.pushState({ cardDetail: true }, "");

    expect(hasOverlayHistoryEntry("cardDetail")).toBe(true);
    expect(hasOverlayHistoryEntry("missingCardDetail")).toBe(false);
  });

  it("is false with no state at all", () => {
    expect(hasOverlayHistoryEntry("cardDetail")).toBe(false);
  });
});
