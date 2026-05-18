import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: {
      finishes: [],
      rarities: [],
      domains: [],
      cardTypes: [],
      superTypes: [],
      artVariants: [],
    },
    labels: {
      finishes: {},
      rarities: {},
      domains: {},
      cardTypes: {},
      superTypes: {},
      artVariants: {},
    },
    domainColors: {},
    rarityColors: {},
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { VariantAddPopover } from "./variant-add-popover";

const cardId = "card-x";
const p1 = stubPrinting({ id: "v1", cardId, shortCode: "P1" });
const p2 = stubPrinting({ id: "v2", cardId, shortCode: "P2" });
const p3 = stubPrinting({ id: "v3", cardId, shortCode: "P3" });
const printings = [p1, p2, p3];

function press(key: string) {
  act(() => {
    const event = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true });
    document.dispatchEvent(event);
  });
}

function highlightedIndex(container: HTMLElement): number {
  const rows = [...container.querySelectorAll<HTMLDivElement>("div.flex.items-center.gap-2")];
  return rows.findIndex((row) => row.className.includes("bg-accent"));
}

describe("VariantAddPopover keyboard nav", () => {
  it("starts with the initialHighlightId row highlighted", () => {
    const { container } = render(
      <VariantAddPopover
        printings={printings}
        ownedCounts={{ v1: 1, v2: 1, v3: 1 }}
        onQuickAdd={() => {}}
        onUndoAdd={() => {}}
        initialHighlightId="v2"
      />,
    );
    expect(highlightedIndex(container)).toBe(1);
  });

  it("falls back to the first row when initialHighlightId doesn't match", () => {
    const { container } = render(
      <VariantAddPopover
        printings={printings}
        ownedCounts={{}}
        onQuickAdd={() => {}}
        onUndoAdd={() => {}}
        initialHighlightId="not-in-list"
      />,
    );
    expect(highlightedIndex(container)).toBe(0);
  });

  it("ArrowDown / ArrowUp wrap the highlight around", () => {
    const { container } = render(
      <VariantAddPopover
        printings={printings}
        ownedCounts={{}}
        onQuickAdd={() => {}}
        onUndoAdd={() => {}}
      />,
    );

    expect(highlightedIndex(container)).toBe(0);
    press("ArrowDown");
    expect(highlightedIndex(container)).toBe(1);
    press("ArrowDown");
    expect(highlightedIndex(container)).toBe(2);
    press("ArrowDown");
    expect(highlightedIndex(container)).toBe(0);
    press("ArrowUp");
    expect(highlightedIndex(container)).toBe(2);
  });

  it("`+` calls onQuickAdd for the highlighted variant", () => {
    const onQuickAdd = vi.fn();
    render(
      <VariantAddPopover
        printings={printings}
        ownedCounts={{}}
        onQuickAdd={onQuickAdd}
        onUndoAdd={() => {}}
        initialHighlightId="v2"
      />,
    );

    press("+");
    expect(onQuickAdd).toHaveBeenCalledWith(p2);
  });

  it("`=` is a no-shift alias for `+` and calls onQuickAdd", () => {
    const onQuickAdd = vi.fn();
    render(
      <VariantAddPopover
        printings={printings}
        ownedCounts={{}}
        onQuickAdd={onQuickAdd}
        onUndoAdd={() => {}}
        initialHighlightId="v2"
      />,
    );

    press("=");
    expect(onQuickAdd).toHaveBeenCalledWith(p2);
  });

  it("`-` calls onUndoAdd for the highlighted variant when owned > 0", () => {
    const onUndoAdd = vi.fn();
    render(
      <VariantAddPopover
        printings={printings}
        ownedCounts={{ v1: 0, v2: 2, v3: 0 }}
        onQuickAdd={() => {}}
        onUndoAdd={onUndoAdd}
        initialHighlightId="v2"
      />,
    );

    press("-");
    expect(onUndoAdd).toHaveBeenCalledTimes(1);
    expect(onUndoAdd.mock.calls[0][0]).toBe(p2);
    expect(onUndoAdd.mock.calls[0][1]).toBeInstanceOf(HTMLElement);
  });

  it("`-` is a no-op when the highlighted variant has zero owned", () => {
    const onUndoAdd = vi.fn();
    render(
      <VariantAddPopover
        printings={printings}
        ownedCounts={{ v1: 0, v2: 0, v3: 1 }}
        onQuickAdd={() => {}}
        onUndoAdd={onUndoAdd}
        initialHighlightId="v2"
      />,
    );

    press("-");
    expect(onUndoAdd).not.toHaveBeenCalled();
  });

  it("hovering a row moves the highlight to that row", () => {
    const { container } = render(
      <VariantAddPopover
        printings={printings}
        ownedCounts={{}}
        onQuickAdd={() => {}}
        onUndoAdd={() => {}}
      />,
    );

    const rows = container.querySelectorAll<HTMLDivElement>("div.flex.items-center.gap-2");
    fireEvent.mouseEnter(rows[2]);
    expect(highlightedIndex(container)).toBe(2);
  });
});
