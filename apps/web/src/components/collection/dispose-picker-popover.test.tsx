import type { CollectionResponse, CopyResponse, Printing } from "@openrift/shared";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

const printing = stubPrinting({ id: "p1", cardId: "c1" });

const collections: CollectionResponse[] = [
  { id: "col-inbox", userId: "u1", name: "Inbox", isInbox: true, sortIndex: 0 },
  { id: "col-2", userId: "u1", name: "RiftCore Import", isInbox: false, sortIndex: 1 },
  { id: "col-3", userId: "u1", name: "Trade Binder", isInbox: false, sortIndex: 2 },
];

const copies: CopyResponse[] = [
  { id: "c-a", printingId: printing.id, collectionId: "col-inbox" } as CopyResponse,
  { id: "c-b", printingId: printing.id, collectionId: "col-2" } as CopyResponse,
  { id: "c-c", printingId: printing.id, collectionId: "col-2" } as CopyResponse,
  { id: "c-d", printingId: printing.id, collectionId: "col-3" } as CopyResponse,
];

vi.mock("@/hooks/use-collections", () => ({
  collectionsQueryOptions: () => ({ queryKey: ["collections"], queryFn: () => collections }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: collections }),
}));

vi.mock("@tanstack/react-db", () => ({
  useLiveQuery: () => ({ data: copies }),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "u1",
}));

vi.mock("@/lib/copies-collection", () => ({
  useCopiesCollection: () => ({ toArray: copies }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { DisposePickerPopover } from "./dispose-picker-popover";

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true }));
  });
}

function highlightedIndex(container: HTMLElement): number {
  const rows = [...container.querySelectorAll<HTMLButtonElement>("button")];
  return rows.findIndex((row) => row.dataset.highlighted === "true");
}

describe("DisposePickerPopover keyboard nav", () => {
  it("starts with the first row highlighted", () => {
    const { container } = render(
      <DisposePickerPopover printing={printing as Printing} onPick={() => {}} />,
    );
    expect(highlightedIndex(container)).toBe(0);
  });

  it("ArrowDown / ArrowUp wrap the highlight", () => {
    const { container } = render(
      <DisposePickerPopover printing={printing as Printing} onPick={() => {}} />,
    );

    press("ArrowDown");
    expect(highlightedIndex(container)).toBe(1);
    press("ArrowDown");
    expect(highlightedIndex(container)).toBe(2);
    press("ArrowDown");
    expect(highlightedIndex(container)).toBe(0);
    press("ArrowUp");
    expect(highlightedIndex(container)).toBe(2);
  });

  it("Enter picks the highlighted collection", () => {
    const onPick = vi.fn();
    render(<DisposePickerPopover printing={printing as Printing} onPick={onPick} />);

    press("ArrowDown");
    press("Enter");
    expect(onPick).toHaveBeenCalledWith(printing, "col-2");
  });

  it("`-` also picks the highlighted collection", () => {
    const onPick = vi.fn();
    render(<DisposePickerPopover printing={printing as Printing} onPick={onPick} />);

    press("ArrowDown");
    press("ArrowDown");
    press("-");
    expect(onPick).toHaveBeenCalledWith(printing, "col-3");
  });

  it("hovering a row moves the highlight to that row", () => {
    const { container } = render(
      <DisposePickerPopover printing={printing as Printing} onPick={() => {}} />,
    );

    const rows = container.querySelectorAll<HTMLButtonElement>("button");
    fireEvent.mouseEnter(rows[2]);
    expect(highlightedIndex(container)).toBe(2);
  });
});
