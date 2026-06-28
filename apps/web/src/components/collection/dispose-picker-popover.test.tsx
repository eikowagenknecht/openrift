import type { CollectionResponse, CopyResponse, Printing } from "@openrift/shared";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

const printing = stubPrinting({ id: "p1", cardId: "c1" });

function stubCollection(id: string, name: string, isInbox: boolean): CollectionResponse {
  return {
    id,
    name,
    isInbox,
    description: null,
    availableForDeckbuilding: true,
    sortOrder: 0,
    isPublic: false,
    shareToken: null,
    copyCount: 0,
    totalValueCents: null,
    unpricedCopyCount: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    groupId: null,
    groupSlug: null,
    groupName: null,
    viewerCanAdmin: true,
  };
}

const collections: CollectionResponse[] = [
  stubCollection("col-inbox", "Inbox", true),
  stubCollection("col-2", "RiftCore Import", false),
  stubCollection("col-3", "Trade Binder", false),
];

const copies: CopyResponse[] = [
  { id: "c-a", printingId: printing.id, collectionId: "col-inbox", groupId: null },
  { id: "c-b", printingId: printing.id, collectionId: "col-2", groupId: null },
  { id: "c-c", printingId: printing.id, collectionId: "col-2", groupId: null },
  { id: "c-d", printingId: printing.id, collectionId: "col-3", groupId: null },
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
import { buildDisposeRows, DisposePickerPopover } from "./dispose-picker-popover";

describe("buildDisposeRows", () => {
  it("lists each personal collection that owns a copy, with counts, in order", () => {
    const rows = buildDisposeRows(copies, collections, printing.id);
    expect(rows.map((row) => [row.collection.id, row.count])).toEqual([
      ["col-inbox", 1],
      ["col-2", 2],
      ["col-3", 1],
    ]);
  });

  // Regression: the "Remove from" picker only opens for the personal minus, so
  // a friend group's copy must never appear as a removal target.
  it("excludes group-collection copies", () => {
    const withGroup: CopyResponse[] = [
      ...copies,
      { id: "c-g", printingId: printing.id, collectionId: "col-group", groupId: "group-1" },
    ];
    const withGroupCol: CollectionResponse[] = [
      ...collections,
      { ...stubCollection("col-group", "Group Bulk Box", false), groupId: "group-1" },
    ];
    const rows = buildDisposeRows(withGroup, withGroupCol, printing.id);
    expect(rows.map((row) => row.collection.id)).toEqual(["col-inbox", "col-2", "col-3"]);
  });

  it("ignores copies of other printings", () => {
    const mixed: CopyResponse[] = [
      ...copies,
      { id: "c-x", printingId: "other", collectionId: "col-2", groupId: null },
    ];
    const rows = buildDisposeRows(mixed, collections, printing.id);
    expect(rows.find((row) => row.collection.id === "col-2")?.count).toBe(2);
  });
});

function commandRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('[data-slot="command"]');
  if (!root) {
    throw new Error("Command root not found");
  }
  return root;
}

function press(container: HTMLElement, key: string) {
  act(() => {
    fireEvent.keyDown(commandRoot(container), { key });
  });
}

function highlightedIndex(container: HTMLElement): number {
  const items = [...container.querySelectorAll<HTMLElement>('[data-slot="picker-row"]')];
  return items.findIndex((item) => item.dataset.selected === "true");
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

    press(container, "ArrowDown");
    expect(highlightedIndex(container)).toBe(1);
    press(container, "ArrowDown");
    expect(highlightedIndex(container)).toBe(2);
    press(container, "ArrowDown");
    expect(highlightedIndex(container)).toBe(0);
    press(container, "ArrowUp");
    expect(highlightedIndex(container)).toBe(2);
  });

  it("Enter picks the highlighted collection", () => {
    const onPick = vi.fn();
    const { container } = render(
      <DisposePickerPopover printing={printing as Printing} onPick={onPick} />,
    );

    press(container, "ArrowDown");
    press(container, "Enter");
    expect(onPick).toHaveBeenCalledWith(printing, "col-2");
  });

  it("`-` also picks the highlighted collection", () => {
    const onPick = vi.fn();
    const { container } = render(
      <DisposePickerPopover printing={printing as Printing} onPick={onPick} />,
    );

    press(container, "ArrowDown");
    press(container, "ArrowDown");
    press(container, "-");
    expect(onPick).toHaveBeenCalledWith(printing, "col-3");
  });

  it("hovering a row moves the highlight to that row", () => {
    const { container } = render(
      <DisposePickerPopover printing={printing as Printing} onPick={() => {}} />,
    );

    const items = container.querySelectorAll<HTMLElement>('[data-slot="picker-row"]');
    fireEvent.pointerMove(items[2]);
    expect(highlightedIndex(container)).toBe(2);
  });
});
