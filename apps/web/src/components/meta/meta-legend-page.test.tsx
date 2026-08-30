import type { MetaDeckSummary, MetaLegendDetailResponse } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  legend: {} as MetaLegendDetailResponse,
  decks: [] as MetaDeckSummary[],
}));

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
  return {
    getRouteApi: () => ({ useParams: () => ({ slug: "kennen-heart-of-the-tempest" }) }),
    Link: Anchor,
    createLink: () => Anchor,
  };
});

vi.mock("@/hooks/use-meta", () => ({
  useMetaLegend: () => ({ data: captured.legend }),
  useMetaDecks: () => ({ data: { decks: captured.decks } }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["fury"] },
    labels: { domains: { fury: "Fury" } },
  }),
  useDeckFormatList: () => ({ labels: { constructed: "Constructed" }, order: ["constructed"] }),
}));

vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));
vi.mock("@/lib/auth-session", () => ({ useUserId: () => null }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaLegendPage } from "./meta-legend-page";

const LEGEND = {
  cardId: "card-kennen",
  name: "Kennen, Heart of the Tempest",
  slug: "heart-of-the-tempest",
  imageId: null,
  domains: ["fury"],
  archiveSlug: "kennen-heart-of-the-tempest",
};

function finish(rank: number, shareToken: string | null, playerId: string, eventSlug?: string) {
  return {
    playerId,
    rank,
    rankIsTier: false,
    playerName: `Pilot ${playerId}`,
    wins: 12,
    losses: 1,
    draws: 0,
    shareToken,
    listStatus: shareToken === null ? ("none" as const) : ("full" as const),
    event: {
      slug: eventSlug ?? "city-challenge-lyon",
      name: "City Challenge Lyon",
      eventDate: "2026-08-09",
      format: "constructed",
      tier: "competitive" as const,
      country: "FR",
      playerCount: 186,
    },
  };
}

function deck(deckId: string, legendCardId: string | null): MetaDeckSummary {
  return {
    playerId: `p-${deckId}`,
    deckId,
    shareToken: `tok-${deckId}`,
    listStatus: "full",
    name: "Kennen Tempo",
    format: "constructed",
    legendCardId,
    legendName: "Kennen, Heart of the Tempest",
    legendSlug: "heart-of-the-tempest",
    legendImageId: null,
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: "P. Lefebvre",
    rank: 1,
    rankIsTier: false,
    wins: 12,
    losses: 1,
    draws: 0,
    event: {
      slug: "city-challenge-lyon",
      name: "City Challenge Lyon",
      eventDate: "2026-08-09",
      format: "constructed",
    },
  };
}

function renderPage(finishes: MetaLegendDetailResponse["finishes"], decks: MetaDeckSummary[] = []) {
  captured.legend = { slug: "kennen-heart-of-the-tempest", legend: LEGEND, finishes };
  captured.decks = decks;
  render(<MetaLegendPage />);
}

describe("MetaLegendPage", () => {
  it("counts wins, finishes and the lists the grid renders", () => {
    renderPage(
      [
        finish(1, "tok-a", "a"),
        finish(1, null, "b", "regional-lyon"),
        finish(6, null, "c", "store-night"),
      ],
      [deck("tok-a", "card-kennen"), deck("other", "card-azir")],
    );

    const wins = screen.getByText("event wins").previousSibling as HTMLElement;
    expect(wins.textContent).toBe("2");
    const finishes = screen.getByText("archived finishes").previousSibling as HTMLElement;
    expect(finishes.textContent).toBe("3");
    const lists = screen.getByText("decklists").previousSibling as HTMLElement;
    expect(lists.textContent).toBe("1");
  });

  it("shows only the decklists filed under this legend", () => {
    renderPage([finish(1, "tok-a", "a")], [deck("tok-a", "card-kennen"), deck("x", "card-azir")]);
    const grid = screen.getByRole("heading", { name: "Archived decklists" })
      .parentElement as HTMLElement;
    expect(within(grid).getAllByRole("listitem")).toHaveLength(1);
  });

  it("drops the decklist section for a legend with no list on file", () => {
    renderPage([finish(4, null, "a")]);
    expect(screen.queryByText("Archived decklists")).not.toBeInTheDocument();
  });

  it("trails back through the archive to this legend", () => {
    renderPage([]);
    expect(screen.getByRole("link", { name: "Legends" })).toHaveAttribute("href", "/meta/legends");
  });

  it("publishes no percentage, rate or share", () => {
    const { container } = render(<MetaLegendPage />);
    expect(container.textContent).not.toMatch(/%|\brate\b|\bshare\b/iu);
  });
});
