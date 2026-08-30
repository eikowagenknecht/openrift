import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children?: ReactNode;
    to?: string;
    params?: { cardSlug?: string };
    className?: string;
  }) => (
    <a href={(to ?? "").replace("$cardSlug", params?.cardSlug ?? "")} className={className}>
      {children}
    </a>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaLegendLink } from "./meta-legend-link";

describe("MetaLegendLink", () => {
  it("leads a legend to its card page", () => {
    render(<MetaLegendLink name="Azir, Emperor of the Sands" slug="azir-emperor-of-the-sands" />);
    const link = screen.getByRole("link", { name: "Azir, Emperor of the Sands" });
    expect(link.getAttribute("href")).toBe("/cards/azir-emperor-of-the-sands");
  });

  it("keeps the composed name the API sent, rather than shortening it", () => {
    render(<MetaLegendLink name="Azir, Emperor of the Sands" slug="azir-emperor-of-the-sands" />);
    expect(screen.getByText("Azir, Emperor of the Sands")).toBeInTheDocument();
  });

  it("prints a name with no slug as plain text, not a dead link", () => {
    render(<MetaLegendLink name="Azir, Emperor of the Sands" slug={null} />);
    expect(screen.getByText("Azir, Emperor of the Sands")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing at all for a row with no legend", () => {
    const { container } = render(<MetaLegendLink name={null} slug="azir-emperor-of-the-sands" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("treats an empty name as no legend rather than an empty link", () => {
    const { container } = render(<MetaLegendLink name="" slug="azir-emperor-of-the-sands" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("prints a name with an empty slug as plain text", () => {
    render(<MetaLegendLink name="Azir, Emperor of the Sands" slug="" />);
    expect(screen.getByText("Azir, Emperor of the Sands")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("carries the call site's own typography onto the link", () => {
    render(<MetaLegendLink name="Azir" slug="azir" className="text-muted-foreground truncate" />);
    expect(screen.getByRole("link", { name: "Azir" })).toHaveClass("truncate", "hover:underline");
  });
});
