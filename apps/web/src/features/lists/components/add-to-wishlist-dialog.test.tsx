import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockList {
  id: string;
  name: string;
  kind: "card" | "printing";
  intent: "wish";
}

// Mutated per test before rendering, read lazily inside the mock factory.
let currentLists: MockList[] = [];

const bulkAddMutate = vi.fn(
  (
    payload: { listId: string; entries: { cardId?: string; printingId?: string }[] },
    opts?: {
      onSuccess?: (result: { added: number; updated: number; skipped: number }) => unknown;
    },
  ) => {
    void opts?.onSuccess?.({ added: payload.entries.length, updated: 0, skipped: 0 });
  },
);

vi.mock("@/features/lists/hooks/use-lists", () => ({
  useLists: () => ({ data: currentLists }),
  useBulkAddListEntries: () => ({ mutate: bulkAddMutate, isPending: false }),
}));

const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    info: (...args: unknown[]) => toastInfo(...args),
  },
}));

const { AddToWishlistDialog } = await import("./add-to-wishlist-dialog");

const CARD_LIST: MockList = { id: "w1", name: "Wants", kind: "card", intent: "wish" };
const PRINTING_LIST: MockList = { id: "w2", name: "Exact wants", kind: "printing", intent: "wish" };

function renderDialog({
  entriesFor,
  onCreateNew = () => {},
  onOpenChange = () => {},
  onAdded,
}: {
  entriesFor: (kind: "card" | "printing" | "copy") => { cardId?: string; quantity?: number }[];
  onCreateNew?: () => void;
  onOpenChange?: (open: boolean) => void;
  onAdded?: (listId: string) => void;
}) {
  return render(
    <AddToWishlistDialog
      open
      onOpenChange={onOpenChange}
      entriesFor={entriesFor}
      onCreateNew={onCreateNew}
      onAdded={onAdded}
    />,
  );
}

function clickListRow(name: string) {
  // Dialog portals onto document.body, outside the render container.
  const rows = [...document.querySelectorAll<HTMLElement>('[data-slot="picker-row"]')];
  const row = rows.find((candidate) => candidate.textContent?.includes(name));
  if (!row) {
    throw new Error(`No list row rendered for "${name}"`);
  }
  fireEvent.click(row);
}

beforeEach(() => {
  currentLists = [CARD_LIST, PRINTING_LIST];
  bulkAddMutate.mockClear();
  toastSuccess.mockClear();
  toastInfo.mockClear();
});

describe("AddToWishlistDialog", () => {
  it("adds entries shaped for the picked list's kind", () => {
    const entriesFor = vi.fn((kind: string) =>
      kind === "card" ? [{ cardId: "c1", quantity: 2 }] : [{ printingId: "p1", quantity: 2 }],
    );
    renderDialog({ entriesFor });

    clickListRow("Exact wants");

    expect(entriesFor).toHaveBeenCalledWith("printing");
    expect(bulkAddMutate).toHaveBeenCalledTimes(1);
    expect(bulkAddMutate.mock.calls[0]![0]).toEqual({
      listId: "w2",
      entries: [{ printingId: "p1", quantity: 2 }],
    });
  });

  it("closes and reports the list on success", () => {
    const onOpenChange = vi.fn();
    const onAdded = vi.fn();
    renderDialog({
      entriesFor: () => [{ cardId: "c1", quantity: 1 }],
      onOpenChange,
      onAdded,
    });

    clickListRow("Wants");

    expect(toastSuccess).toHaveBeenCalledWith('Added 1 card to "Wants"');
    expect(onAdded).toHaveBeenCalledWith("w1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not call the API when no entries map to the list's kind", () => {
    renderDialog({ entriesFor: () => [] });

    clickListRow("Wants");

    expect(bulkAddMutate).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalled();
  });

  it("hands off to the create flow and closes itself", () => {
    const onCreateNew = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ entriesFor: () => [], onCreateNew, onOpenChange });

    fireEvent.click(screen.getByRole("button", { name: "New wishlist" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when the user has no wishlists", () => {
    currentLists = [];
    renderDialog({ entriesFor: () => [] });

    expect(screen.getByText("No wishlists yet. Create one below.")).toBeInTheDocument();
  });
});
