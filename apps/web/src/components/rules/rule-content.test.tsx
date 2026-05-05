import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    hash,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    hash?: string;
    children: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return (
      <a href={hash ? `${path}#${hash}` : path} className={className} data-testid="router-link">
        {children}
      </a>
    );
  },
}));

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

  it("links a `rule N` reference to the same-page anchor", () => {
    render(<RuleContent content="See *rule 540* for more information." />);
    const link = screen.getByRole("link", { name: "rule 540" });
    expect(link).toHaveAttribute("href", "#rule-540");
  });

  it("links a multi-segment rule reference and stops before a sentence-ending dot", () => {
    render(<RuleContent content="Continue until *rule 540.4.b.* is accomplished." />);
    const link = screen.getByRole("link", { name: "rule 540.4.b" });
    expect(link).toHaveAttribute("href", "#rule-540.4.b");
  });

  it("links a bare numeric tournament reference", () => {
    render(<RuleContent content="See 603.7 for more information." />);
    const link = screen.getByRole("link", { name: "603.7" });
    expect(link).toHaveAttribute("href", "#rule-603.7");
  });

  it("links a `CR N` reference across to the core rules page via the router", () => {
    render(<RuleContent content="Then proceed to *CR 116. Setup Process*." />);
    const link = screen.getByRole("link", { name: "CR 116" });
    expect(link).toHaveAttribute("href", "/rules/core#rule-116");
    expect(link).toHaveAttribute("data-testid", "router-link");
  });

  it("does not link a low single-digit decimal that is not a rule number", () => {
    render(<RuleContent content="The ratio is 1.5x." />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
