import type { MetaDeckSummary } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children?: React.ReactNode;
    to?: string;
    params?: { token?: string; slug?: string; cardSlug?: string };
  }) => (
    <a
      {...rest}
      href={(to ?? "/")
        .replace("$token", params?.token ?? "")
        .replace("$slug", params?.slug ?? "")
        .replace("$cardSlug", params?.cardSlug ?? "")}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: { domains: [] }, labels: { domains: {} } }),
}));
vi.mock("@/components/deck/deck-tile", () => ({ FannedPreview: () => null }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaArchiveDeckTile } from "./meta-archive-deck-tile";

const DECK: MetaDeckSummary = {
  playerId: "player-1",
  deckId: "deck-1",
  shareToken: "aB3dE5gH7jK9",
  listStatus: "full",
  name: "Kennen Tempo",
  format: "standard",
  legendCardId: "card-kennen",
  legendName: "Kennen, Heart of the Tempest",
  legendSlug: "kennen",
  legendArchiveSlug: "kennen-heart-of-the-tempest",
  legendImageId: null,
  championCardId: null,
  championName: null,
  championImageId: null,
  playerName: "Nova",
  rank: 1,
  rankIsTier: false,
  wins: 6,
  losses: 1,
  draws: 0,
  event: {
    slug: "regional-qualifier-barcelona",
    name: "Regional Qualifier Barcelona",
    eventDate: "2026-08-23",
    format: "standard",
    tier: "premier",
    country: "ES",
  },
};

function tile(props: Partial<React.ComponentProps<typeof MetaArchiveDeckTile>> = {}) {
  return <MetaArchiveDeckTile deck={DECK} marketplace="cardtrader" {...props} />;
}

/** The tile frame, which owns the stretched permalink every other element sits under. */
function frameOf(element: HTMLElement): HTMLElement {
  const frame = element.closest<HTMLElement>(".group");
  if (frame === null) {
    throw new Error("tile frame not found");
  }
  return frame;
}

describe("MetaArchiveDeckTile", () => {
  it("sends the tile to the archived list and the legend to its own page", () => {
    render(tile());
    expect(
      screen.getByRole("link", { name: "Nova's Kennen, Heart of the Tempest decklist" }),
    ).toHaveAttribute("href", "/meta/decks/aB3dE5gH7jK9");
    expect(screen.getByRole("link", { name: "Kennen" })).toHaveAttribute(
      "href",
      "/meta/legends/kennen-heart-of-the-tempest",
    );
  });

  it("lifts the legend link itself above the permalink, not a wrapper around it", () => {
    render(tile());
    const legend = screen.getByRole("link", { name: "Kennen" });
    expect(legend).toHaveClass("relative");

    // A positioned ancestor is a full-width flex child, so it would cover the
    // stretched permalink across the whole card body while only the short name
    // inside it led anywhere.
    const frame = frameOf(legend);
    for (
      let node = legend.parentElement;
      node !== null && node !== frame;
      node = node.parentElement
    ) {
      expect(node.classList.contains("relative")).toBe(false);
    }
  });

  it("places the finish in the field it was reached in", () => {
    render(tile({ fieldSize: 86 }));
    expect(screen.getByText("of 86")).toBeInTheDocument();
  });

  it("leaves the field out when no source published one", () => {
    render(tile());
    expect(screen.queryByText(/^of /u)).not.toBeInTheDocument();
  });

  it("prints a bracket finish as the bracket it is", () => {
    render(tile({ deck: { ...DECK, rank: 8, rankIsTier: true } }));
    expect(screen.getByText("T8")).toBeInTheDocument();
  });

  it("pins what the list is worth over the art", () => {
    render(tile({ cost: { needed: 40, owned: undefined, value: 120, toComplete: undefined } }));
    expect(screen.getByText("120 €")).toBeInTheDocument();
  });

  it("counts the reader's own cards and what the rest would cost", () => {
    render(tile({ cost: { needed: 40, owned: 34, value: 120, toComplete: 30 } }));
    expect(screen.getByText("34 of 40 owned")).toBeInTheDocument();
    expect(screen.getByText("30 €").parentElement).toHaveTextContent("30 € to complete");
  });

  it("says a fully owned list is buildable", () => {
    render(tile({ cost: { needed: 40, owned: 40, value: 120, toComplete: 0 } }));
    expect(screen.getByText("All 40 owned")).toBeInTheDocument();
    expect(screen.getByText("Buildable")).toBeInTheDocument();
  });

  it("counts nothing for a reader with no collection loaded", () => {
    render(tile({ cost: { needed: 40, owned: undefined, value: 120, toComplete: undefined } }));
    expect(screen.queryByText(/owned/u)).not.toBeInTheDocument();
  });
});
