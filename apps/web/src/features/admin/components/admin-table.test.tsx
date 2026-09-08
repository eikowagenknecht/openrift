import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { flatReorder } from "@/features/admin/lib/admin-reorder";

import type { AdminCellSlotProps, AdminColumnDef, AdminDraftSlotProps } from "./admin-table";
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

function DraftInput({ draft, setDraft }: AdminDraftSlotProps<Row>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <input
      aria-label="Label"
      value={draft.label}
      onChange={(event) => {
        const { value } = event.target;
        setDraft((prev) => ({ ...prev, label: value }));
      }}
    />
  );
}

const columns: AdminColumnDef<Row>[] = [
  {
    header: "Label",
    cell: <LabelCell />,
  },
];

const draftColumns: AdminColumnDef<Row>[] = [
  {
    header: "Label",
    cell: <LabelCell />,
    editCell: <DraftInput />,
    addCell: <DraftInput />,
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

describe("AdminTable delete confirmation", () => {
  it("keeps the dialog open with the error even after a delayed close would have fired", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockRejectedValue(new Error("Set still has printings"));
    renderTable(onDelete);

    await user.click(screen.getByRole("button"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(row);
    await vi.waitFor(() => {
      expect(screen.getByText("Set still has printings")).toBeInTheDocument();
    });

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

  it("clears the delete error once a later delete on the same row succeeds", async () => {
    const user = userEvent.setup();
    const onDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error("Set still has printings"))
      .mockResolvedValueOnce(undefined);
    renderTable(onDelete);

    await user.click(screen.getByRole("button"));
    let dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => {
      expect(screen.getByText("Set still has printings")).toBeInTheDocument();
    });

    dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Set still has printings")).not.toBeInTheDocument();
  });
});

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

  function renderedLabels(): string[] {
    return screen
      .getAllByRole("row")
      .slice(1)
      .map((tr) => within(tr).getAllByRole("cell")[0]!.textContent ?? "");
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

    await user.click(screen.getAllByText("Name")[0]!);

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
        .map((tr) => within(tr).getAllByRole("cell")[0]!.textContent),
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

  function renderedLabels(): string[] {
    return screen
      .getAllByRole("row")
      .slice(1)
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

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]!);

    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("keeps showing the new order and locks further moves while the save is in flight", async () => {
    const user = userEvent.setup();
    let settle = () => {};
    // oxlint-disable-next-line promise/avoid-new -- a promise the test resolves by hand to hold the save open
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    renderReorder(() => pending);

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]!);

    expect(renderedLabels()).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(screen.getAllByRole("button", { name: "Move down" })[0]!).toBeDisabled();
    settle();
  });

  it("falls back to the server order when the save fails", async () => {
    const user = userEvent.setup();
    renderReorder(vi.fn().mockRejectedValue(new Error("nope")));

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]!);

    await vi.waitFor(() => {
      expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
    });
  });

  it("drops the pending order once the data prop lands in the order that was requested", async () => {
    const user = userEvent.setup();
    let settle = () => {};
    // oxlint-disable-next-line promise/avoid-new -- a promise the test resolves by hand to hold the save open
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const onReorder = vi.fn().mockReturnValue(pending);
    const { rerender } = renderReorder(onReorder);

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]!);

    expect(renderedLabels()).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(screen.getAllByRole("button", { name: "Move down" })[0]!).toBeDisabled();

    const reordered: Row[] = [
      { slug: "b", label: "Beta" },
      { slug: "a", label: "Alpha" },
      { slug: "c", label: "Gamma" },
    ];
    rerender(
      <AdminTable
        columns={columns}
        data={reordered}
        getRowKey={(r) => r.slug}
        reorder={{ moves: flatReorder(reordered, (r) => r.slug), onReorder }}
      />,
    );

    expect(renderedLabels()).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(screen.getAllByRole("button", { name: "Move down" })[0]!).toBeEnabled();
    settle();
  });

  it("drops the pending order when data changes to an order other than the one requested", async () => {
    const user = userEvent.setup();
    let settle = () => {};
    // oxlint-disable-next-line promise/avoid-new -- a promise the test resolves by hand to hold the save open
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const onReorder = vi.fn().mockReturnValue(pending);
    const { rerender } = renderReorder(onReorder);

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]!);

    expect(renderedLabels()).toEqual(["Beta", "Alpha", "Gamma"]);

    const differentOrder: Row[] = [
      { slug: "c", label: "Gamma" },
      { slug: "a", label: "Alpha" },
      { slug: "b", label: "Beta" },
    ];
    rerender(
      <AdminTable
        columns={columns}
        data={differentOrder}
        getRowKey={(r) => r.slug}
        reorder={{ moves: flatReorder(differentOrder, (r) => r.slug), onReorder }}
      />,
    );

    expect(renderedLabels()).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(screen.getAllByRole("button", { name: "Move down" })[0]!).toBeEnabled();
    settle();
  });
});

describe("AdminTable add", () => {
  function renderAddTable(add: {
    emptyDraft: Row;
    onSave: (draft: Row) => Promise<unknown>;
    validate?: (draft: Row) => string | null;
  }) {
    return render(
      <AdminTable
        columns={draftColumns}
        data={[row]}
        getRowKey={(r) => r.slug}
        add={add}
        delete={{ onDelete: vi.fn().mockResolvedValue(undefined) }}
      />,
    );
  }

  it("seeds the add row from emptyDraft when the add button is clicked", async () => {
    const user = userEvent.setup();
    renderAddTable({ emptyDraft: { slug: "", label: "" }, onSave: vi.fn() });

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByLabelText("Label")).toHaveValue("");
  });

  it("updates the draft as the addCell input changes", async () => {
    const user = userEvent.setup();
    renderAddTable({ emptyDraft: { slug: "", label: "" }, onSave: vi.fn() });

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Label"), "New Set");

    expect(screen.getByLabelText("Label")).toHaveValue("New Set");
  });

  it("calls add.onSave with the edited draft and closes the row once it resolves", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderAddTable({ emptyDraft: { slug: "new-set", label: "" }, onSave });

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Label"), "New Set");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ slug: "new-set", label: "New Set" });
    await vi.waitFor(() => {
      expect(screen.queryByLabelText("Label")).not.toBeInTheDocument();
    });
  });

  it("shows the validate error and does not call onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const validate = vi.fn().mockReturnValue("Label is required");
    renderAddTable({ emptyDraft: { slug: "new-set", label: "" }, onSave, validate });

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Label is required")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the rejection error and keeps the add row open", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Slug already exists"));
    renderAddTable({ emptyDraft: { slug: "new-set", label: "" }, onSave });

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => {
      expect(screen.getByText("Slug already exists")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("closes the add row without calling onSave on cancel", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderAddTable({ emptyDraft: { slug: "new-set", label: "" }, onSave });

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Label")).not.toBeInTheDocument();
  });
});

describe("AdminTable add under a row (addChild)", () => {
  const parentRows: Row[] = [
    { slug: "a", label: "Alpha" },
    { slug: "b", label: "Beta" },
  ];

  function renderChildTable(canAddChild?: (row: Row) => boolean) {
    return render(
      <AdminTable
        columns={draftColumns}
        data={parentRows}
        getRowKey={(r) => r.slug}
        add={{ emptyDraft: { slug: "", label: "" }, onSave: vi.fn() }}
        addChild={{
          toDraft: (r) => ({ slug: `${r.slug}-child`, label: `${r.label} child` }),
          canAddChild,
        }}
      />,
    );
  }

  it("opens an add row seeded from addChild.toDraft directly under the row it was started from", async () => {
    const user = userEvent.setup();
    renderChildTable();

    const addChildButtons = screen.getAllByRole("button", { name: "Add child" });
    await user.click(addChildButtons[1]!);

    const inputs = screen.getAllByLabelText("Label");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveValue("Beta child");

    const rows = screen.getAllByRole("row");
    const betaRowIndex = rows.findIndex((r) => within(r).queryByText("Beta"));
    const addRowIndex = rows.findIndex((r) => within(r).queryByLabelText("Label"));
    expect(addRowIndex).toBe(betaRowIndex + 1);
  });

  it("hides the add-child action for a row when canAddChild returns false", () => {
    renderChildTable((r) => r.slug !== "a");

    expect(screen.getAllByRole("button", { name: "Add child" })).toHaveLength(1);
  });
});

describe("AdminTable add/edit exclusivity", () => {
  const exclusivityRows: Row[] = [{ slug: "a", label: "Alpha" }];

  function renderBoth() {
    render(
      <AdminTable
        columns={draftColumns}
        data={exclusivityRows}
        getRowKey={(r) => r.slug}
        add={{ emptyDraft: { slug: "", label: "" }, onSave: vi.fn() }}
        edit={{ toDraft: (r) => ({ ...r }), onSave: vi.fn() }}
      />,
    );
  }

  it("closes the open edit row when an add row is started", async () => {
    const user = userEvent.setup();
    renderBoth();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Label")).toHaveValue("Alpha");

    await user.click(screen.getByRole("button", { name: "Add" }));

    const inputs = screen.getAllByLabelText("Label");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveValue("");
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("closes the open add row when an edit row is started", async () => {
    const user = userEvent.setup();
    renderBoth();

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Label")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const inputs = screen.getAllByLabelText("Label");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveValue("Alpha");
  });
});

describe("AdminTable edit", () => {
  const editRows: Row[] = [{ slug: "a", label: "Alpha" }];

  function renderEditTable(edit: {
    toDraft: (r: Row) => Row;
    onSave: (draft: Row) => Promise<unknown>;
    validate?: (draft: Row) => string | null;
  }) {
    return render(
      <AdminTable columns={draftColumns} data={editRows} getRowKey={(r) => r.slug} edit={edit} />,
    );
  }

  it("opens editCell seeded from edit.toDraft when Edit is clicked", async () => {
    const user = userEvent.setup();
    renderEditTable({ toDraft: (r) => ({ ...r }), onSave: vi.fn() });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Label")).toHaveValue("Alpha");
  });

  it("calls edit.onSave with the edited draft and returns to the read-only row once it resolves", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditTable({ toDraft: (r) => ({ ...r }), onSave });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Label"));
    await user.type(screen.getByLabelText("Label"), "Alpha II");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ slug: "a", label: "Alpha II" });
    await vi.waitFor(() => {
      expect(screen.queryByLabelText("Label")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows the validate error and does not call onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const validate = vi.fn().mockReturnValue("Label is required");
    renderEditTable({ toDraft: (r) => ({ ...r }), onSave, validate });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Label is required")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the rejection error and keeps the row in edit mode", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Name already taken"));
    renderEditTable({ toDraft: (r) => ({ ...r }), onSave });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => {
      expect(screen.getByText("Name already taken")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("discards the draft on cancel, restoring the original values when edit reopens", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditTable({ toDraft: (r) => ({ ...r }), onSave });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Label"));
    await user.type(screen.getByLabelText("Label"), "Discarded");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Discarded")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Label")).toHaveValue("Alpha");
  });
});
