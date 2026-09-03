import type { MetaActivityItem, MetaEventSummary } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  events: [] as MetaEventSummary[],
  activity: [] as MetaActivityItem[],
  search: {} as Record<string, string | string[] | undefined>,
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
    from,
    search,
    hash,
    hashScrollIntoView: _hashScrollIntoView,
    ...rest
  }: {
    children?: React.ReactNode;
    to?: string;
    params?: { slug?: string; token?: string; cardSlug?: string };
    from?: string;
    search?: unknown;
    hash?: string;
    hashScrollIntoView?: boolean;
  }) => (
    <a
      {...rest}
      href={`${(to ?? from ?? "/")
        .replace("$cardSlug", params?.cardSlug ?? "")
        .replace("$slug", params?.slug ?? "")
        .replace("$token", params?.token ?? "")}${hash === undefined ? "" : `#${hash}`}`}
      data-search={
        typeof search === "object" && search !== null ? JSON.stringify(search) : undefined
      }
    >
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaEvents: () => ({ data: { events: captured.events } }),
  useMetaActivity: () => ({ data: { items: captured.activity } }),
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

vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));

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

// The scope bar pulls chrome these tests do not exercise; what matters here is
// which facts the page puts on the screen.
vi.mock("@/components/meta/meta-scope-bar", () => ({ MetaScopeBar: () => null }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaFrontPage } from "./meta-front-page";

const WINNER = {
  rank: 1,
  rankIsTier: false,
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

const RUNNER_UP = {
  ...WINNER,
  rank: 2,
  playerName: "S. Okafor",
  wins: 13,
  losses: 2,
};

function event(overrides: Partial<MetaEventSummary> = {}): MetaEventSummary {
  return {
    id: "evt-1",
    slug: "regional-qualifier-barcelona",
    name: "Regional Qualifier Barcelona",
    eventDate: "2026-08-23",
    format: "constructed",
    tier: "premier",
    country: "ES",
    location: "Fira de Barcelona",
    playerCount: 588,
    organizer: "Rift Events",
    playerRowCount: 588,
    deckCount: 32,
    topFinishes: [WINNER, RUNNER_UP],
    ...overrides,
  };
}

function activityItem(overrides: Partial<MetaActivityItem> = {}): MetaActivityItem {
  return {
    kind: "decks-added",
    occurredAt: "2026-08-25T12:00:00.000Z",
    count: 118,
    event: { slug: "regional-qualifier-barcelona", name: "Regional Qualifier Barcelona" },
    ...overrides,
  };
}

beforeEach(() => {
  navigate.mockReset();
  captured.events = [event()];
  captured.activity = [activityItem()];
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

/** @returns How many legend card frames a section renders. */
function thumbCount(scope: HTMLElement): number {
  return scope.querySelectorAll('[data-slot="card-art-thumb"]').length;
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

  it("shows an event's podium as rows: names, legends and records", () => {
    render(<MetaFrontPage />);

    const premier = section("Premier");
    expect(within(premier).getByText("M. Álvarez")).toBeInTheDocument();
    expect(within(premier).getByText("S. Okafor")).toBeInTheDocument();
    expect(within(premier).getAllByText("Azir").length).toBeGreaterThan(0);
    expect(within(premier).getByText("14-1-0")).toBeInTheDocument();
    expect(within(premier).getByText("13-2-0")).toBeInTheDocument();
  });

  it("draws the podium legends' domain runes", () => {
    render(<MetaFrontPage />);

    const premier = section("Premier");
    expect(within(premier).getAllByRole("img", { name: "Calm" }).length).toBeGreaterThan(0);
    expect(within(premier).getAllByRole("img", { name: "Order" }).length).toBeGreaterThan(0);
  });

  it("keeps the legend frame on every podium row when any finish names one", () => {
    captured.events = [event({ topFinishes: [WINNER, { ...RUNNER_UP, legend: null }] })];

    render(<MetaFrontPage />);

    expect(thumbCount(section("Premier"))).toBe(2);
  });

  it("drops the legend frame when no finish names one", () => {
    captured.events = [
      event({
        topFinishes: [
          { ...WINNER, legend: null },
          { ...RUNNER_UP, legend: null },
        ],
      }),
    ];

    render(<MetaFrontPage />);

    const premier = section("Premier");
    expect(thumbCount(premier)).toBe(0);
    expect(within(premier).getByText("M. Álvarez")).toBeInTheDocument();
  });

  it("names both players when the source published a tie at the top", () => {
    captured.events = [
      event({
        topFinishes: [
          WINNER,
          {
            ...WINNER,
            playerName: "J. Weber",
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

    const premier = section("Premier");
    expect(within(premier).getByText("M. Álvarez")).toBeInTheDocument();
    expect(within(premier).getByText("J. Weber")).toBeInTheDocument();
    expect(within(premier).getByText("Yasuo")).toBeInTheDocument();
  });

  it("sorts events into tier sections, store and casual sharing one", () => {
    captured.events = [
      event(),
      event({ id: "evt-2", slug: "paris-regional", name: "Paris Regional", tier: "competitive" }),
      event({ id: "evt-3", slug: "store-night", name: "Store Night", tier: "store" }),
      event({ id: "evt-4", slug: "casual-clash", name: "Casual Clash", tier: "casual" }),
    ];

    render(<MetaFrontPage />);

    expect(
      within(section("Premier")).getByText("Regional Qualifier Barcelona"),
    ).toBeInTheDocument();
    expect(within(section("Competitive")).getByText("Paris Regional")).toBeInTheDocument();
    const community = section("Store & casual");
    expect(within(community).getByText("Store Night")).toBeInTheDocument();
    expect(within(community).getByText("Casual Clash")).toBeInTheDocument();
  });

  it("leaves out a tier section with no events in scope", () => {
    captured.events = [event({ tier: "store" })];

    render(<MetaFrontPage />);

    expect(screen.queryByRole("heading", { name: "Premier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Competitive" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Store & casual" })).toBeInTheDocument();
  });

  it("names a store row's winner inline, with the champion they played", () => {
    captured.events = [event({ tier: "store" })];

    render(<MetaFrontPage />);

    const community = section("Store & casual");
    expect(within(community).getAllByText("M. Álvarez").length).toBeGreaterThan(0);
    expect(within(community).getAllByText("on Azir").length).toBeGreaterThan(0);
  });

  it("links each event at its own page", () => {
    render(<MetaFrontPage />);

    const premier = section("Premier");
    expect(
      within(premier).getByRole("link", { name: /Regional Qualifier Barcelona/u }),
    ).toHaveAttribute("href", "/meta/$slug".replace("$slug", "regional-qualifier-barcelona"));
  });

  it("says the archive is empty rather than showing empty sections", () => {
    captured.events = [];

    render(<MetaFrontPage />);

    expect(screen.getByText("No events archived yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Premier" })).not.toBeInTheDocument();
  });

  it("says so when a scope matches nothing, keeping the controls in place", () => {
    captured.search = { tiers: ["casual"] };

    render(<MetaFrontPage />);

    expect(screen.getByText("No archived events match this scope.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Premier" })).not.toBeInTheDocument();
    expect(screen.getByText("Help complete the record")).toBeInTheDocument();
  });

  it("lists what landed in the archive lately", () => {
    captured.activity = [
      activityItem(),
      activityItem({ kind: "event-added", count: null, occurredAt: "2026-08-24T09:00:00.000Z" }),
    ];

    render(<MetaFrontPage />);

    const fresh = section("Fresh in the archive");
    expect(within(fresh).getByText("118 decklists added")).toBeInTheDocument();
    expect(within(fresh).getByText("New event on record")).toBeInTheDocument();
  });

  it("stands the activity list down while the page is narrowed", () => {
    captured.search = { tiers: ["premier"] };

    render(<MetaFrontPage />);

    expect(screen.queryByRole("heading", { name: "Fresh in the archive" })).not.toBeInTheDocument();
  });

  it("leaves out the activity section when the archive has nothing to report", () => {
    captured.activity = [];

    render(<MetaFrontPage />);

    expect(screen.queryByRole("heading", { name: "Fresh in the archive" })).not.toBeInTheDocument();
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

  it("leads anyone to the legend index and the deck browser", () => {
    render(<MetaFrontPage />);

    const actions = pageActions() as HTMLElement;
    expect(within(actions).getByText("Legends")).toBeInTheDocument();
    expect(within(actions).getByText("Decklists")).toBeInTheDocument();
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

  it("promises exactly the number of events the tier link narrows to", () => {
    captured.events = [
      event(),
      event({ id: "evt-2", slug: "worlds", name: "Worlds", tier: "premier" }),
      event({ id: "evt-3", slug: "store-night", name: "Store Night", tier: "store" }),
    ];
    // Scoped down to one event by search: the link still counts the whole
    // tier, because that is what the narrowed index opens on.
    captured.search = { q: "Worlds" };

    render(<MetaFrontPage />);

    expect(within(section("Premier")).getByRole("link", { name: "Browse all 2" })).toHaveAttribute(
      "href",
      "/meta/events",
    );
  });

  it("holds an event with no results out of the tier sections and in the rail", () => {
    captured.events = [
      event(),
      event({
        id: "evt-2",
        slug: "worlds-2099",
        name: "Worlds 2099",
        eventDate: "2099-06-01",
        playerRowCount: 0,
        deckCount: 0,
        topFinishes: [],
      }),
    ];

    render(<MetaFrontPage />);

    expect(within(section("Premier")).queryByText("Worlds 2099")).not.toBeInTheDocument();
    expect(within(section("Coming up")).getByText("Worlds 2099")).toBeInTheDocument();
  });

  it("opens the whole upcoming list soonest first", () => {
    captured.events = [
      event(),
      event({ id: "evt-2", slug: "worlds-2099", name: "Worlds 2099", eventDate: "2099-06-01" }),
      event({ id: "evt-3", slug: "nexus-2100", name: "Nexus 2100", eventDate: "2100-01-01" }),
    ];

    render(<MetaFrontPage />);

    const link = within(section("Coming up")).getByRole("link", { name: "All 2" });
    expect(link).toHaveAttribute("href", "/meta/events");
    expect(link).toHaveAttribute(
      "data-search",
      JSON.stringify({ holds: "upcoming", by: "date", dir: "asc" }),
    );
  });

  it("teases the nearest upcoming event, which on a phone sits below the tiers", () => {
    captured.events = [
      event(),
      event({ id: "evt-2", slug: "worlds-2099", name: "Worlds 2099", eventDate: "2099-06-01" }),
      event({ id: "evt-3", slug: "nexus-2100", name: "Nexus 2100", eventDate: "2100-01-01" }),
    ];

    render(<MetaFrontPage />);

    const teaser = screen.getByRole("link", { name: /Next up/u });
    expect(teaser).toHaveAttribute("href", "/meta#coming-up");
    expect(within(teaser).getByText("Worlds 2099")).toBeInTheDocument();
    expect(within(teaser).getByText("2 upcoming events")).toBeInTheDocument();
  });

  it("says no results are on file when the scope holds only events still to come", () => {
    captured.events = [
      event({ eventDate: "2099-06-01", playerRowCount: 0, deckCount: 0, topFinishes: [] }),
    ];

    render(<MetaFrontPage />);

    expect(screen.getByText("No results on file for this scope yet.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Premier" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coming up" })).toBeInTheDocument();
  });

  it("leaves the rail's upcoming section out when nothing is scheduled", () => {
    render(<MetaFrontPage />);

    expect(screen.queryByRole("heading", { name: "Coming up" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Next up/u)).not.toBeInTheDocument();
  });
});
