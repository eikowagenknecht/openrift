import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useActiveSection } from "./use-active-section";

function mountSections(tops: Record<string, number>): void {
  for (const [id, top] of Object.entries(tops)) {
    const element = document.createElement("div");
    element.id = id;
    element.getBoundingClientRect = () => ({ top }) as DOMRect;
    document.body.append(element);
  }
}

function setTop(id: string, top: number): void {
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (element) {
    element.getBoundingClientRect = () => ({ top }) as DOMRect;
  }
}

const entries = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useActiveSection", () => {
  it("returns null while every section sits below the threshold", () => {
    mountSections({ a: 200, b: 400, c: 600 });

    const { result } = renderHook(() => useActiveSection(entries, 100));

    expect(result.current).toBeNull();
  });

  it("picks the last section that has passed the threshold", () => {
    mountSections({ a: -300, b: -50, c: 500 });

    const { result } = renderHook(() => useActiveSection(entries, 100));

    expect(result.current).toBe("b");
  });

  it("allows a section four pixels below the threshold", () => {
    mountSections({ a: 104, b: 500, c: 700 });

    const { result } = renderHook(() => useActiveSection(entries, 100));

    expect(result.current).toBe("a");
  });

  it("skips sections that are not in the document", () => {
    mountSections({ a: -300, c: -100 });

    const { result } = renderHook(() => useActiveSection(entries, 100));

    expect(result.current).toBe("c");
  });

  it("recomputes on scroll", () => {
    mountSections({ a: -300, b: 400, c: 600 });

    const { result } = renderHook(() => useActiveSection(entries, 100));
    expect(result.current).toBe("a");

    act(() => {
      setTop("b", -20);
      globalThis.dispatchEvent(new Event("scroll"));
    });

    expect(result.current).toBe("b");
  });

  it("stops listening once unmounted", () => {
    mountSections({ a: -300, b: 400, c: 600 });

    const { result, unmount } = renderHook(() => useActiveSection(entries, 100));
    unmount();

    act(() => {
      setTop("b", -20);
      globalThis.dispatchEvent(new Event("scroll"));
    });

    expect(result.current).toBe("a");
  });
});
