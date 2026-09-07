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
    orders: { domains: ["calm", "fury"] },
    labels: { domains: { calm: "Calm", fury: "Fury" } },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import type { MetaPlayerLegendEntry } from "@/features/meta/lib/meta-player-page";

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaPlayerLegends } from "./meta-player-legends";

const LUX: MetaPlayerLegendEntry = {
  legend: {
    cardId: "legend-lux",
    name: "Lux, Lady of Luminosity",
    slug: "lady-of-luminosity",
    imageId: "img-lux",
    domains: ["calm"],
    archiveSlug: "lux-lady-of-luminosity",
  },
  finishes: 9,
  wins: 2,
  bestRank: 1,
};

const VI: MetaPlayerLegendEntry = {
  legend: {
    cardId: "legend-vi",
    name: "Vi, Piltover's Enforcer",
    slug: "piltovers-enforcer",
    imageId: null,
    domains: ["fury"],
    archiveSlug: "vi-piltovers-enforcer",
  },
  finishes: 1,
  wins: 0,
  bestRank: 4,
};

describe("MetaPlayerLegends", () => {
  it("names each legend and counts its finishes and wins", () => {
    render(<MetaPlayerLegends entries={[LUX]} withoutLegend={0} />);
    expect(screen.getByRole("heading", { name: "Legends played" })).toBeInTheDocument();
    expect(screen.getByText("Lux")).toBeInTheDocument();
    expect(screen.getByText("Lady of Luminosity")).toBeInTheDocument();
    expect(screen.getByText(/9 finishes/u)).toBeInTheDocument();
    expect(screen.getByText("2 wins")).toBeInTheDocument();
  });

  it("sends the legend's name to its archive page", () => {
    render(<MetaPlayerLegends entries={[LUX]} withoutLegend={0} />);
    expect(screen.getByRole("link", { name: "Lux" })).toHaveAttribute(
      "href",
      "/meta/legends/lux-lady-of-luminosity",
    );
  });

  it("leaves the wins off a legend that has won nothing", () => {
    render(<MetaPlayerLegends entries={[VI]} withoutLegend={0} />);
    expect(screen.getByText("1 finish")).toBeInTheDocument();
    expect(screen.queryByText(/win/u)).not.toBeInTheDocument();
  });

  it("renders a legend with no artwork rather than a hole", () => {
    render(<MetaPlayerLegends entries={[VI]} withoutLegend={0} />);
    expect(screen.getByText("Vi")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("says how many finishes carry no legend", () => {
    render(<MetaPlayerLegends entries={[LUX]} withoutLegend={3} />);
    expect(screen.getByText("3 finishes have no legend on file")).toBeInTheDocument();
  });

  it("keeps the aside off when every finish names a legend", () => {
    render(<MetaPlayerLegends entries={[LUX, VI]} withoutLegend={0} />);
    expect(screen.queryByText(/no legend on file/u)).not.toBeInTheDocument();
  });

  it("renders nothing when no finish on record names a legend", () => {
    const { container } = render(<MetaPlayerLegends entries={[]} withoutLegend={4} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows no percentage, share or rate anywhere", () => {
    const { container } = render(<MetaPlayerLegends entries={[LUX, VI]} withoutLegend={1} />);
    expect(container.textContent).not.toMatch(/%|\brate\b|\bshare\b/iu);
  });
});
