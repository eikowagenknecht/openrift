import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  meta: null as {
    listStatus: string;
    contributors: string[];
  } | null,
  userId: null as string | null,
  cards: [] as Record<string, unknown>[],
  unknownZoneCounts: null as ReadonlyMap<string, number> | null,
}));

// The surface itself is the public share renderer; these tests are about what
// the archive hands it, so it renders only the slots under test.
vi.mock("@/components/deck/public-deck-surface", () => ({
  PublicDeckSurface: ({
    topBar,
    notice,
    footer,
    heroByline,
    unknownZoneCounts,
  }: {
    topBar?: React.ReactNode;
    notice?: React.ReactNode;
    footer?: React.ReactNode;
    heroByline?: React.ReactNode;
    unknownZoneCounts?: ReadonlyMap<string, number>;
  }) => {
    captured.unknownZoneCounts = unknownZoneCounts ?? null;
    return (
      <div>
        {topBar}
        {heroByline}
        {notice}
        {footer}
      </div>
    );
  },
}));

vi.mock("@/components/meta/meta-deck-archive-bar", () => ({
  MetaDeckArchiveBar: ({ actions }: { actions: React.ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaDeck: () => ({
    data: {
      deck: { format: "constructed", name: "Azir Control", formatConfig: null, links: [] },
      cards: captured.cards,
      meta: {
        event: { slug: "summoner-skirmish", name: "Summoner Skirmish", eventDate: "2026-08-01" },
        playerName: "Nova",
        rank: 1,
        rankIsTier: false,
        wins: 5,
        losses: 1,
        draws: null,
        ...captured.meta,
      },
    },
  }),
}));

vi.mock("@/hooks/use-decks", () => ({
  useCloneSharedDeck: () => ({ isPending: false }),
  useEncodeDeckCards: () => ({ isPending: false }),
}));
vi.mock("@/lib/auth-session", () => ({ useUserId: () => captured.userId }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/meta">{children}</a>,
  useNavigate: () => vi.fn(),
  createLink: (component: unknown) => component,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaDeckPage } from "./meta-deck-page";

/** One deck card, filled out enough for the encoder and the zone counting. */
function deckCard(zone: string, quantity: number): Record<string, unknown> {
  return {
    cardId: `card-${zone}`,
    zone,
    quantity,
    preferredPrintingId: null,
    cardName: "Punch First",
    cardType: "spell",
    cardTypes: ["spell"],
    superTypes: [],
    domains: ["fury"],
    tags: [],
  };
}

/** Renders the page for one archived deck's contributors and list status. */
function renderDeck(
  meta: { listStatus?: string; contributors?: string[] } = {},
  cards: { zone: string; quantity: number }[] = [],
): void {
  captured.meta = { listStatus: "full", contributors: [], ...meta };
  captured.cards = cards.map((card) => deckCard(card.zone, card.quantity));
  render(<MetaDeckPage token="aB3dE5gH7jK9" />);
}

/** @returns The contributor line's text, or null when there is none. */
function line(): string | null {
  return screen.queryByText(/^Contributed by/u)?.textContent ?? null;
}

describe("MetaDeckPage contributors", () => {
  beforeEach(() => {
    captured.meta = null;
    captured.userId = null;
    captured.cards = [];
    captured.unknownZoneCounts = null;
  });

  it("renders nothing when nobody is credited", () => {
    renderDeck();
    expect(line()).toBeNull();
  });

  it("names a single contributor", () => {
    renderDeck({ contributors: ["Alice"] });
    expect(line()).toBe("Contributed by Alice");
  });

  it("names several", () => {
    renderDeck({ contributors: ["Alice", "Bob", "Carol"] });
    expect(line()).toBe("Contributed by Alice, Bob and Carol");
  });

  it("collapses past the threshold, exactly as the event page does", () => {
    renderDeck({ contributors: ["Alice", "Bob", "Carol", "Dan", "Erin"] });
    expect(line()).toBe("Contributed by Alice, Bob, Carol and 2 others");
  });

  it("credits nobody with a profile link", () => {
    renderDeck({ contributors: ["Alice", "Bob"] });
    expect(screen.queryByRole("link", { name: /Alice|Bob/u })).toBeNull();
  });

  it("sits alongside the incomplete-list callout rather than replacing it", () => {
    renderDeck({ listStatus: "partial", contributors: ["Alice"] });
    expect(screen.getByText("This list is incomplete")).toBeDefined();
    expect(line()).toBe("Contributed by Alice");
  });

  it("leaves the callout out when there is neither one nor a credit", () => {
    renderDeck();
    expect(screen.queryByText("This list is incomplete")).toBeNull();
    expect(line()).toBeNull();
  });

  it("always offers the correction link, credited or not", () => {
    renderDeck();
    expect(screen.getByText("Something wrong? Suggest a correction")).toBeDefined();
  });
});

describe("MetaDeckPage archive frame", () => {
  beforeEach(() => {
    captured.meta = null;
    captured.userId = null;
    captured.cards = [];
    captured.unknownZoneCounts = null;
  });

  it("bylines the finish, the player, the record and the event", () => {
    renderDeck();
    expect(screen.getByText("Nova")).toBeDefined();
    expect(screen.getByText("5-1-0")).toBeDefined();
    expect(screen.getByText("Summoner Skirmish")).toBeDefined();
  });

  it("offers to complete a partial list", () => {
    renderDeck({ listStatus: "partial" });
    expect(screen.getByText("Know the missing cards? Complete it")).toBeDefined();
  });

  it("marks the zones a partial list never published as unknown", () => {
    renderDeck({ listStatus: "partial" });
    expect(captured.unknownZoneCounts?.get("battlefield")).toBe(3);
  });

  it("marks nothing unknown on a full list", () => {
    renderDeck();
    expect(captured.unknownZoneCounts?.size).toBe(0);
  });

  it("names what a partial list is missing rather than assuming the main deck is whole", () => {
    renderDeck({ listStatus: "partial" }, [{ zone: "main", quantity: 34 }]);
    expect(screen.getByText(/34 of 39 main deck cards are known/u, { exact: false })).toBeDefined();
  });

  it("says nothing about the sideboard, which the archive makes no claim about", () => {
    renderDeck({ listStatus: "partial" }, [{ zone: "main", quantity: 34 }]);
    expect(screen.queryByText(/sideboard/u)).toBeNull();
  });

  it("qualifies the hero's ownership chip for a signed-in reader", () => {
    captured.userId = "user-1";
    renderDeck({ listStatus: "partial" });
    expect(
      screen.getByText(/Your collection is compared against the known cards only/u, {
        exact: false,
      }),
    ).toBeDefined();
  });

  it("leaves that qualification off for a signed-out reader, who has no chip", () => {
    renderDeck({ listStatus: "partial" });
    expect(screen.queryByText(/Your collection/u)).toBeNull();
  });

  it("labels the fork for a signed-out reader as opening the builder", () => {
    renderDeck();
    expect(screen.getByRole("button", { name: "Open in deck builder" })).toBeDefined();
  });

  it("labels the fork for a signed-in reader as forking", () => {
    captured.userId = "user-1";
    renderDeck();
    expect(screen.getByRole("button", { name: "Fork to my decks" })).toBeDefined();
  });

  it("offers the deck code", () => {
    renderDeck();
    expect(screen.getByRole("button", { name: "Copy deck code" })).toBeDefined();
  });
});
