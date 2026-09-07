import { describe, expect, it, vi } from "vitest";

import {
  cardHoverProps,
  rowActivateProps,
  rowControlClick,
} from "@/features/cards/lib/card-row-interactions";

describe("cardHoverProps", () => {
  it("returns nothing without a handler", () => {
    expect(cardHoverProps(undefined, "card-1")).toEqual({});
  });

  it("reports the card and printing on enter", () => {
    const onHover = vi.fn();
    cardHoverProps(onHover, "card-1", "printing-9").onMouseEnter?.(
      {} as React.MouseEvent<HTMLElement>,
    );
    expect(onHover).toHaveBeenCalledWith("card-1", "printing-9");
  });

  it("passes an absent printing through untouched", () => {
    const onHover = vi.fn();
    cardHoverProps(onHover, "card-1").onMouseEnter?.({} as React.MouseEvent<HTMLElement>);
    expect(onHover).toHaveBeenCalledWith("card-1", undefined);
  });

  it("clears the hover on leave", () => {
    const onHover = vi.fn();
    cardHoverProps(onHover, "card-1", "printing-9").onMouseLeave?.(
      {} as React.MouseEvent<HTMLElement>,
    );
    expect(onHover).toHaveBeenCalledWith(null);
  });
});

/** A key event as the row itself sees it: dispatched on the row, not a child. */
function keyEvent(key: string, preventDefault: () => void): React.KeyboardEvent<HTMLElement> {
  const row = {};
  return {
    key,
    preventDefault,
    target: row,
    currentTarget: row,
  } as unknown as React.KeyboardEvent<HTMLElement>;
}

describe("rowActivateProps", () => {
  it("leaves the row inert without a handler", () => {
    expect(rowActivateProps()).toEqual({});
  });

  it("gives the row button semantics and a tab stop", () => {
    const props = rowActivateProps(vi.fn());
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
  });

  it("activates on click", () => {
    const onActivate = vi.fn();
    rowActivateProps(onActivate).onClick?.({} as React.MouseEvent<HTMLElement>);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it.each(["Enter", " "])("activates on %s and suppresses the default", (key) => {
    const onActivate = vi.fn();
    const preventDefault = vi.fn();
    rowActivateProps(onActivate).onKeyDown?.(keyEvent(key, preventDefault));
    expect(onActivate).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("ignores other keys so typing and tabbing still work", () => {
    const onActivate = vi.fn();
    const preventDefault = vi.fn();
    rowActivateProps(onActivate).onKeyDown?.(keyEvent("Tab", preventDefault));
    expect(onActivate).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("leaves Space to a control inside the row", () => {
    const onActivate = vi.fn();
    const preventDefault = vi.fn();
    const row = {};
    rowActivateProps(onActivate).onKeyDown?.({
      key: " ",
      preventDefault,
      target: {},
      currentTarget: row,
    } as unknown as React.KeyboardEvent<HTMLElement>);
    expect(onActivate).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("rowControlClick", () => {
  it("keeps a control's click off the row", () => {
    const stopPropagation = vi.fn();
    rowControlClick()({ stopPropagation } as unknown as React.MouseEvent<HTMLElement>);
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("still runs the control's own handler", () => {
    const onClick = vi.fn();
    const event = { stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLElement>;
    rowControlClick(onClick)(event);
    expect(onClick).toHaveBeenCalledWith(event);
  });
});
