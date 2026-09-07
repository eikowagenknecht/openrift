import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-enums", () => ({
  useCustomTagList: () => ({ all: [] }),
  useEnumOrders: () => ({
    orders: { domains: ["fury", "calm"] },
    labels: { domains: { fury: "Fury", calm: "Calm" } },
  }),
}));
vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({ fury: "#f00" }) }));

const { DomainIcon } = await import("./domain-icon");
const { DeckDomainBar } = await import("./deck-domain-bar");

describe("DomainIcon", () => {
  it("names the domain by its label, not its slug", () => {
    render(<DomainIcon domain="fury" />);

    expect(screen.getByAltText("Fury")).toBeInTheDocument();
    expect(screen.queryByAltText("fury")).not.toBeInTheDocument();
  });

  it("renders no tab stop for a decorative icon whose only job is a tooltip", () => {
    const { container } = render(<DomainIcon domain="fury" />);

    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[tabindex]")).toBeNull();
  });

  it("carries the label into the tooltip trigger", () => {
    const { container } = render(<DomainIcon domain="calm" />);

    expect(container.querySelector("[data-slot=tooltip-trigger]")?.tagName).toBe("SPAN");
    expect(screen.getByAltText("Calm")).toBeInTheDocument();
  });
});

describe("DeckDomainBar", () => {
  it("renders no tab stop per segment", () => {
    const { container } = render(
      <DeckDomainBar
        distribution={[
          { domain: "fury", count: 12 },
          { domain: "calm", count: 8 },
        ]}
      />,
    );

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("renders nothing when no cards are countable", () => {
    const { container } = render(<DeckDomainBar distribution={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
