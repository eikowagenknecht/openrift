import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

  // Alpha's score is null. The comparator pushes nulls behind every real
  // value, and the descending pass negates that result, so they lead instead
  // of trailing. Pinned in both directions because the sort comparator is
  // ours, not the library's.
  it("sorts null values behind real ones when ascending", () => {
    renderScored({ column: "Score", direction: "asc" });
    expect(renderedLabels()).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("sorts null values ahead of real ones when descending", () => {
    renderScored({ column: "Score", direction: "desc" });
    expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("leaves rows in source order when no column is sorted", () => {
    renderScored();
    expect(renderedLabels()).toEqual(["Beta", "Alpha", "Gamma"]);
  });
});
