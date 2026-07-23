import { fireEvent, render, screen } from "@testing-library/react";
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

  it("moves focus to the filter input on mount when searchable", () => {
    const { container } = render(
      <PickerList searchPlaceholder="Filter…" highlightedId="a" onHighlightChange={() => {}}>
        <PickerRow value="a" keywords={["Alpha"]}>
          Alpha
        </PickerRow>
      </PickerList>,
    );
    const input = container.querySelector('[data-slot="command-input"]');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("filters rows by keywords, case-insensitively", () => {
    render(
      <PickerList searchPlaceholder="Filter…" highlightedId="" onHighlightChange={() => {}}>
        <PickerRow value="id-a" keywords={["Alpha"]}>
          Alpha
        </PickerRow>
        <PickerRow value="id-b" keywords={["Beta"]}>
          Beta
        </PickerRow>
      </PickerList>,
    );
    fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "alp" } });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("never matches the query against row values (opaque ids)", () => {
    render(
      <PickerList searchPlaceholder="Filter…" highlightedId="" onHighlightChange={() => {}}>
        <PickerRow value="id-a" keywords={["Alpha"]}>
          Alpha
        </PickerRow>
        <PickerRow value="id-b" keywords={["Beta"]}>
          Beta
        </PickerRow>
      </PickerList>,
    );
    fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "id-" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("shows all rows again when the query is cleared", () => {
    render(
      <PickerList searchPlaceholder="Filter…" highlightedId="" onHighlightChange={() => {}}>
        <PickerRow value="id-a" keywords={["Alpha"]}>
          Alpha
        </PickerRow>
        <PickerRow value="id-b" keywords={["Beta"]}>
          Beta
        </PickerRow>
      </PickerList>,
    );
    const input = screen.getByPlaceholderText("Filter…");
    fireEvent.change(input, { target: { value: "beta" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });
});
