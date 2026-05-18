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
  // Regression for /promos showing "set" in the group dropdown: the trigger
  // resolves its label by matching group.value against group.options. When
  // they don't match (e.g. URL default "set" on a promos-only options list),
  // the raw value leaks into the visible label. The fix is at the surface
  // (promos passes `groupByValue={asPromoGrouping(filterState.groupBy)}` so
  // the value always matches an option); these tests pin the contract.
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
    expect(container.textContent).not.toContain("channel ·"); // raw slug should not leak
  });

  it("falls back to the raw value when value isn't in the options list (avoid this at the surface)", () => {
    // This is the broken UX: "set" comes from the URL/default but isn't in
    // the promos group-by set. The surface must pass a normalized value to
    // avoid landing here.
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
