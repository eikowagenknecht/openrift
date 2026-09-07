import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { CountWithAddControls } from "./count-with-add-controls";

describe("CountWithAddControls", () => {
  it("renders the sibling total in parens next to the per-printing count when they differ", () => {
    const printing = stubPrinting({ id: "p-row-2" });
    const { getByText } = render(
      <CountWithAddControls printing={printing} ownedCount={2} totalOwnedCount={5} />,
    );
    expect(getByText("2")).toBeTruthy();
    expect(getByText("(5)")).toBeTruthy();
  });

  it("renders the count before both +/- buttons so the buttons stay pinned to the right when the parens appear", () => {
    const printing = stubPrinting({ id: "p-row-order" });
    const { container } = render(
      <CountWithAddControls printing={printing} ownedCount={2} totalOwnedCount={5} />,
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
      <CountWithAddControls printing={printing} ownedCount={3} totalOwnedCount={3} />,
    );
    expect(container.textContent).not.toContain("(3)");
  });

  it("omits the parens when totalOwnedCount is undefined (printings view or no scoping)", () => {
    const printing = stubPrinting({ id: "p-row-4" });
    const { container } = render(<CountWithAddControls printing={printing} ownedCount={2} />);
    expect(container.textContent).not.toContain("(");
  });
});
