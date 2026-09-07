import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnLoanChip } from "@/features/groups/components/on-loan-chip";

describe("OnLoanChip", () => {
  it("renders the count with a wordy tooltip", () => {
    render(<OnLoanChip count={3} />);
    const chip = screen.getByTitle("3 copies on loan");
    expect(chip).toHaveTextContent("3");
  });

  it("uses singular wording for one copy", () => {
    render(<OnLoanChip count={1} />);
    expect(screen.getByTitle("1 copy on loan")).toBeInTheDocument();
  });

  it("shows the cross-printing total when it diverges", () => {
    render(<OnLoanChip count={2} totalCount={5} />);
    const chip = screen.getByTitle("2 of this printing on loan (5 across all printings)");
    expect(chip).toHaveTextContent("2(5)");
  });

  it("hides a matching total", () => {
    render(<OnLoanChip count={2} totalCount={2} />);
    const chip = screen.getByTitle("2 copies on loan");
    expect(chip).toHaveTextContent("2");
    expect(chip).not.toHaveTextContent("(2)");
  });

  it("still renders when the displayed printing has none but siblings do", () => {
    render(<OnLoanChip count={0} totalCount={4} />);
    expect(
      screen.getByTitle("0 of this printing on loan (4 across all printings)"),
    ).toHaveTextContent("0(4)");
  });

  it("renders nothing when no copies are on loan", () => {
    const { container } = render(<OnLoanChip count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("drops the number in icon-only mode", () => {
    render(<OnLoanChip iconOnly count={1} />);
    const chip = screen.getByTitle("On loan");
    expect(chip).not.toHaveTextContent("1");
  });
});
