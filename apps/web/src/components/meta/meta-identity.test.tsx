import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["fury", "calm"] },
    labels: { domains: { fury: "Fury", calm: "Calm" } },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ params, children }: { params: { cardSlug: string }; children: React.ReactNode }) => (
    <a href={`/cards/${params.cardSlug}`}>{children}</a>
  ),
}));

const { MetaIdentity } = await import("./meta-identity");

describe("MetaIdentity", () => {
  it("names a legend by champion and card title", () => {
    render(<MetaIdentity name="Lux, Lady of Luminosity" />);
    expect(screen.getByText("Lux")).toBeInTheDocument();
    expect(screen.getByText("Lady of Luminosity")).toBeInTheDocument();
  });

  it("keeps the card title in every arrangement", () => {
    for (const layout of ["row", "stacked", "tile"] as const) {
      const { unmount } = render(<MetaIdentity name="Lux, Lady of Luminosity" layout={layout} />);
      expect(screen.getByText("Lady of Luminosity")).toBeInTheDocument();
      unmount();
    }
  });

  it("drops the card title only when the bracket asks for it", () => {
    render(<MetaIdentity name="Lux, Lady of Luminosity" championOnly />);
    expect(screen.getByText("Lux")).toBeInTheDocument();
    expect(screen.queryByText("Lady of Luminosity")).not.toBeInTheDocument();
  });

  it("renders an untagged legend as its whole name", () => {
    render(<MetaIdentity name="Emperor of the Sands" />);
    expect(screen.getByText("Emperor of the Sands")).toBeInTheDocument();
  });

  it("renders the domain runes by their labels", () => {
    render(<MetaIdentity name="Lux, Lady of Luminosity" domains={["fury", "calm"]} />);
    expect(screen.getByAltText("Fury")).toBeInTheDocument();
    expect(screen.getByAltText("Calm")).toBeInTheDocument();
  });

  it("links the champion at the card page when given a slug", () => {
    render(<MetaIdentity name="Lux, Lady of Luminosity" slug="lady-of-luminosity" />);
    expect(screen.getByRole("link", { name: "Lux" })).toHaveAttribute(
      "href",
      "/cards/lady-of-luminosity",
    );
  });

  it("stays unlinked without a slug, so it can sit inside a link", () => {
    render(<MetaIdentity name="Lux, Lady of Luminosity" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders nothing without a legend", () => {
    const { container } = render(<MetaIdentity name={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
