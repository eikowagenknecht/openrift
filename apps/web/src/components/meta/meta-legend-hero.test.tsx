import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => {
  function Anchor({
    to,
    params,
    children,
    className,
  }: {
    to?: string;
    params?: Record<string, string>;
    children?: React.ReactNode;
    className?: string;
  }) {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to ?? "#",
    );
    return (
      <a href={href} className={className}>
        {children ?? "link"}
      </a>
    );
  }
  return { Link: Anchor, createLink: () => Anchor };
});

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["fury", "calm"] },
    labels: { domains: { fury: "Fury", calm: "Calm" } },
  }),
}));

vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaLegendHero } from "./meta-legend-hero";

const legend = {
  cardId: "card-1",
  name: "Kennen, Heart of the Tempest",
  slug: "heart-of-the-tempest",
  imageId: "img-1",
  domains: ["fury", "calm"],
  archiveSlug: "kennen-heart-of-the-tempest",
};

describe("MetaLegendHero", () => {
  it("heads the hero with the champion and names the legend card beneath it", () => {
    render(
      <MetaLegendHero legend={legend} counts={{ eventWins: 5, finishes: 214, decklists: 38 }} />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Kennen" })).toBeInTheDocument();
    expect(screen.getByText("Heart of the Tempest · Legend")).toBeInTheDocument();
  });

  it("leads the champion's name at the card page, the one link off the archive", () => {
    render(<MetaLegendHero legend={legend} counts={{ eventWins: 0, finishes: 0, decklists: 0 }} />);
    expect(screen.getByRole("link", { name: "Kennen" })).toHaveAttribute(
      "href",
      "/cards/heart-of-the-tempest",
    );
  });

  it("prints the three counts of what the archive holds", () => {
    render(
      <MetaLegendHero legend={legend} counts={{ eventWins: 5, finishes: 1214, decklists: 38 }} />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("event wins")).toBeInTheDocument();
    expect(screen.getByText("1,214")).toBeInTheDocument();
    expect(screen.getByText("archived finishes")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("decklists")).toBeInTheDocument();
  });

  it("shows no percentage, share or rate anywhere", () => {
    const { container } = render(
      <MetaLegendHero legend={legend} counts={{ eventWins: 5, finishes: 214, decklists: 38 }} />,
    );
    expect(container.textContent).not.toMatch(/%|\brate\b|\bshare\b/iu);
  });

  it("draws a rune per domain", () => {
    render(<MetaLegendHero legend={legend} counts={{ eventWins: 0, finishes: 0, decklists: 0 }} />);
    expect(screen.getByAltText("Fury")).toBeInTheDocument();
    expect(screen.getByAltText("Calm")).toBeInTheDocument();
  });

  it("renders a legend with no artwork and no title rather than a hole", () => {
    render(
      <MetaLegendHero
        legend={{ ...legend, name: "Emperor of the Sands", imageId: null, domains: [] }}
        counts={{ eventWins: 0, finishes: 0, decklists: 0 }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Emperor of the Sands" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/· Legend$/u)).not.toBeInTheDocument();
  });
});
