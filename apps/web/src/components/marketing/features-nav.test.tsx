import { act, renderHook } from "@testing-library/react";
import type { MouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smoothAnchorClick, useActiveChapter } from "./features-nav";

const CHAPTER_IDS = ["collect", "build", "play"];

// jsdom's viewport, so the reading line sits at 256px.
const VIEWPORT_HEIGHT = 768;
const ABOVE_LINE = 100;
const BELOW_LINE = 600;

let tops: Record<string, number> = {};
let observers: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const nativeIntersectionObserver = globalThis.IntersectionObserver;

function mountDivider(id: string) {
  const element = document.createElement("div");
  element.id = `chapter-${id}`;
  element.getBoundingClientRect = () => ({ top: tops[id] ?? 0 }) as unknown as DOMRect;
  document.body.append(element);
}

function mountDividers(ids: string[]) {
  for (const id of ids) {
    mountDivider(id);
  }
}

function scroll(next: Record<string, number>) {
  tops = { ...tops, ...next };
  act(() => {
    for (const observer of observers) {
      observer.callback([], observer as unknown as IntersectionObserver);
    }
  });
}

describe("useActiveChapter", () => {
  beforeEach(() => {
    window.innerHeight = VIEWPORT_HEIGHT;
    tops = Object.fromEntries(CHAPTER_IDS.map((id, index) => [id, BELOW_LINE + index * 1000]));
    observers = [];
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = nativeIntersectionObserver;
    document.body.innerHTML = "";
  });

  it("is null while every divider is still below the reading line", () => {
    mountDividers(CHAPTER_IDS);
    const { result } = renderHook(() => useActiveChapter(CHAPTER_IDS));
    expect(result.current).toBeNull();
  });

  it("activates a chapter once its divider passes the reading line", () => {
    mountDividers(CHAPTER_IDS);
    const { result } = renderHook(() => useActiveChapter(CHAPTER_IDS));

    scroll({ collect: ABOVE_LINE });

    expect(result.current).toBe("collect");
  });

  it("keeps a chapter active after its divider scrolls out of view", () => {
    mountDividers(CHAPTER_IDS);
    const { result } = renderHook(() => useActiveChapter(CHAPTER_IDS));

    scroll({ collect: -4000 });

    expect(result.current).toBe("collect");
  });

  it("advances to the next chapter when the following divider passes", () => {
    mountDividers(CHAPTER_IDS);
    const { result } = renderHook(() => useActiveChapter(CHAPTER_IDS));

    scroll({ collect: -900, build: ABOVE_LINE });

    expect(result.current).toBe("build");
  });

  it("falls back to the previous chapter when scrolling up again", () => {
    mountDividers(CHAPTER_IDS);
    const { result } = renderHook(() => useActiveChapter(CHAPTER_IDS));
    scroll({ collect: -900, build: ABOVE_LINE });

    scroll({ collect: -200, build: BELOW_LINE });

    expect(result.current).toBe("collect");
  });

  it("reports the last passed chapter when several dividers are above the line", () => {
    mountDividers(CHAPTER_IDS);
    const { result } = renderHook(() => useActiveChapter(CHAPTER_IDS));

    scroll({ collect: -2000, build: -1000, play: ABOVE_LINE });

    expect(result.current).toBe("play");
  });

  it("ignores chapter ids that have no divider on the page", () => {
    mountDividers(["collect"]);
    const { result } = renderHook(() => useActiveChapter(["collect", "missing"]));

    scroll({ collect: ABOVE_LINE });

    expect(result.current).toBe("collect");
  });

  it("stays null when the page renders no dividers at all", () => {
    const { result } = renderHook(() => useActiveChapter(CHAPTER_IDS));
    expect(result.current).toBeNull();
    expect(observers).toHaveLength(0);
  });
});

describe("smoothAnchorClick", () => {
  let reducedMotion = false;
  const nativeMatchMedia = globalThis.matchMedia;
  const nativeRaf = globalThis.requestAnimationFrame;
  const nativeCancelRaf = globalThis.cancelAnimationFrame;
  let rafClock = 0;
  let rafCalls = 0;

  function mountTarget(id: string, top: number): HTMLElement {
    const element = document.createElement("div");
    element.id = id;
    element.getBoundingClientRect = () => ({ top }) as unknown as DOMRect;
    document.body.append(element);
    return element;
  }

  function clickEvent(hash: string, overrides?: Partial<MouseEvent<HTMLAnchorElement>>) {
    return {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      currentTarget: { hash },
      preventDefault: vi.fn(),
      ...overrides,
    } as unknown as MouseEvent<HTMLAnchorElement>;
  }

  beforeEach(() => {
    reducedMotion = false;
    rafClock = 0;
    rafCalls = 0;
    globalThis.matchMedia = ((query: string) => ({
      matches: query.includes("reduce") && reducedMotion,
    })) as unknown as typeof matchMedia;
    // Synchronous frames 150ms apart, so the 450ms animation ends in a few steps.
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      rafCalls += 1;
      rafClock += 150;
      callback(rafClock);
      return rafCalls;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    window.scrollTo = vi.fn();
    vi.spyOn(history, "pushState").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.matchMedia = nativeMatchMedia;
    globalThis.requestAnimationFrame = nativeRaf;
    globalThis.cancelAnimationFrame = nativeCancelRaf;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("animates the window to the target instead of the default jump", () => {
    mountTarget("chapter-collect", 1000);
    const event = clickEvent("#chapter-collect");

    smoothAnchorClick(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(rafCalls).toBeGreaterThan(1);
    expect(vi.mocked(window.scrollTo).mock.lastCall).toEqual([0, 1000]);
  });

  it("jumps straight to the target when the viewer prefers reduced motion", () => {
    reducedMotion = true;
    mountTarget("chapter-collect", 1000);

    smoothAnchorClick(clickEvent("#chapter-collect"));

    expect(rafCalls).toBe(0);
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 1000);
  });

  it("keeps the browser default for modified clicks", () => {
    mountTarget("chapter-collect", 1000);
    const event = clickEvent("#chapter-collect", { ctrlKey: true });

    smoothAnchorClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("keeps the browser default when the anchor target does not exist", () => {
    const event = clickEvent("#chapter-missing");

    smoothAnchorClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
