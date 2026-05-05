import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const { RuleContent } = await import("./rules-page");

describe("RuleContent", () => {
  it("renders italic markdown", () => {
    const { container } = render(<RuleContent content="*Card* refers to a Main Deck card." />);
    expect(container.querySelector("em")).toHaveTextContent("Card");
  });

  it("turns each newline in the source into a hard line break", () => {
    const { container } = render(<RuleContent content={"first line\nsecond line"} />);
    expect(container.querySelectorAll("br").length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain("first line");
    expect(container.textContent).toContain("second line");
  });
});
