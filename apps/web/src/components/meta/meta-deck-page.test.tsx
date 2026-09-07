import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  meta: null as {
    listStatus: string;
    contributors: string[];
    playerKey?: string | null;
    rank?: number;
    rankIsTier?: boolean;
    wins?: number | null;
    losses?: number | null;
    event?: Record<string, unknown>;
  } | null,
  userId: null as string | null,
  cards: [] as Record<string, unknown>[],
  unknownZoneCounts: null as ReadonlyMap<string, number> | null,
}));

// Stubs the public share renderer's slots; these tests are about what the archive hands it.
vi.mock("@/components/deck/public-deck-surface", () => ({
  PublicDeckSurface: ({
    topBar,
    notice,
    footer,
    heroHeading,
    heroLead,
    unknownZoneCounts,
  }: {
    topBar?: React.ReactNode;
    notice?: React.ReactNode;
    footer?: React.ReactNode;
    heroHeading?: React.ReactNode;
    heroLead?: React.ReactNode;
    unknownZoneCounts?: ReadonlyMap<string, number>;
  }) => {
    captured.unknownZoneCounts = unknownZoneCounts ?? null;
    return (
      <div>
        {topBar}
        {heroLead}
        {heroHeading}
        {notice}
        {footer}
      </div>
    );
  },
}));

// DomainIcon reads enum orders off a suspense query this file has no client for.
vi.mock("@/components/deck/domain-icon", () => ({
  DomainIcon: ({ domain }: { domain: string }) => <span>{domain}</span>,
}));

// Mounts print/export dialogs that subscribe a draft collection this file has no query client for.
vi.mock("@/components/deck/public-deck-actions-menu", () => ({
  PublicDeckActionsMenu: () => <div>Deck actions</div>,
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
        playerName: "Nova",
        playerKey: "u2001",
        rank: 1,
        rankIsTier: false,
        wins: 5,
        losses: 1,
        draws: null,
        ...captured.meta,
        event: {
          slug: "summoner-skirmish",
          name: "Summoner Skirmish",
          eventDate: "2026-08-01",
          format: "constructed",
          tier: "competitive",
          country: "DE",
          playerCount: 128,
          ...captured.meta?.event,
        },
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
  Link: ({
    children,
    to,
    params,
  }: {
    children?: React.ReactNode;
    to?: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to ?? "/meta",
      )}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  createLink: (component: unknown) => component,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaDeckPage } from "./meta-deck-page";

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

function renderDeck(
  meta: {
    listStatus?: string;
    contributors?: string[];
    playerKey?: string | null;
    rank?: number;
    rankIsTier?: boolean;
    wins?: number | null;
    losses?: number | null;
    event?: Record<string, unknown>;
  } = {},
  cards: { zone: string; quantity: number }[] = [],
): void {
  captured.meta = { listStatus: "full", contributors: [], ...meta };
  captured.cards = cards.map((card) => deckCard(card.zone, card.quantity));
  render(<MetaDeckPage token="aB3dE5gH7jK9" />);
}

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

  it("heads the page with the player, the finish, the record and the event", () => {
    renderDeck();
    expect(screen.getByText("Nova")).toBeDefined();
    expect(screen.getByText("1st")).toBeDefined();
    expect(screen.getByText("5-1-0")).toBeDefined();
    expect(screen.getByText("Summoner Skirmish")).toBeDefined();
  });

  it("states the finish against the field the source reported", () => {
    renderDeck();
    expect(screen.getByText("of 128 players")).toBeDefined();
  });

  it("leaves the field unsaid when no source published one", () => {
    renderDeck({ event: { playerCount: null } });
    expect(screen.queryByText(/players$/u)).toBeNull();
  });

  // The event date `2026-08-01` also matches the record pattern, so this counts matches.
  it("leaves the record out when the source published none, rather than inventing 0-0-0", () => {
    renderDeck({ wins: null, losses: null });
    expect(screen.getAllByText(/^\d+-\d+-\d+$/u)).toHaveLength(1);
  });

  it("prints a cut bucket as a tier rather than an exact place", () => {
    renderDeck({ rank: 8, rankIsTier: true });
    expect(screen.getByText("T8")).toBeDefined();
  });

  it("never prints the generated deck name", () => {
    renderDeck();
    expect(screen.queryByText("Azir Control")).toBeNull();
  });

  it("names the legend the list was played on", () => {
    renderDeck({}, [{ zone: "legend", quantity: 1 }]);
    expect(screen.getAllByText("Punch First").length).toBeGreaterThan(0);
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

  it("labels the copy for a signed-out reader as opening the builder", () => {
    renderDeck();
    expect(screen.getByRole("button", { name: "Open in deck builder" })).toBeDefined();
  });

  it("labels the copy for a signed-in reader as copying", () => {
    captured.userId = "user-1";
    renderDeck();
    expect(screen.getByRole("button", { name: "Copy to my decks" })).toBeDefined();
  });

  it("offers the overflow menu beside the copy button", () => {
    renderDeck();
    expect(screen.getByText("Deck actions")).toBeDefined();
  });

  it("sends the player to their page", () => {
    renderDeck();
    expect(screen.getByRole("link", { name: "Nova" })).toHaveAttribute(
      "href",
      "/meta/players/u2001",
    );
  });

  it("prints a player the source filed under no identity as plain text", () => {
    renderDeck({ playerKey: null });
    expect(screen.queryByRole("link", { name: "Nova" })).toBeNull();
    expect(screen.getByText("Nova")).toBeDefined();
  });
});
