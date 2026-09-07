import type { MetaDeckSummary } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { META_DECKS_DESCRIPTION } from "@/components/meta/meta-copy";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import { useDisplayStore } from "@/stores/display-store";

const captured = vi.hoisted(() => ({
  decks: [] as MetaDeckSummary[],
  search: {} as Record<string, unknown>,
  signedIn: false,
  costs: undefined as Map<string, MetaDeckCost> | undefined,
  hydrated: true,
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
    params?: { token?: string; cardSlug?: string; slug?: string };
  }) => (
    <a
      {...rest}
      href={(to ?? "/")
        .replace("$cardSlug", params?.cardSlug ?? "")
        .replace("$token", params?.token ?? "")
        .replace("$slug", params?.slug ?? "")}
    >
      {children}
    </a>
  ),
}));

const EVENT_SUMMARY = vi.hoisted(() => ({
  id: "event-1",
  slug: "regional-qualifier-barcelona",
  name: "Regional Qualifier Barcelona",
  eventDate: "2026-08-23",
  format: "constructed",
  tier: "premier",
  country: "ES",
  location: "Barcelona",
  organizer: "Rift Open Series",
  playerCount: 86,
  playerRowCount: 41,
  deckCount: 41,
  topFinishes: [],
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaDecks: () => ({ data: { decks: captured.decks, total: captured.decks.length } }),
  useMetaEvents: () => ({ data: { events: [EVENT_SUMMARY] } }),
}));
vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "standard", label: "Standard" }],
    labels: { standard: "Standard" },
  }),
}));
vi.mock("@/hooks/use-meta-eras", () => ({
  useMetaEras: () => [{ id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null }],
}));
vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => captured.hydrated }));
vi.mock("@/hooks/use-meta-deck-costs", () => ({
  useMetaDeckCosts: () => captured.costs,
}));
vi.mock("@/lib/auth-session", () => ({
  useSession: () => ({ data: captured.signedIn ? { user: { id: "u1" } } : null }),
}));

vi.mock("@/components/layout/page-top-bar", () => ({
  PageDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  PageTopBar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarBack: () => null,
  PageTopBarSticky: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarTitle: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("@/components/meta/meta-scope-bar", () => ({ MetaScopeBar: () => null }));
vi.mock("@/components/deck/deck-tile", () => ({ FannedPreview: () => null }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaDeckBrowserPage } from "./meta-deck-browser-page";

function deck(overrides: Partial<MetaDeckSummary> = {}): MetaDeckSummary {
  return {
    playerId: "player-1",
    deckId: "deck-1",
    shareToken: "aB3dE5gH7jK9",
    listStatus: "full",
    name: "Kennen Tempo",
    format: "constructed",
    legendCardId: "card-kennen",
    legendName: "Kennen, Heart of the Tempest",
    legendSlug: "kennen",
    legendArchiveSlug: null,
    legendImageId: null,
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: "Nova",
    playerKey: "u2001",
    rank: 1,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: 0,
    event: {
      slug: "regional-qualifier-barcelona",
      name: "Regional Qualifier Barcelona",
      eventDate: "2026-08-23",
      format: "constructed",
      tier: "premier",
      country: "ES",
      ...overrides.event,
    },
    ...overrides,
  };
}

const SAME_LEGEND_TWICE = [
  deck({ deckId: "winner", playerName: "Nova", rank: 1 }),
  deck({ deckId: "eighth", playerName: "Ekko", rank: 8 }),
];

describe("MetaDeckBrowserPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    captured.decks = SAME_LEGEND_TWICE;
    captured.search = {};
    captured.signedIn = false;
    captured.costs = undefined;
    captured.hydrated = true;
    useDisplayStore.setState({ metaDeckView: "list" });
  });

  const seen = (text: string) => screen.queryAllByText(text).length > 0;

  const lastSearch = () =>
    navigate.mock.calls.at(-1)?.[0].search as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;

  it("serves the page chrome without the archive before hydration", () => {
    captured.hydrated = false;
    render(<MetaDeckBrowserPage />);
    expect(screen.getByRole("heading", { name: "Archived decks" })).toBeInTheDocument();
    expect(seen(META_DECKS_DESCRIPTION)).toBe(true);
    expect(seen("Nova")).toBe(false);
    expect(screen.queryByRole("button", { name: "Every list" })).not.toBeInTheDocument();
  });

  it("opens on the best finish per legend at each event, as rows", () => {
    render(<MetaDeckBrowserPage />);
    expect(seen("Nova")).toBe(true);
    expect(seen("Ekko")).toBe(false);
    expect(seen("1 deck · 1 event")).toBe(true);
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  });

  it("counts what is shown against the archive in the top bar", () => {
    render(<MetaDeckBrowserPage />);
    expect(seen("1 of 2 archived decks")).toBe(true);
  });

  it("names the event and the field a finish came out of on each row", () => {
    render(<MetaDeckBrowserPage />);
    expect(seen("Regional Qualifier Barcelona")).toBe(true);
    expect(seen("of 86")).toBe(true);
    expect(seen("Premier")).toBe(true);
  });

  it("opens on premier and competitive events and holds the store nights back", () => {
    captured.decks = [
      deck({ deckId: "premier", playerName: "Nova" }),
      deck({
        deckId: "store",
        playerName: "Ekko",
        legendCardId: "card-lux",
        event: {
          slug: "store-night",
          name: "Store Night",
          eventDate: "2026-08-24",
          format: "constructed",
          tier: "local",
          country: "DE",
        },
      }),
    ];
    render(<MetaDeckBrowserPage />);
    expect(seen("Nova")).toBe(true);
    expect(seen("Ekko")).toBe(false);
  });

  it("lists every tier once the reader empties the tier facet", () => {
    captured.search = { tiers: [] };
    captured.decks = [
      deck({ deckId: "premier", playerName: "Nova" }),
      deck({
        deckId: "store",
        playerName: "Ekko",
        legendCardId: "card-lux",
        event: {
          slug: "store-night",
          name: "Store Night",
          eventDate: "2026-08-24",
          format: "constructed",
          tier: "local",
          country: "DE",
        },
      }),
    ];
    render(<MetaDeckBrowserPage />);
    expect(seen("Nova")).toBe(true);
    expect(seen("Ekko")).toBe(true);
  });

  it("offers every archived list one click away", async () => {
    render(<MetaDeckBrowserPage />);
    await userEvent.click(screen.getByRole("button", { name: "Every list" }));
    expect(lastSearch()({})).toEqual({ all: true });
  });

  it("lists every entry once the curation is off", () => {
    captured.search = { all: true };
    render(<MetaDeckBrowserPage />);
    expect(seen("Nova")).toBe(true);
    expect(seen("Ekko")).toBe(true);
    expect(seen("2 decks · 1 event")).toBe(true);
  });

  it("sorts by a column from its header and flips it on the second click", async () => {
    captured.search = { all: true };
    render(<MetaDeckBrowserPage />);
    await userEvent.click(screen.getByRole("button", { name: "Sort by value" }));
    expect(lastSearch()({})).toEqual({ by: "value", dir: "asc" });
    captured.search = { all: true, by: "value", dir: "asc" };
    render(<MetaDeckBrowserPage />);
    await userEvent.click(screen.getByRole("button", { name: "Value, sorted ascending" }));
    expect(lastSearch()(captured.search)).toEqual({ all: true, by: "value", dir: "desc" });
  });

  it("puts the cheapest list first when sorted by cost to complete", () => {
    captured.signedIn = true;
    captured.search = { all: true, by: "cost", dir: "asc" };
    captured.costs = new Map([
      ["winner", { owned: 10, needed: 40, value: 120, toComplete: 90 }],
      ["eighth", { owned: 38, needed: 40, value: 60, toComplete: 5 }],
    ]);
    render(<MetaDeckBrowserPage />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Ekko");
    expect(rows[1]).toHaveTextContent("Nova");
  });

  it("switches to tiles with a sort menu on the grid layout", async () => {
    useDisplayStore.setState({ metaDeckView: "grid" });
    render(<MetaDeckBrowserPage />);
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: "Sort" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sort by value" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "List" }));
    expect(useDisplayStore.getState().metaDeckView).toBe("list");
  });

  it("extends the rows a page at a time", async () => {
    captured.search = { all: true };
    captured.decks = Array.from({ length: 41 }, (_, index) =>
      deck({ deckId: `deck-${index}`, playerName: `Player ${index}`, rank: index + 1 }),
    );
    render(<MetaDeckBrowserPage />);
    expect(screen.getAllByRole("listitem")).toHaveLength(40);
    await userEvent.click(screen.getByRole("button", { name: "1 more deck" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(41);
  });

  it("counts the reader's own cards on each row once the collection is in", () => {
    captured.signedIn = true;
    captured.costs = new Map([["winner", { owned: 34, needed: 40, value: 120, toComplete: 30 }]]);
    render(<MetaDeckBrowserPage />);
    expect(seen("34/40 owned")).toBe(true);
    expect(screen.getAllByText("120 €").length).toBeGreaterThan(0);
  });

  it("narrows to the lists the reader can complete within their budget", () => {
    captured.signedIn = true;
    captured.search = { all: true, cost: 0 };
    captured.costs = new Map([
      ["winner", { owned: 40, needed: 40, value: 120, toComplete: 0 }],
      ["eighth", { owned: 4, needed: 40, value: 120, toComplete: 95 }],
    ]);
    render(<MetaDeckBrowserPage />);
    expect(seen("Nova")).toBe(true);
    expect(seen("Ekko")).toBe(false);
  });

  it("shows the whole archive on a shared cost link before any collection loads", () => {
    captured.search = { all: true, cost: 0 };
    render(<MetaDeckBrowserPage />);
    expect(seen("Nova")).toBe(true);
    expect(seen("Ekko")).toBe(true);
  });

  it("never narrows a signed-out reader by a cost they cannot be measured against", () => {
    captured.search = { all: true, cost: 0 };
    captured.costs = new Map([
      ["winner", { owned: undefined, needed: 40, value: 120, toComplete: undefined }],
      ["eighth", { owned: undefined, needed: 40, value: 120, toComplete: undefined }],
    ]);
    render(<MetaDeckBrowserPage />);
    expect(seen("Nova")).toBe(true);
    expect(seen("Ekko")).toBe(true);
  });

  it("sends the row's legend to its archive page and the rest of the row to the list", () => {
    captured.decks = [deck({ legendArchiveSlug: "kennen-heart-of-the-tempest" })];
    render(<MetaDeckBrowserPage />);
    expect(screen.getAllByRole("link", { name: "Kennen" })[0]).toHaveAttribute(
      "href",
      "/meta/legends/kennen-heart-of-the-tempest",
    );
    expect(
      screen.getByRole("link", { name: "Nova's Kennen, Heart of the Tempest decklist" }),
    ).toHaveAttribute("href", "/meta/decks/aB3dE5gH7jK9");
  });

  it("leaves the legend unlinked when the archive holds no page for it", () => {
    render(<MetaDeckBrowserPage />);
    expect(screen.queryByRole("link", { name: "Kennen" })).not.toBeInTheDocument();
  });

  it("says so when nothing matches", () => {
    captured.search = { tiers: ["local"] };
    render(<MetaDeckBrowserPage />);
    expect(seen("No decks match these filters.")).toBe(true);
  });
});
