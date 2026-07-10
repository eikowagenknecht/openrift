import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PickerList, PickerRow } from "./picker-list";

describe("PickerList", () => {
  // cmdk's keyboard handling only works while focus lives inside the Command
  // root, so the picker must grab focus on mount. This replaced the `autoFocus`
  // DOM attribute (which scrolled the picker into view and jumped virtualized
  // grids); the focus must still land, just without the scroll.
  it("moves focus to the Command root on mount", () => {
    const { container } = render(
      <PickerList highlightedId="a" onHighlightChange={() => {}}>
        <PickerRow value="a">Alpha</PickerRow>
        <PickerRow value="b">Beta</PickerRow>
      </PickerList>,
    );
    const root = container.querySelector('[data-slot="command"]');
    expect(root).not.toBeNull();
    expect(document.activeElement).toBe(root);
  });
});
