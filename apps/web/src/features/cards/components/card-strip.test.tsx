import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CardStrip, StripActionButton, StripIconButton } from "./card-strip";

describe("CardStrip", () => {
  it("renders content in all three zones", () => {
    render(
      <CardStrip
        left={<span>left-content</span>}
        center={<span>center-content</span>}
        right={<span>right-content</span>}
      />,
    );
    expect(screen.getByText("left-content")).toBeDefined();
    expect(screen.getByText("center-content")).toBeDefined();
    expect(screen.getByText("right-content")).toBeDefined();
  });

  it("renders both side baskets even when empty so the center stays centered", () => {
    const { container } = render(<CardStrip center={<span>pill</span>} />);
    const row = container.firstElementChild;
    expect(row).not.toBeNull();
    expect(row?.children.length).toBe(3);
    expect(row?.children[0]?.className).toContain("flex-1");
    expect(row?.children[2]?.className).toContain("flex-1");
  });

  it("renders an empty row when no zones are provided (alignment placeholder)", () => {
    const { container } = render(<CardStrip />);
    expect(container.firstElementChild?.className).toContain("h-5");
  });
});

describe("StripIconButton", () => {
  it("fires its handler but stops propagation to the tile", async () => {
    const onTileClick = vi.fn();
    const onAction = vi.fn();
    render(
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stands in for the card tile's Pressable
      <div onClick={onTileClick}>
        <StripIconButton aria-label="Add one copy" onClick={onAction} />
      </div>,
    );
    await userEvent.click(screen.getByLabelText("Add one copy"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onTileClick).not.toHaveBeenCalled();
  });

  it("stays out of the tab order and respects disabled", async () => {
    const onAction = vi.fn();
    render(<StripIconButton aria-label="Add one copy" disabled onClick={onAction} />);
    const button = screen.getByLabelText("Add one copy") as HTMLButtonElement;
    expect(button.tabIndex).toBe(-1);
    expect(button.disabled).toBe(true);
    await userEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("StripActionButton", () => {
  it("fires its handler but stops propagation to the tile", async () => {
    const onTileClick = vi.fn();
    const onAction = vi.fn();
    render(
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stands in for the card tile's Pressable
      <div onClick={onTileClick}>
        <StripActionButton onClick={onAction}>Choose</StripActionButton>
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onTileClick).not.toHaveBeenCalled();
  });

  it("supports the destructive variant", () => {
    render(<StripActionButton variant="destructive">Remove</StripActionButton>);
    expect(screen.getByRole("button", { name: "Remove" })).toBeDefined();
  });
});
