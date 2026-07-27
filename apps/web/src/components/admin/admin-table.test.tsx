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
