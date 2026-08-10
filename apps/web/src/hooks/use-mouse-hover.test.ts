import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it } from "vitest";

import { useMouseHover } from "./use-mouse-hover";

function pointerEvent(pointerType: string): PointerEvent {
  return { pointerType } as PointerEvent;
}

describe("useMouseHover", () => {
  it("starts unhovered", () => {
    const { result } = renderHook(() => useMouseHover());
    expect(result.current.hovering).toBe(false);
  });

  it("hovers on a mouse enter and un-hovers on the matching leave", () => {
    const { result } = renderHook(() => useMouseHover());

    act(() => result.current.hoverProps.onPointerEnter(pointerEvent("mouse")));
    expect(result.current.hovering).toBe(true);

    act(() => result.current.hoverProps.onPointerLeave(pointerEvent("mouse")));
    expect(result.current.hovering).toBe(false);
  });

  it("ignores a touch enter", () => {
    // iOS Safari synthesizes hover on tap. Reacting to it opened the trades
    // card preview over most of the phone screen, with no leave to close it.
    const { result } = renderHook(() => useMouseHover());

    act(() => result.current.hoverProps.onPointerEnter(pointerEvent("touch")));
    expect(result.current.hovering).toBe(false);
  });

  it("ignores a pen enter", () => {
    const { result } = renderHook(() => useMouseHover());

    act(() => result.current.hoverProps.onPointerEnter(pointerEvent("pen")));
    expect(result.current.hovering).toBe(false);
  });

  it("keeps a mouse hover alive when a touch leave arrives", () => {
    // A hybrid device can interleave the two. Only the pointer that opened the
    // hover should close it.
    const { result } = renderHook(() => useMouseHover());

    act(() => result.current.hoverProps.onPointerEnter(pointerEvent("mouse")));
    act(() => result.current.hoverProps.onPointerLeave(pointerEvent("touch")));
    expect(result.current.hovering).toBe(true);
  });
});
