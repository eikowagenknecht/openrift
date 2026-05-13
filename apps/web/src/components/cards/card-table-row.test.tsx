import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { CardTableRow } from "./card-table-row";

describe("CardTableRow", () => {
  it("renders data-printing-id on the row so keyboard `-` can anchor the dispose picker to it", () => {
    // Regression: without this attribute, useGridKeyboardNav.querySelector returns
    // null, anchorEl is undefined, and the multi-collection picker silently bails.
    const printing = stubPrinting({ id: "p-row-1" });
    const { container } = render(
      <CardTableRow
        printing={printing}
        ownedCount={0}
        isSelected={false}
        showOwned={false}
        showAddControls={false}
        columns="1fr"
        cardTypeLabels={{}}
        superTypeLabels={{}}
        rarityLabels={{ common: "Common" }}
        setNameBySlug={new Map()}
        onRowClick={() => {}}
      />,
    );
    const row = container.querySelector('[data-printing-id="p-row-1"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute("role")).toBe("row");
  });

  it("renders the sibling total in parens next to the per-printing count in add mode when they differ", () => {
    const printing = stubPrinting({ id: "p-row-2" });
    const { getByText } = render(
      <CardTableRow
        printing={printing}
        ownedCount={2}
        totalOwnedCount={5}
        isSelected={false}
        showOwned={false}
        showAddControls
        columns="1fr"
        cardTypeLabels={{}}
        superTypeLabels={{}}
        rarityLabels={{ common: "Common" }}
        setNameBySlug={new Map()}
        onRowClick={() => {}}
      />,
    );
    expect(getByText("2")).toBeTruthy();
    expect(getByText("(5)")).toBeTruthy();
  });

  it("renders the count before both +/- buttons in add mode so buttons stay pinned to the right when the parens appear", () => {
    const printing = stubPrinting({ id: "p-row-order" });
    const { container } = render(
      <CardTableRow
        printing={printing}
        ownedCount={2}
        totalOwnedCount={5}
        isSelected={false}
        showOwned={false}
        showAddControls
        columns="1fr"
        cardTypeLabels={{}}
        superTypeLabels={{}}
        rarityLabels={{ common: "Common" }}
        setNameBySlug={new Map()}
        onRowClick={() => {}}
      />,
    );
    const count = container.querySelector(".tabular-nums");
    const removeButton = container.querySelector('[aria-label="Remove one"]');
    const addButton = container.querySelector('[aria-label="Add one"]');
    expect(count).not.toBeNull();
    expect(removeButton).not.toBeNull();
    expect(addButton).not.toBeNull();
    const position = (node: Element | null, other: Element | null) =>
      node && other ? node.compareDocumentPosition(other) : 0;
    expect(position(count, removeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(position(removeButton, addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits the parens when the sibling total equals the per-printing count", () => {
    const printing = stubPrinting({ id: "p-row-3" });
    const { container } = render(
      <CardTableRow
        printing={printing}
        ownedCount={3}
        totalOwnedCount={3}
        isSelected={false}
        showOwned={false}
        showAddControls
        columns="1fr"
        cardTypeLabels={{}}
        superTypeLabels={{}}
        rarityLabels={{ common: "Common" }}
        setNameBySlug={new Map()}
        onRowClick={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("(3)");
  });
});
