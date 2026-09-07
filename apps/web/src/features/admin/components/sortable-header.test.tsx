import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SortedState } from "./sortable-header";
import { SortableHeader, ariaSort } from "./sortable-header";

type ColumnProp = Parameters<typeof SortableHeader>[0]["column"];

// The stub carries only the three methods the header reads, where the real prop
// is a whole react-table column bound to the admin card tables' feature set.
function column({
  canSort = true,
  sorted = false as SortedState,
  toggle = vi.fn(),
}: { canSort?: boolean; sorted?: SortedState; toggle?: () => void } = {}) {
  return {
    column: {
      getCanSort: () => canSort,
      getIsSorted: () => sorted,
      getToggleSortingHandler: () => toggle,
    } as unknown as ColumnProp,
    toggle,
  };
}

describe("ariaSort", () => {
  it("announces an ascending column", () => {
    expect(ariaSort("asc")).toBe("ascending");
  });

  it("announces a descending column", () => {
    expect(ariaSort("desc")).toBe("descending");
  });

  it("announces a sortable column no one has sorted yet", () => {
    expect(ariaSort(false)).toBe("none");
  });
});

describe("SortableHeader", () => {
  it("gives a sortable column a control rather than plain text", () => {
    const { column: col } = column();
    render(<SortableHeader column={col} label="Card" />);
    expect(screen.getByRole("button", { name: "Card" })).toBeInTheDocument();
  });

  it("sorts on a click", async () => {
    const user = userEvent.setup();
    const { column: col, toggle } = column();
    render(<SortableHeader column={col} label="Card" />);

    await user.click(screen.getByRole("button", { name: "Card" }));

    expect(toggle).toHaveBeenCalled();
  });

  it("sorts from the keyboard, so the header is not mouse-only", async () => {
    const user = userEvent.setup();
    const { column: col, toggle } = column();
    render(<SortableHeader column={col} label="Card" />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(toggle).toHaveBeenCalled();
  });

  it("leaves a column that cannot sort as plain text", () => {
    const { column: col } = column({ canSort: false });
    render(<SortableHeader column={col} label="Slug" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Slug")).toBeInTheDocument();
  });
});
