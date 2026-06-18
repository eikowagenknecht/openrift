import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockList {
  id: string;
  name: string;
  kind: "copy" | "card";
  intent: "trade" | "wish" | "organize";
}

// Mutated per test before rendering, read lazily inside the mock factory.
let currentLists: MockList[] = [];

const bulkAddMutate = vi.fn(
  (
    payload: { listId: string; entries: { copyId: string }[] },
    opts?: { onSuccess?: (result: { added: number; skipped: number }) => unknown },
  ) => {
    void opts?.onSuccess?.({ added: payload.entries.length, skipped: 0 });
  },
);
const createMutate = vi.fn();

vi.mock("@/hooks/use-lists", () => ({
  useLists: () => ({ data: currentLists }),
  useBulkAddListEntries: () => ({ mutate: bulkAddMutate, isPending: false }),
  useCreateList: () => ({ mutate: createMutate, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn() },
}));

const { AddToListDialog } = await import("./add-to-list-dialog");

const LISTS: MockList[] = [{ id: "l1", name: "Trades", kind: "copy", intent: "trade" }];

function renderDialog(props: { copyIds: string[]; singleCard?: boolean }) {
  return render(
    <AddToListDialog
      open
      onOpenChange={() => {}}
      copyIds={props.copyIds}
      singleCard={props.singleCard}
    />,
  );
}

function clickFirstList() {
  // The dialog renders into a portal on document.body, so query the document
  // rather than the render container.
  const row = document.querySelector<HTMLElement>('[data-slot="picker-row"]');
  if (!row) {
    throw new Error("No list row rendered");
  }
  fireEvent.click(row);
}

describe("AddToListDialog quantity stepper", () => {
  beforeEach(() => {
    currentLists = LISTS;
    bulkAddMutate.mockClear();
    createMutate.mockClear();
  });

  it("shows a stepper for a single card and defaults to adding every copy", () => {
    renderDialog({
      copyIds: ["c1", "c2", "c3", "c4"],
      singleCard: true,
    });

    expect(screen.getByRole("button", { name: "One more" })).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();

    clickFirstList();

    expect(bulkAddMutate).toHaveBeenCalledTimes(1);
    expect(bulkAddMutate.mock.calls[0][0].entries).toEqual([
      { copyId: "c1" },
      { copyId: "c2" },
      { copyId: "c3" },
      { copyId: "c4" },
    ]);
  });

  it("adds only the chosen number of copies after stepping down", () => {
    renderDialog({
      copyIds: ["c1", "c2", "c3", "c4"],
      singleCard: true,
    });

    const fewer = screen.getByRole("button", { name: "One fewer" });
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    expect(screen.getByText("2")).toBeInTheDocument();

    clickFirstList();

    expect(bulkAddMutate.mock.calls[0][0].entries).toEqual([{ copyId: "c1" }, { copyId: "c2" }]);
  });

  it("does not step below one copy", () => {
    renderDialog({ copyIds: ["c1", "c2"], singleCard: true });

    const fewer = screen.getByRole("button", { name: "One fewer" });
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    fireEvent.click(fewer);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(fewer).toBeDisabled();
  });

  it("does not step above the available copies", () => {
    renderDialog({ copyIds: ["c1", "c2"], singleCard: true });

    const more = screen.getByRole("button", { name: "One more" });
    fireEvent.click(more);
    fireEvent.click(more);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(more).toBeDisabled();
  });

  it("adds every copy with no stepper for a multi-card selection", () => {
    renderDialog({
      copyIds: ["c1", "c2", "c3"],
      singleCard: false,
    });

    expect(screen.queryByRole("button", { name: "One more" })).not.toBeInTheDocument();

    clickFirstList();

    expect(bulkAddMutate.mock.calls[0][0].entries).toEqual([
      { copyId: "c1" },
      { copyId: "c2" },
      { copyId: "c3" },
    ]);
  });

  it("shows no stepper when a single copy is targeted", () => {
    renderDialog({ copyIds: ["c1"], singleCard: true });

    expect(screen.queryByRole("button", { name: "One more" })).not.toBeInTheDocument();

    clickFirstList();

    expect(bulkAddMutate.mock.calls[0][0].entries).toEqual([{ copyId: "c1" }]);
  });
});
