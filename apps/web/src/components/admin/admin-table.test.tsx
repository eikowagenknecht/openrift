import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { flatReorder } from "@/lib/admin-reorder";

import type { AdminCellSlotProps, AdminColumnDef } from "./admin-table";
import { AdminTable } from "./admin-table";

interface Row {
  slug: string;
  label: string;
}

function LabelCell({ row }: AdminCellSlotProps<Row>) {
  if (!row) {
    return null;
  }
  return <span>{row.label}</span>;
}

const columns: AdminColumnDef<Row>[] = [
  {
    header: "Label",
    cell: <LabelCell />,
  },
];

const row: Row = { slug: "some-set", label: "Some Set" };

function renderTable(onDelete: (row: Row) => Promise<unknown>) {
  return render(
    <AdminTable
      columns={columns}
      data={[row]}
      getRowKey={(r) => r.slug}
      delete={{
        onDelete,
        confirm: (r) => ({
          title: `Delete ${r.label}?`,
          description: "This cannot be undone.",
        }),
      }}
    />,
  );
}

// Regression: the destructive confirm button used to render through the
// AlertDialog's native Close trigger, which closes the dialog synchronously
// on click, before the async onDelete promise ever settles. A rejection
// (e.g. the server refusing to delete a set still in use) was therefore
// invisible: the dialog had already vanished by the time the error arrived.
describe("AdminTable delete confirmation", () => {
  it("keeps the dialog open and shows the error when the delete rejects", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockRejectedValue(new Error("Set still has printings"));
    renderTable(onDelete);

    // The trigger is the only button rendered (no edit/actions config), and
    // it's icon-only with no accessible name.
    await user.click(screen.getByRole("button"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(row);
    await vi.waitFor(() => {
      expect(screen.getByText("Set still has printings")).toBeInTheDocument();
    });

    // The old Close-trigger implementation also shows the error for a brief
    // instant, then closes the dialog anyway once the exit transition
    // finishes (unmounting the error along with it) — so the assertion above
    // alone doesn't pin the regression. Give any such delayed close a chance
    // to happen and confirm the dialog is still there afterwards.
    // oxlint-disable-next-line promise/avoid-new -- wrapping the setTimeout callback API to await a delay
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Set still has printings")).toBeInTheDocument();
  });

  it("closes the dialog once the delete resolves", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderTable(onDelete);

    await user.click(screen.getByRole("button"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(row);
    await vi.waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("closes the dialog instantly on cancel without calling delete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderTable(onDelete);

    await user.click(screen.getByRole("button"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onDelete).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});

// The sorted row model, the `sortFn` comparator and the header toggle are all
// plumbing the component owns rather than the table library, so pin the
// behavior they produce: sort order on load, on toggle, and where the nulls go.
describe("AdminTable sorting", () => {
  interface Scored {
    slug: string;
    label: string;
    score: number | null;
  }

  function ScoredLabelCell({ row: scored }: AdminCellSlotProps<Scored>) {
    if (!scored) {
      return null;
    }
    return <span>{scored.label}</span>;
  }

  const scoredColumns: AdminColumnDef<Scored>[] = [
    {
      header: "Label",
      sortValue: (r) => r.label,
      cell: <ScoredLabelCell />,
    },
    {
      header: "Score",
      sortValue: (r) => r.score,
      cell: <ScoredLabelCell />,
    },
  ];

  const scoredData: Scored[] = [
    { slug: "b", label: "Beta", score: 2 },
    { slug: "a", label: "Alpha", score: null },
    { slug: "c", label: "Gamma", score: 1 },
  ];

  function renderScored(defaultSort?: { column: string; direction: "asc" | "desc" }) {
    render(
      <AdminTable
        columns={scoredColumns}
        data={scoredData}
        getRowKey={(r) => r.slug}
        defaultSort={defaultSort}
      />,
    );
  }

  /**
   * Reads the rendered label column top to bottom.
   * @returns The row labels in render order.
   */
  function renderedLabels(): string[] {
    return screen
      .getAllByRole("row")
      .slice(1) // header row
      .map((tr) => within(tr).getAllByRole("cell")[0].textContent ?? "");
  }

  it("applies defaultSort on first render", () => {
    renderScored({ column: "Label", direction: "asc" });
    expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("reverses the order when the header is clicked", async () => {
    const user = userEvent.setup();
    renderScored({ column: "Label", direction: "asc" });

    await user.click(screen.getByText("Label"));

    expect(renderedLabels()).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  // Alpha's score is null. A blank is not the answer to "highest first" and it
  // is not the answer to "lowest first" either, so it trails both ways, which
  // is also how the server orders a nullable column.
  it("sorts blank values behind real ones when ascending", () => {
    renderScored({ column: "Score", direction: "asc" });
    expect(renderedLabels()).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("keeps blank values behind real ones when descending", () => {
    renderScored({ column: "Score", direction: "desc" });
    expect(renderedLabels()).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("sorts on an explicit id when two columns would otherwise share a label", async () => {
    const user = userEvent.setup();
    render(
      <AdminTable
        columns={[
          {
            id: "label",
            header: "Name",
            sortValue: (r: Scored) => r.label,
            cell: <ScoredLabelCell />,
          },
          {
            id: "score",
            header: "Name",
            sortValue: (r: Scored) => r.score,
            cell: <ScoredLabelCell />,
          },
        ]}
        data={scoredData}
        getRowKey={(r) => r.slug}
        defaultSort={{ column: "score", direction: "asc" }}
      />,
    );

    expect(renderedLabels()).toEqual(["Gamma", "Beta", "Alpha"]);

    await user.click(screen.getAllByText("Name")[0]);

    expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("opens a client-sorted column the way sortFirst asks, not the way its value type suggests", async () => {
    const user = userEvent.setup();
    render(
      <AdminTable
        columns={[
          {
            header: "Label",
            sortFirst: "desc",
            sortValue: (r: Scored) => r.label,
            cell: <ScoredLabelCell />,
          },
        ]}
        data={scoredData}
        getRowKey={(r) => r.slug}
      />,
    );

    await user.click(screen.getByText("Label"));

    expect(renderedLabels()).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("leaves rows in source order when no column is sorted", () => {
    renderScored();
    expect(renderedLabels()).toEqual(["Beta", "Alpha", "Gamma"]);
  });
});

describe("AdminTable server sorting", () => {
  const serverColumns: AdminColumnDef<Row>[] = [
    { header: "Label", sortKey: "label", sortFirst: "desc", cell: <LabelCell /> },
    { header: "Name", sortKey: "name", sortFirst: "asc", cell: <LabelCell /> },
    { header: "Slug", cell: <LabelCell /> },
  ];

  const serverData: Row[] = [
    { slug: "b", label: "Beta" },
    { slug: "a", label: "Alpha" },
  ];

  function renderServerSorted(
    onChange: (sort: { key: string | null; direction: "asc" | "desc" }) => void,
    direction: "asc" | "desc" = "desc",
    key = "label",
  ) {
    render(
      <AdminTable
        columns={serverColumns}
        data={serverData}
        getRowKey={(r) => r.slug}
        serverSort={{ key, direction, onChange }}
      />,
    );
  }

  it("reports the click instead of reordering the page it was given", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderServerSorted(onChange);

    await user.click(screen.getByText("Label"));

    expect(onChange).toHaveBeenCalledWith({ key: "label", direction: "asc" });
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((tr) => within(tr).getAllByRole("cell")[0].textContent),
    ).toEqual(["Beta", "Alpha"]);
  });

  it("opens a column that is not the active one descending", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderServerSorted(onChange, "asc", "startAt");

    await user.click(screen.getByText("Label"));

    expect(onChange).toHaveBeenCalledWith({ key: "label", direction: "desc" });
  });

  it("opens a column ascending when that is the direction it asks for", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderServerSorted(onChange);

    await user.click(screen.getByText("Name"));

    expect(onChange).toHaveBeenCalledWith({ key: "name", direction: "asc" });
  });

  it("takes the sort off once the active column has been through both directions", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderServerSorted(onChange, "asc");

    await user.click(screen.getByText("Label"));

    expect(onChange).toHaveBeenCalledWith({ key: null, direction: "asc" });
  });

  it("leaves a column without a sort key inert", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderServerSorted(onChange);

    await user.click(screen.getByText("Slug"));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("AdminTable sortable headers", () => {
  const headerColumns: AdminColumnDef<Row>[] = [
    { header: "Label", sortKey: "label", cell: <LabelCell /> },
    { header: "Name", sortKey: "name", cell: <LabelCell /> },
    { header: "Slug", cell: <LabelCell /> },
  ];

  function renderHeaders(
    onChange: (sort: { key: string | null; direction: "asc" | "desc" }) => void,
    direction: "asc" | "desc" = "asc",
  ) {
    render(
      <AdminTable
        columns={headerColumns}
        data={[row]}
        getRowKey={(r) => r.slug}
        serverSort={{ key: "label", direction, onChange }}
      />,
    );
  }

  function headerCell(name: string) {
    return screen.getAllByRole("columnheader").find((th) => th.textContent?.startsWith(name));
  }

  it("announces the active column's order to a screen reader", () => {
    renderHeaders(vi.fn(), "desc");

    expect(headerCell("Label")).toHaveAttribute("aria-sort", "descending");
    expect(headerCell("Name")).toHaveAttribute("aria-sort", "none");
  });

  it("leaves aria-sort off a column that cannot be sorted", () => {
    renderHeaders(vi.fn());

    expect(headerCell("Slug")).not.toHaveAttribute("aria-sort");
  });

  it("sorts from the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderHeaders(onChange);

    await user.tab();
    expect(screen.getByRole("button", { name: "Label" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith({ key: "label", direction: "desc" });
  });
});

// The drag itself is dnd-kit's (pointer simulation in jsdom buys little), but
// everything around it is this component's: which buttons are live at the ends
// of the list, what the arrows commit, and that the dropped order stays on
// screen until the save comes back.
describe("AdminTable reorder", () => {
  const reorderRows: Row[] = [
    { slug: "a", label: "Alpha" },
    { slug: "b", label: "Beta" },
    { slug: "c", label: "Gamma" },
  ];

  function renderReorder(onReorder: (keys: string[]) => Promise<unknown>) {
    return render(
      <AdminTable
        columns={columns}
        data={reorderRows}
        getRowKey={(r) => r.slug}
        reorder={{
          moves: flatReorder(reorderRows, (r) => r.slug),
          onReorder,
        }}
      />,
    );
  }

  /**
   * Reads the rendered label column top to bottom.
   * @returns The row labels in render order.
   */
  function renderedLabels(): string[] {
    return screen
      .getAllByRole("row")
      .slice(1) // header row
      .map((tr) => within(tr).getAllByRole("cell").at(-1)?.textContent ?? "");
  }

  it("gives every row a drag handle", () => {
    renderReorder(vi.fn().mockResolvedValue(undefined));
    expect(screen.getAllByRole("button", { name: "Drag to reorder" })).toHaveLength(3);
  });

  it("disables the arrows that would push a row out of the list", () => {
    renderReorder(vi.fn().mockResolvedValue(undefined));
    const up = screen.getAllByRole("button", { name: "Move up" });
    const down = screen.getAllByRole("button", { name: "Move down" });

    expect(up[0]).toBeDisabled();
    expect(up[1]).toBeEnabled();
    expect(down[2]).toBeDisabled();
    expect(down[1]).toBeEnabled();
  });

  it("sends the whole key list when a row steps down", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn().mockResolvedValue(undefined);
    renderReorder(onReorder);

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]);

    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  // The reorder mutations only invalidate, so the `data` prop still holds the
  // old order for as long as the refetch takes. Without the pending order the
  // row would visibly snap back in the meantime.
  it("keeps showing the new order while the save is in flight", async () => {
    const user = userEvent.setup();
    let settle = () => {};
    // oxlint-disable-next-line promise/avoid-new -- a promise the test resolves by hand to hold the save open
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    renderReorder(() => pending);

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]);

    expect(renderedLabels()).toEqual(["Beta", "Alpha", "Gamma"]);
    // A second move can't be computed off the stale order, so it stays locked.
    expect(screen.getAllByRole("button", { name: "Move down" })[0]).toBeDisabled();
    settle();
  });

  it("falls back to the server order when the save fails", async () => {
    const user = userEvent.setup();
    renderReorder(vi.fn().mockRejectedValue(new Error("nope")));

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]);

    await vi.waitFor(() => {
      expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
    });
  });
});
