import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SortGroupControls } from "./sort-group-controls";

const SORT_OPTIONS = [
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
];

const PROMO_GROUP_OPTIONS = [
  { value: "channel", label: "Distribution Channel" },
  { value: "card", label: "Card" },
  { value: "year", label: "Year" },
  { value: "marker", label: "Marker" },
];

const NOOP = () => {};

describe("SortGroupControls — group label resolution", () => {
  it("uses the option label when value matches a known option", () => {
    const { container } = render(
      <SortGroupControls
        sortOptions={SORT_OPTIONS}
        sortBy="id"
        sortDir="asc"
        onSortByChange={NOOP}
        onSortDirChange={NOOP}
        group={{
          options: PROMO_GROUP_OPTIONS,
          value: "channel",
          dir: "asc",
          onValueChange: NOOP,
          onDirChange: NOOP,
        }}
      />,
    );
    expect(container.textContent).toContain("Distribution Channel");
    expect(container.textContent).not.toContain("channel ·");
  });

  it("falls back to the raw value when value isn't in the options list (avoid this at the surface)", () => {
    const { container } = render(
      <SortGroupControls
        sortOptions={SORT_OPTIONS}
        sortBy="id"
        sortDir="asc"
        onSortByChange={NOOP}
        onSortDirChange={NOOP}
        group={{
          options: PROMO_GROUP_OPTIONS,
          value: "set",
          dir: "asc",
          onValueChange: NOOP,
          onDirChange: NOOP,
        }}
      />,
    );
    expect(container.textContent).toContain("set");
  });
});
