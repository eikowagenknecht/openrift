import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "./date-picker";

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector("input");
  if (!input) {
    throw new Error("input not found");
  }
  return input;
}

describe("DatePicker", () => {
  it("shows the initial value", () => {
    const { container } = render(<DatePicker value="2026-07-27" />);
    expect(getInput(container).value).toBe("2026-07-27");
  });

  it("shows a value set after mount (the wizard's client-only prefill)", () => {
    const { container, rerender } = render(<DatePicker value="" />);
    expect(getInput(container).value).toBe("");

    rerender(<DatePicker value="2026-07-27" />);
    expect(getInput(container).value).toBe("2026-07-27");
  });

  it("clears the text when the value is cleared externally", () => {
    const { container, rerender } = render(<DatePicker value="2026-07-27" />);
    rerender(<DatePicker value="" />);
    expect(getInput(container).value).toBe("");
  });

  it("keeps partial typing when the value prop is unchanged", () => {
    const { container, rerender } = render(<DatePicker value="2026-07-27" />);
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "2026-08" } });
    expect(input.value).toBe("2026-08");

    // A parent re-render with the same value must not clobber the draft.
    rerender(<DatePicker value="2026-07-27" />);
    expect(input.value).toBe("2026-08");
  });

  it("emits onChange only for complete dates", () => {
    const onChange = vi.fn();
    const { container } = render(<DatePicker value="" onChange={onChange} />);
    const input = getInput(container);

    fireEvent.change(input, { target: { value: "2026-08" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "2026-08-01" } });
    expect(onChange).toHaveBeenCalledWith("2026-08-01");
  });

  it("calls onClear when the text is emptied", () => {
    const onClear = vi.fn();
    const { container } = render(<DatePicker value="2026-07-27" onClear={onClear} />);
    fireEvent.change(getInput(container), { target: { value: "" } });
    expect(onClear).toHaveBeenCalled();
  });
});
