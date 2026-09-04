import type { Virtualizer } from "@tanstack/react-virtual";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VRow } from "./card-grid-types";
import { useStickyHeader } from "./use-sticky-header";

const SCROLL_MARGIN = 200;
const STICKY_OFFSET = 100;
const HEADER_HEIGHT = 40;

const header = (id: string): VRow => ({
  kind: "header",
  group: { id, slug: id, name: id.toUpperCase() },
  cardCount: 4,
});
const cards = (): VRow => ({ kind: "cards", items: [], cardsBefore: 0 });

// Two groups: header "a" at the container's top, header "b" 400px down.
const VIRTUAL_ROWS: VRow[] = [header("a"), cards(), header("b"), cards()];
const ROW_STARTS = [0, 40, 400, 440];

let getVirtualItems: ReturnType<typeof vi.fn>;

function makeVirtualizer() {
  getVirtualItems = vi.fn(() => [
    { index: 0, start: SCROLL_MARGIN + 0 },
    { index: 2, start: SCROLL_MARGIN + 400 },
  ]);
  return { getVirtualItems } as unknown as Virtualizer<Window, Element>;
}

function params(overrides: { multipleGroups?: boolean } = {}) {
  return {
    multipleGroups: overrides.multipleGroups ?? true,
    virtualRows: VIRTUAL_ROWS,
    rowStarts: ROW_STARTS,
    virtualizer: makeVirtualizer(),
    scrollMargin: SCROLL_MARGIN,
    stickyOffset: STICKY_OFFSET,
    headerHeight: HEADER_HEIGHT,
  };
}

// Animation frames are queued by hand so a test can assert on what has and has
// not run yet. cancelAnimationFrame must actually neutralize the callback: the
// hook relies on it to drop a pending pass on unmount.
let frames: FrameRequestCallback[];

function flushFrames() {
  const pending = frames;
  frames = [];
  act(() => {
    for (const cb of pending) {
      cb(0);
    }
  });
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = () => undefined;
  });
  vi.stubGlobal("scrollY", 0);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useStickyHeader", () => {
  it("reads no layout during the commit, only on the next frame", () => {
    const { result } = renderHook(() => useStickyHeader(params()));

    // The forced layout this hook performs must not sit inside the commit that
    // a filter change just produced — that cost lands on time-to-new-cards.
    expect(getVirtualItems).not.toHaveBeenCalled();
    expect(result.current).toBeNull();

    flushFrames();
    expect(getVirtualItems).toHaveBeenCalled();
  });

  it("activates the last header whose row has scrolled out of view", () => {
    vi.stubGlobal("scrollY", 550);
    const { result } = renderHook(() => useStickyHeader(params()));

    flushFrames();
    expect(result.current?.kind).toBe("header");
    expect(result.current?.group.id).toBe("b");
  });

  it("activates as soon as the row's bottom edge reaches the threshold", () => {
    // threshold 440 = header "b" (400) plus its 40px row.
    vi.stubGlobal("scrollY", 540);
    const { result } = renderHook(() => useStickyHeader(params()));

    flushFrames();
    expect(result.current?.group.id).toBe("b");
  });

  it("activates nothing at the top of the page", () => {
    const { result } = renderHook(() => useStickyHeader(params()));

    flushFrames();
    expect(result.current).toBeNull();
  });

  it("hides the overlay when the real header sits at the sticky position", () => {
    // threshold lands exactly on header "b" (400), so the real one is already
    // in place and the floating copy would double it up.
    vi.stubGlobal("scrollY", 500);
    const { result } = renderHook(() => useStickyHeader(params()));

    flushFrames();
    expect(result.current).toBeNull();
  });

  it("hides the overlay while the real header is sliding under the toolbar", () => {
    // Header "b" has crossed the threshold by 20px of its 40px row: part of it
    // is still visible, and the previous group's cards are gone, so neither
    // group's label belongs in the overlay.
    vi.stubGlobal("scrollY", 520);
    const { result } = renderHook(() => useStickyHeader(params()));

    flushFrames();
    expect(result.current).toBeNull();
  });

  it("keeps updating on scroll after the first frame", () => {
    const { result } = renderHook(() => useStickyHeader(params()));
    flushFrames();
    expect(result.current).toBeNull();

    vi.stubGlobal("scrollY", 550);
    act(() => {
      globalThis.dispatchEvent(new Event("scroll"));
    });
    expect(result.current?.group.id).toBe("b");
  });

  it("clears the active header when the grid collapses to one group", () => {
    vi.stubGlobal("scrollY", 550);
    const { result, rerender } = renderHook(
      (props: { multipleGroups: boolean }) => useStickyHeader(params(props)),
      { initialProps: { multipleGroups: true } },
    );
    flushFrames();
    expect(result.current?.group.id).toBe("b");

    rerender({ multipleGroups: false });
    expect(result.current).toBeNull();
  });

  it("drops the pending frame when it unmounts first", () => {
    const { unmount } = renderHook(() => useStickyHeader(params()));
    unmount();

    flushFrames();
    expect(getVirtualItems).not.toHaveBeenCalled();
  });

  it("stops listening to scroll after unmount", () => {
    const { unmount } = renderHook(() => useStickyHeader(params()));
    flushFrames();
    getVirtualItems.mockClear();

    unmount();
    act(() => {
      globalThis.dispatchEvent(new Event("scroll"));
    });
    expect(getVirtualItems).not.toHaveBeenCalled();
  });
});
