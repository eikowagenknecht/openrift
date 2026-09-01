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
    render(<MetaArchiveDeckTile deck={DECK} />);
    expect(
      screen.getByRole("link", { name: "Nova's Kennen, Heart of the Tempest decklist" }),
    ).toHaveAttribute("href", "/meta/decks/aB3dE5gH7jK9");
    expect(screen.getByRole("link", { name: "Kennen" })).toHaveAttribute(
      "href",
      "/meta/legends/kennen-heart-of-the-tempest",
    );
  });

  it("lifts the legend link itself above the permalink, not a wrapper around it", () => {
    render(<MetaArchiveDeckTile deck={DECK} />);
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
});
