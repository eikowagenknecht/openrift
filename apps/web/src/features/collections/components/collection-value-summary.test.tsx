import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollectionValueSummary } from "./collection-value-summary";

function formatValue(value: number): string {
  return `€${value.toFixed(2)}`;
}

describe("CollectionValueSummary", () => {
  it("shows the formatted value when the collection is worth something", () => {
    render(
      <CollectionValueSummary valueCents={1234} unpricedCount={0} formatValue={formatValue} />,
    );
    expect(screen.getByText("€12.34")).toBeInTheDocument();
  });

  it("appends the unpriced-copy note when some copies have no price", () => {
    render(<CollectionValueSummary valueCents={500} unpricedCount={3} formatValue={formatValue} />);
    expect(screen.getByText("€5.00")).toBeInTheDocument();
    expect(screen.getByText("(3 unpriced)")).toBeInTheDocument();
  });

  it("renders nothing when the value is zero", () => {
    const { container } = render(
      <CollectionValueSummary valueCents={0} unpricedCount={0} formatValue={formatValue} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the value is zero even with unpriced copies", () => {
    const { container } = render(
      <CollectionValueSummary valueCents={0} unpricedCount={4} formatValue={formatValue} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the value is missing", () => {
    const nullRender = render(
      <CollectionValueSummary valueCents={null} unpricedCount={0} formatValue={formatValue} />,
    );
    expect(nullRender.container).toBeEmptyDOMElement();

    const undefinedRender = render(
      <CollectionValueSummary valueCents={undefined} unpricedCount={0} formatValue={formatValue} />,
    );
    expect(undefinedRender.container).toBeEmptyDOMElement();
  });
});
