import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { CardCountStrip } from "./card-count-strip";

describe("CardCountStrip", () => {
  it("renders a read-only pill with the count when no controls are set", () => {
    render(<CardCountStrip count={3} />);
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("appends the wider-scope total when totalCount differs from count", () => {
    render(<CardCountStrip count={2} totalCount={5} />);
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("(5)")).toBeDefined();
  });

  it("omits the total when totalCount equals count", () => {
    render(<CardCountStrip count={4} totalCount={4} />);
    expect(screen.queryByText("(4)")).toBeNull();
  });

  it("dispatches decrement and increment handlers", async () => {
    const onDecrement = vi.fn();
    const onIncrement = vi.fn();
    render(
      <CardCountStrip
        count={2}
        decrement={{ onClick: onDecrement, ariaLabel: "Decrease Fire Dragon" }}
        increment={{ onClick: onIncrement, ariaLabel: "Increase Fire Dragon" }}
      />,
    );

    await userEvent.click(screen.getByLabelText("Increase Fire Dragon"));
    expect(onIncrement).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByLabelText("Decrease Fire Dragon"));
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it("respects per-button disabled state", async () => {
    const onDecrement = vi.fn();
    render(
      <CardCountStrip
        count={1}
        decrement={{ onClick: onDecrement, disabled: true, ariaLabel: "Decrease Fire Dragon" }}
        increment={{ onClick: () => {}, ariaLabel: "Increase Fire Dragon" }}
      />,
    );
    const minus = screen.getByLabelText("Decrease Fire Dragon") as HTMLButtonElement;
    expect(minus.disabled).toBe(true);
    await userEvent.click(minus);
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it("renders the pill as a button when onPillClick is set", async () => {
    const onPillClick = vi.fn();
    render(<CardCountStrip count={2} onPillClick={onPillClick} pillAriaLabel="Choose variant" />);
    await userEvent.click(screen.getByLabelText("Choose variant"));
    expect(onPillClick).toHaveBeenCalledTimes(1);
  });

  it("replaces the pill entirely with pillOverride", () => {
    render(
      <CardCountStrip count={0} pillOverride={<span data-testid="custom-pill">custom</span>} />,
    );
    expect(screen.getByTestId("custom-pill")).toBeDefined();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("uses a custom icon when supplied", () => {
    render(<CardCountStrip count={1} icon={ListIcon} />);
    // ListIcon is from lucide; verify count text — the icon presence is a smoke check via no-crash.
    expect(screen.getByText("1")).toBeDefined();
  });

  it("dims the pill when count is 0 and no diverging totalCount", () => {
    const { container } = render(<CardCountStrip count={0} />);
    const pill = container.querySelector("span[class*='opacity-50']");
    expect(pill).not.toBeNull();
  });
});
