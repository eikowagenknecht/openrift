import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardScatter } from "./card-scatter";

describe("CardScatter", () => {
  it("renders the decorative floating cards as buttons", () => {
    const { container } = render(<CardScatter />);
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("keeps the floating cards out of the keyboard tab order", () => {
    // The cards live inside an aria-hidden decorative minigame and are clickable
    // via pointer-events, but TAB should skip them. Native <button> elements are
    // focusable by default (tabIndex 0), so each must be explicitly removed.
    const { container } = render(<CardScatter />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.tabIndex).toBe(-1);
    }
  });
});
