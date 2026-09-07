import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import type { MetaPlayerCounts, MetaPlayerFacts } from "@/features/meta/lib/meta-player-page";

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaPlayerHero } from "./meta-player-hero";

const LUX = {
  cardId: "legend-lux",
  name: "Lux, Lady of Luminosity",
  slug: "lady-of-luminosity",
  imageId: "img-lux",
  domains: ["calm"],
  archiveSlug: "lux-lady-of-luminosity",
};

const FACTS: MetaPlayerFacts = {
  country: "DE",
  firstDate: "2026-03-14",
  lastDate: "2026-08-01",
  topLegend: LUX,
};

const COUNTS: MetaPlayerCounts = {
  eventWins: 3,
  topEights: 11,
  finishes: 1214,
  decklists: 27,
};

describe("MetaPlayerHero", () => {
  it("heads the hero with the player's name as plain text, not a link", () => {
    render(<MetaPlayerHero name="Renata" facts={FACTS} counts={COUNTS} />);
    expect(screen.getByRole("heading", { level: 2, name: "Renata" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("states where the record was played and how far it reaches", () => {
    render(<MetaPlayerHero name="Renata" facts={FACTS} counts={COUNTS} />);
    expect(screen.getByText("Germany")).toBeInTheDocument();
    expect(screen.getByText("On record since 2026-03")).toBeInTheDocument();
    expect(screen.getByText("Last seen 2026-08-01")).toBeInTheDocument();
  });

  it("prints the four counts of what the archive holds", () => {
    render(<MetaPlayerHero name="Renata" facts={FACTS} counts={COUNTS} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("event wins")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("top 8 finishes")).toBeInTheDocument();
    expect(screen.getByText("1,214")).toBeInTheDocument();
    expect(screen.getByText("archived finishes")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(screen.getByText("decklists")).toBeInTheDocument();
  });

  it("draws the most-played legend's artwork", () => {
    render(<MetaPlayerHero name="Renata" facts={FACTS} counts={COUNTS} />);
    expect(screen.getByAltText("Lux")).toHaveAttribute("src", expect.stringContaining("img-lux"));
  });

  it("shows no percentage, share or rate anywhere", () => {
    const { container } = render(<MetaPlayerHero name="Renata" facts={FACTS} counts={COUNTS} />);
    expect(container.textContent).not.toMatch(/%|\brate\b|\bshare\b/iu);
  });

  it("drops the parts the archive knows nothing about", () => {
    render(
      <MetaPlayerHero
        name="Renata"
        facts={{ country: null, firstDate: null, lastDate: null, topLegend: null }}
        counts={{ eventWins: 0, topEights: 0, finishes: 0, decklists: 0 }}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Renata" })).toBeInTheDocument();
    expect(screen.queryByText(/On record since/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/Last seen/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("names the player in the blurb", () => {
    render(<MetaPlayerHero name="Renata" facts={FACTS} counts={COUNTS} />);
    expect(
      screen.getByText(
        "Every Renata result on record: tournament finishes, the legends they brought, and the lists they registered.",
      ),
    ).toBeInTheDocument();
  });
});
