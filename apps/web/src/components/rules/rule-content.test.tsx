import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    hash,
    children,
    className,
  }: {
    to: string;
    hash?: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={hash ? `${to}#${hash}` : to} className={className} data-testid="router-link">
      {children}
    </a>
  ),
}));

const { RuleContent } = await import("./rules-page");

describe("RuleContent", () => {
  it("renders italic markdown", () => {
    const { container } = render(<RuleContent content="*Card* refers to a Main Deck card." />);
    expect(container.querySelector("em")).toHaveTextContent("Card");
  });

  it("links a known glossary keyword to its anchor on the glossary page", () => {
    render(<RuleContent content="Units gain Accelerate when summoned." />);
    const link = screen.getByRole("link", { name: "Accelerate" });
    expect(link).toHaveAttribute("href", "/glossary#keyword-accelerate");
  });

  it("renders glossary keywords inside markdown emphasis", () => {
    render(<RuleContent content="The *Accelerate* trigger fires once." />);
    const link = screen.getByRole("link", { name: "Accelerate" });
    expect(link).toHaveAttribute("href", "/glossary#keyword-accelerate");
    expect(link.closest("em")).not.toBeNull();
  });

  it("turns each newline in the source into a hard line break", () => {
    const { container } = render(<RuleContent content={"first line\nsecond line"} />);
    expect(container.querySelectorAll("br").length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain("first line");
    expect(container.textContent).toContain("second line");
  });
});
