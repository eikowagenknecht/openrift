import type { MetaDeckSummary, MetaEventSummary } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { MetaDeckEventSection, PREVIEW_TILES } from "./meta-deck-event-section";

const EVENT: MetaDeckSummary["event"] = {
  slug: "regional-qualifier-barcelona",
  name: "Regional Qualifier Barcelona",
  eventDate: "2026-08-23",
  format: "constructed",
  tier: "premier",
  country: "ES",
};

const SUMMARY: MetaEventSummary = {
  id: "event-1",
  slug: EVENT.slug,
  name: EVENT.name,
  eventDate: EVENT.eventDate,
  format: EVENT.format,
  tier: EVENT.tier,
  country: EVENT.country,
  location: "Barcelona",
  organizer: "Rift Open Series",
  playerCount: 86,
  playerRowCount: 41,
  deckCount: 41,
  topFinishes: [],
};

function deck(rank: number): MetaDeckSummary {
  return {
    playerId: `player-${rank}`,
    deckId: `deck-${rank}`,
    shareToken: `token${rank}`,
    listStatus: "full",
    name: "Kennen Tempo",
    format: "constructed",
    legendCardId: `card-${rank}`,
    legendName: "Kennen, Heart of the Tempest",
    legendSlug: "kennen",
    legendArchiveSlug: null,
    legendImageId: null,
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: `Pilot ${rank}`,
    rank,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: 0,
    event: EVENT,
  };
}

function decks(count: number): MetaDeckSummary[] {
  return Array.from({ length: count }, (_, index) => deck(index + 1));
}

function section(props: Partial<React.ComponentProps<typeof MetaDeckEventSection>> = {}) {
  return (
    <MetaDeckEventSection
      event={EVENT}
      summary={SUMMARY}
      decks={decks(1)}
      marketplace="cardtrader"
      {...props}
    />
  );
}

describe("MetaDeckEventSection", () => {
  it("heads the group with the event and its venue", () => {
    render(section());
    expect(
      screen.getByRole("heading", { name: /Regional Qualifier Barcelona/u }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rift Open Series · Barcelona")).toBeInTheDocument();
    expect(screen.getByText("86 players · 41 decks")).toBeInTheDocument();
    expect(screen.getByText("Premier")).toBeInTheDocument();
  });

  it("links the event name and the standings to the event page", () => {
    render(section());
    for (const name of ["Regional Qualifier Barcelona", "Standings"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute(
        "href",
        "/meta/regional-qualifier-barcelona",
      );
    }
  });

  it("heads the group from the deck's own fields when the archive holds no summary", () => {
    render(section({ summary: undefined }));
    expect(
      screen.getByRole("heading", { name: /Regional Qualifier Barcelona/u }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/players/u)).not.toBeInTheDocument();
  });

  it("tells each tile what field the finish was reached in", () => {
    render(section());
    expect(screen.getByText("of 86")).toBeInTheDocument();
  });

  it("folds everything past the first row away", async () => {
    render(section({ decks: decks(PREVIEW_TILES + 3) }));
    expect(screen.queryByText(`Pilot ${PREVIEW_TILES + 1}`)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show the other 3 lists" }));
    expect(screen.getByText(`Pilot ${PREVIEW_TILES + 1}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText(`Pilot ${PREVIEW_TILES + 1}`)).not.toBeInTheDocument();
  });

  it("offers no fold when everything already fits", () => {
    render(section({ decks: decks(PREVIEW_TILES) }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens expanded when the caller asks for it", () => {
    render(section({ decks: decks(PREVIEW_TILES + 1), defaultExpanded: true }));
    expect(screen.getByText(`Pilot ${PREVIEW_TILES + 1}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
  });
});
