import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { useNumericDraft } from "./use-numeric-draft";

const change = (text: string) => ({ target: { value: text } }) as ChangeEvent<HTMLInputElement>;

describe("useNumericDraft", () => {
  it("shows the committed display until something is typed", () => {
    const { result } = renderHook(() => useNumericDraft({ display: "3", onCommit: () => {} }));

    expect(result.current.inputProps.value).toBe("3");
  });

  it("keeps the typed text even when the display clamps it away", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ display }: { display: string }) => useNumericDraft({ display, onCommit }),
      { initialProps: { display: "1" } },
    );

    act(() => result.current.inputProps.onChange(change("")));
    rerender({ display: "1" });

    expect(onCommit).toHaveBeenCalledWith("");
    expect(result.current.inputProps.value).toBe("");
  });

  it("falls back to the display once the field loses focus", () => {
    const { result } = renderHook(() => useNumericDraft({ display: "1", onCommit: () => {} }));

    act(() => result.current.inputProps.onChange(change("")));
    act(() => result.current.inputProps.onBlur());

    expect(result.current.inputProps.value).toBe("1");
  });

  it("drops the draft on an explicit reset", () => {
    const { result } = renderHook(() => useNumericDraft({ display: "2", onCommit: () => {} }));

    act(() => result.current.inputProps.onChange(change("7")));
    act(() => result.current.resetDraft());

    expect(result.current.inputProps.value).toBe("2");
  });

  it("tracks a display that moves while the field is untouched", () => {
    const { result, rerender } = renderHook(
      ({ display }: { display: string }) => useNumericDraft({ display, onCommit: () => {} }),
      { initialProps: { display: "2" } },
    );

    rerender({ display: "5" });

    expect(result.current.inputProps.value).toBe("5");
  });
});
