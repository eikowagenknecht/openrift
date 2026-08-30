import type { MetaDeckSummary, MetaEventSummary } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  events: [] as MetaEventSummary[],
  decks: [] as MetaDeckSummary[],
  search: {} as Record<string, string | undefined>,
  userId: null as string | null,
  submissionCount: 0,
}));

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useSearch: () => captured.search,
    useNavigate: () => navigate,
  }),
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children?: React.ReactNode;
    to?: string;
    params?: { slug?: string; token?: string; cardSlug?: string };
  }) => (
    <a
      {...rest}
      href={(to ?? "/")
        .replace("$cardSlug", params?.cardSlug ?? "")
        .replace("$slug", params?.slug ?? "")
        .replace("$token", params?.token ?? "")}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaEvents: () => ({ data: { events: captured.events } }),
  useMetaDecks: () => ({ data: { decks: captured.decks } }),
}));

vi.mock("@/hooks/use-meta-eras", () => ({ useMetaEras: () => [] }));

vi.mock("@/hooks/use-meta-submissions", () => ({
  useMetaSubmissions: () => ({
    data: { pages: [{ items: Array.from({ length: captured.submissionCount }, () => ({})) }] },
  }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "standard", label: "Standard" }],
    labels: { standard: "Standard" },
  }),
  useEnumOrders: () => ({
    orders: { domains: ["calm", "order", "fury"] },
    labels: { domains: { calm: "Calm", order: "Order", fury: "Fury" } },
  }),
}));

vi.mock("@/hooks/use-admin", () => ({ useIsAdmin: () => ({ data: false }) }));

vi.mock("@/lib/auth-session", () => ({ useUserId: () => captured.userId }));

vi.mock("@/components/layout/page-top-bar", () => ({
  PageTopBar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarActions: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="page-actions">{children}</div>
  ),
  PageTopBarButton: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarPrimaryButton: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarSticky: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarTitle: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
}));

// The scope bar and the fanned deck art both pull chrome these tests do not
// exercise; what matters here is which facts the page puts on the screen.
vi.mock("@/components/meta/meta-scope-bar", () => ({ MetaScopeBar: () => null }));
vi.mock("@/components/deck/deck-tile", () => ({ FannedPreview: () => null }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaFrontPage } from "./meta-front-page";

const WINNER = {
  playerName: "M. Álvarez",
  wins: 14,
  losses: 1,
  draws: 0,
  legend: {
    cardId: "card-azir",
    name: "Azir, Emperor of the Sands",
    slug: "azir-emperor-of-the-sands",
    imageId: null,
    domains: ["calm", "order"],
    archiveSlug: "azir-emperor-of-the-sands",
  },
};

function event(overrides: Partial<MetaEventSummary> = {}): MetaEventSummary {
  return {
    id: "evt-1",
    slug: "regional-qualifier-barcelona",
    name: "Regional Qualifier Barcelona",
    eventDate: "2026-08-23",
    format: "standard",
    tier: "premier",
    country: "ES",
    location: "Fira de Barcelona",
    playerCount: 588,
    organizer: "Rift Events",
    playerRowCount: 588,
    deckCount: 32,
    winners: [WINNER],
    ...overrides,
  };
}

function deck(overrides: Partial<MetaDeckSummary> = {}): MetaDeckSummary {
  return {
    playerId: "player-1",
    deckId: "deck-1",
    shareToken: "aB3dE5gH7jK9",
    listStatus: "full",
    name: "Azir Control",
    format: "standard",
    legendCardId: "card-azir",
    legendName: "Azir, Emperor of the Sands",
    legendSlug: "azir-emperor-of-the-sands",
    legendImageId: null,
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: "L. Moreau",
    rank: 2,
    rankIsTier: false,
    wins: 13,
    losses: 2,
    draws: 0,
    event: {
      slug: "regional-qualifier-barcelona",
      name: "Regional Qualifier Barcelona",
      eventDate: "2026-08-23",
      format: "standard",
    },
    ...overrides,
  };
}

beforeEach(() => {
  navigate.mockReset();
  captured.events = [event()];
  captured.decks = [deck()];
  captured.search = {};
  captured.userId = null;
  captured.submissionCount = 0;
});

/** @returns The section following the heading with this name. */
function section(name: string): HTMLElement {
  return screen.getByRole("heading", { name }).closest("section") as HTMLElement;
}

/** @returns The headline numeral printed above one of the archive-count labels. */
function archiveCount(label: string): string {
  return screen.getByText(label).previousElementSibling?.textContent ?? "";
}

/** @returns The signed-in action row, empty when the page renders none. */
function pageActions(): HTMLElement | null {
  return screen.queryByTestId("page-actions");
}

describe("MetaFrontPage", () => {
  it("counts what the archive holds in scope, without rating anything", () => {
    captured.events = [event(), event({ id: "evt-2", playerRowCount: 12, deckCount: 2 })];

    render(<MetaFrontPage />);

    expect(archiveCount("archived events")).toBe("2");
    expect(archiveCount("player results")).toBe("600");
    expect(archiveCount("decklists")).toBe("34");
    expect(document.body.textContent).not.toContain("%");
  });

  it("names the winner, their legend and their full record", () => {
    render(<MetaFrontPage />);

    const winners = section("Latest winners");
    expect(within(winners).getByText("M. Álvarez")).toBeInTheDocument();
    expect(within(winners).getByText("Azir")).toBeInTheDocument();
    expect(within(winners).getByText("Emperor of the Sands")).toBeInTheDocument();
    expect(within(winners).getByText("· 14-1-0")).toBeInTheDocument();
  });

  it("draws the winning legend's domain runes", () => {
    render(<MetaFrontPage />);

    const winners = section("Latest winners");
    expect(within(winners).getByRole("img", { name: "Calm" })).toBeInTheDocument();
    expect(within(winners).getByRole("img", { name: "Order" })).toBeInTheDocument();
  });

  it("names both players when the source published a tie at the top", () => {
    captured.events = [
      event({
        winners: [
          WINNER,
          {
            playerName: "J. Weber",
            wins: 14,
            losses: 1,
            draws: 0,
            legend: {
              cardId: "card-yasuo",
              name: "Yasuo, the Unforgiven",
              slug: "yasuo-the-unforgiven",
              imageId: null,
              domains: ["fury"],
              archiveSlug: "yasuo-the-unforgiven",
            },
          },
        ],
      }),
    ];

    render(<MetaFrontPage />);

    const winners = section("Latest winners");
    expect(within(winners).getByText("M. Álvarez")).toBeInTheDocument();
    expect(within(winners).getByText("J. Weber")).toBeInTheDocument();
    expect(within(winners).getByText("Yasuo")).toBeInTheDocument();
    // One card for the event, not one per name.
    expect(within(winners).getAllByRole("link")).toHaveLength(1);
  });

  it("leaves out the winners section when no event has archived standings", () => {
    captured.events = [event({ winners: [] })];

    render(<MetaFrontPage />);

    expect(screen.queryByRole("heading", { name: "Latest winners" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent events" })).toBeInTheDocument();
  });

  it("links each recent event at its own page", () => {
    render(<MetaFrontPage />);

    const events = section("Recent events");
    expect(
      within(events).getByRole("link", { name: /Regional Qualifier Barcelona/u }),
    ).toHaveAttribute("href", "/meta/$slug".replace("$slug", "regional-qualifier-barcelona"));
  });

  it("says the archive is empty rather than showing empty sections", () => {
    captured.events = [];

    render(<MetaFrontPage />);

    expect(screen.getByText("No events archived yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent events" })).not.toBeInTheDocument();
  });

  it("says so when a scope matches nothing, keeping the controls in place", () => {
    captured.search = { tier: "casual" };

    render(<MetaFrontPage />);

    expect(screen.getByText("No archived events match this scope.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent events" })).not.toBeInTheDocument();
    expect(screen.getByText("Help complete the record")).toBeInTheDocument();
  });

  it("narrows every section from one scope", () => {
    captured.events = [event(), event({ id: "evt-2", slug: "store-night", tier: "store" })];
    captured.decks = [
      deck(),
      deck({
        deckId: "deck-2",
        event: {
          slug: "store-night",
          name: "Store Night",
          eventDate: "2026-08-24",
          format: "standard",
        },
      }),
    ];
    captured.search = { tier: "premier" };

    render(<MetaFrontPage />);

    expect(screen.queryByText("Store Night")).not.toBeInTheDocument();
    expect(within(section("Newest decklists")).getByText("L. Moreau")).toBeInTheDocument();
  });

  it("offers a signed-out visitor no action that would need an account", () => {
    render(<MetaFrontPage />);

    const actions = pageActions() as HTMLElement;
    expect(within(actions).queryByText("Send a decklist")).not.toBeInTheDocument();
    expect(within(actions).queryByText("Your contributions")).not.toBeInTheDocument();
    // The contribute band still explains where lists come from; it just leads
    // through sign-in rather than promising a form.
    expect(screen.getByText("Help complete the record")).toBeInTheDocument();
  });

  it("leads anyone to the legend index", () => {
    render(<MetaFrontPage />);

    expect(within(pageActions() as HTMLElement).getByText("Legends")).toBeInTheDocument();
  });

  it("offers the ledger only once a signed-in visitor has sent something", () => {
    captured.userId = "user-1";

    render(<MetaFrontPage />);

    const actions = pageActions() as HTMLElement;
    expect(within(actions).getByText("Send a decklist")).toBeInTheDocument();
    expect(within(actions).queryByText("Your contributions")).not.toBeInTheDocument();
  });

  it("offers the ledger to a contributor", () => {
    captured.userId = "user-1";
    captured.submissionCount = 3;

    render(<MetaFrontPage />);

    expect(
      within(pageActions() as HTMLElement).getByText("Your contributions"),
    ).toBeInTheDocument();
  });

  it("promises exactly the number of events the index behind the link lists", () => {
    captured.events = [event(), event({ id: "evt-2", slug: "store-night", tier: "store" })];
    // Scoped away from half the archive: the link still counts the whole of it,
    // because that is what /meta/events opens on.
    captured.search = { tier: "premier" };

    render(<MetaFrontPage />);

    const events = section("Recent events");
    expect(within(events).getByRole("link", { name: "Browse all 2" })).toHaveAttribute(
      "href",
      "/meta/events",
    );
  });

  it("promises exactly the number of decks the browser behind the link lists", () => {
    captured.events = [event(), event({ id: "evt-2", slug: "store-night", tier: "store" })];
    captured.decks = [
      deck(),
      deck({
        deckId: "deck-2",
        event: {
          slug: "store-night",
          name: "Store Night",
          eventDate: "2026-08-24",
          format: "standard",
        },
      }),
    ];
    // Scoped away from half the archive: the link still counts the whole of it,
    // because that is what /meta/decks opens on.
    captured.search = { tier: "premier" };

    render(<MetaFrontPage />);

    const decklists = section("Newest decklists");
    expect(within(decklists).getByRole("link", { name: "Browse all 2" })).toHaveAttribute(
      "href",
      "/meta/decks",
    );
  });
});
