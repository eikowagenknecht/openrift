import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OwnedCountStrip } from "./owned-count-strip";

describe("OwnedCountStrip", () => {
  it("renders the count without requiring a FilterSearchProvider when no printingId is given", () => {
    // /promos renders this strip outside the cards-browser routing context, so
    // the simple variant must be provider-free. The popover variant (printingId
    // + cardName + shortCode) calls useFilterValues and would throw here.
    const { container } = render(<OwnedCountStrip count={3} />);
    expect(container.textContent).toContain("3");
  });
});
