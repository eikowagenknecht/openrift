import type { MetaDeckSummary, MetaLegendDetailResponse } from "@openrift/shared/types/api/meta";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  legend: {} as MetaLegendDetailResponse,
  decks: [] as MetaDeckSummary[],
  nextPages: [] as MetaLegendDetailResponse["finishes"][],
  deckQueries: [] as Record<string, unknown>[],
  legendPages: [] as number[],
  search: {} as Record<string, unknown>,
  navigated: [] as Record<string, unknown>[],
  replaced: [] as (boolean | undefined)[],
  countries: [] as readonly string[],
  hydrated: true,
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
    getRouteApi: () => ({
      useParams: () => ({ slug: "kennen-heart-of-the-tempest" }),
      useSearch: () => captured.search,
      useNavigate:
        () =>
        ({
          search,
          replace,
        }: {
          search: (prev: Record<string, unknown>) => Record<string, unknown>;
          replace?: boolean;
        }) => {
          captured.navigated.push(search(captured.search));
          captured.replaced.push(replace);
        },
    }),
    Link: Anchor,
    createLink: () => Anchor,
  };
});

// The page's own reads are keyed by the query it builds, so the stubs carry that
// query on the key and the assertions read it back off.
vi.mock("@/features/meta/hooks/use-meta", () => ({
  useMetaLegend: () => ({ data: captured.legend }),
  metaLegendQueryOptions: (slug: string, query: Record<string, unknown>) => ({
    queryKey: ["legend", slug, query],
  }),
  metaDecksQueryOptions: (query: Record<string, unknown>) => ({ queryKey: ["decks", query] }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const query = queryKey[1] as { limit?: number };
    captured.deckQueries.push(query);
    return {
      data: {
        decks: query.limit === undefined ? captured.decks : captured.decks.slice(0, query.limit),
        total: captured.decks.length,
      },
    };
  },
  useQueries: ({ queries }: { queries: { queryKey: unknown[] }[] }) =>
    queries.map((entry, index) => {
      captured.legendPages.push((entry.queryKey[2] as { page: number }).page);
      return { data: { finishes: captured.nextPages[index] ?? [] }, isPending: false };
    }),
}));

vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => captured.hydrated }));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["fury"] },
    labels: { domains: { fury: "Fury" } },
  }),
  useDeckFormatList: () => ({ labels: { constructed: "Constructed" }, order: ["constructed"] }),
}));

vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));
vi.mock("@/lib/auth-session", () => ({ useUserId: () => null }));
// Newest first, the way the hook itself orders them: the first is the current
// set, which is the era an unscoped page opens on.
vi.mock("@/features/meta/hooks/use-meta-eras", () => ({
  useMetaEras: () => [
    { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
    { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
  ],
}));
vi.mock("@/features/meta/components/meta-scope-bar", () => ({
  MetaScopeBar: ({
    countries,
    setScope,
    clearScope,
  }: {
    countries?: readonly string[];
    setScope: (patch: Record<string, unknown>) => void;
    clearScope: () => void;
  }) => {
    captured.countries = countries ?? [];
    return (
      <div>
        <button type="button" onClick={() => setScope({ tiers: ["premier"] })}>
          Scope to premier
        </button>
        <button type="button" onClick={clearScope}>
          Reset scope
        </button>
      </div>
    );
  },
}));

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

const UNSCOPED = { era: "all", formats: [] };

type EventOverrides = Partial<MetaLegendDetailResponse["finishes"][number]["event"]>;

function finish(
  rank: number,
  shareToken: string | null,
  playerId: string,
  eventSlug?: string,
  event?: EventOverrides,
) {
  return {
    playerId,
    rank,
    rankIsTier: false,
    playerName: `Pilot ${playerId}`,
    playerKey: `u${playerId}`,
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
      ...event,
    },
  };
}

function deck(
  deckId: string,
  legendCardId: string | null,
  event?: Partial<MetaDeckSummary["event"]>,
): MetaDeckSummary {
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
    legendArchiveSlug: null,
    legendImageId: null,
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: "P. Lefebvre",
    playerKey: "u4001",
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
      tier: "competitive",
      country: "FR",
      ...event,
    },
  };
}

interface PageOptions {
  finishes?: MetaLegendDetailResponse["finishes"];
  best?: MetaLegendDetailResponse["finishes"];
  counts?: MetaLegendDetailResponse["counts"];
  total?: number;
  decks?: MetaDeckSummary[];
  search?: Record<string, unknown>;
}

function renderPage(options: PageOptions = {}) {
  const finishes = options.finishes ?? [];
  captured.legend = {
    slug: "kennen-heart-of-the-tempest",
    legend: LEGEND,
    counts: options.counts ?? {
      wins: 0,
      finishes: finishes.length,
      decklists: options.decks?.length ?? 0,
    },
    best: options.best ?? finishes.slice(0, 5),
    finishes,
    total: options.total ?? finishes.length,
    page: 1,
  };
  captured.decks = options.decks ?? [];
  captured.search = options.search ?? UNSCOPED;
  captured.navigated = [];
  const view = render(<MetaLegendPage />);
  return {
    navigateTo(next: Record<string, unknown>) {
      captured.search = next;
      view.rerender(<MetaLegendPage />);
    },
  };
}

function counterValue(label: string): string {
  return (screen.getByText(label).previousSibling as HTMLElement).textContent ?? "";
}

function deckTiles(): HTMLElement[] {
  const grid = screen.getByRole("heading", { name: "Archived decklists" })
    .parentElement as HTMLElement;
  return within(grid).getAllByRole("listitem");
}

beforeEach(() => {
  captured.search = UNSCOPED;
  captured.navigated = [];
  captured.replaced = [];
  captured.countries = [];
  captured.deckQueries = [];
  captured.legendPages = [];
  captured.nextPages = [];
  captured.hydrated = true;
});

describe("MetaLegendPage", () => {
  it("prints the counts the API took over the scope", () => {
    renderPage({
      counts: { wins: 2, finishes: 3, decklists: 1 },
      finishes: [finish(1, "tok-a", "a")],
      decks: [deck("tok-a", "card-kennen")],
    });

    expect(counterValue("event wins")).toBe("2");
    expect(counterValue("archived finishes")).toBe("3");
    expect(counterValue("decklists")).toBe("1");
  });

  it("leads with the placings the API picked and switches to the record itself", async () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      finish(index + 1, null, `p${String(index)}`, `event-${String(index)}`),
    );
    renderPage({ finishes: rows, best: rows.slice(0, 5), total: 8 });

    expect(screen.queryByText("Pilot p6")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show all 8 finishes" }));

    expect(screen.getAllByText("Pilot p6").length).toBeGreaterThan(0);
  });

  it("asks the API for the next page of the record and appends it", async () => {
    const first = Array.from({ length: 25 }, (_, index) =>
      finish(index + 1, null, `p${String(index)}`, `event-${String(index)}`),
    );
    captured.nextPages = [[finish(26, null, "late", "event-late")]];
    renderPage({ finishes: first, total: 26 });

    await userEvent.click(screen.getByRole("button", { name: "Show all 26 finishes" }));
    expect(screen.queryByText("Pilot late")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "1 more finish" }));

    expect(captured.legendPages).toContain(2);
    expect(screen.getAllByText("Pilot late").length).toBeGreaterThan(0);
  });

  it("renders the decklist grid from the server, without waiting for hydration", () => {
    captured.hydrated = false;
    renderPage({
      finishes: [finish(1, "tok-a", "a")],
      counts: { wins: 1, finishes: 1, decklists: 1 },
      decks: [deck("tok-a", "card-kennen")],
    });

    expect(deckTiles()).toHaveLength(1);
  });

  it("asks for one grid's worth of lists and no more", () => {
    renderPage({
      decks: [deck("tok-a", "card-kennen")],
      counts: { wins: 0, finishes: 1, decklists: 1 },
    });

    expect(captured.deckQueries.at(-1)).toMatchObject({ legend: "card-kennen", limit: 8 });
  });

  it("counts the lists the scope holds, not the ones the first page carries", async () => {
    const decks = Array.from({ length: 12 }, (_, index) =>
      deck(`d${String(index)}`, "card-kennen"),
    );
    renderPage({ decks, counts: { wins: 0, finishes: 12, decklists: 12 } });

    expect(deckTiles()).toHaveLength(8);
    await userEvent.click(screen.getByRole("button", { name: "Show all 12 decklists" }));

    expect(captured.deckQueries.at(-1)).not.toHaveProperty("limit", 8);
    expect(deckTiles()).toHaveLength(12);
    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });

  it("stops offering more lists once it holds every one the scope left", async () => {
    renderPage({
      decks: [deck("tok-a", "card-kennen"), deck("tok-b", "card-kennen")],
      counts: { wins: 0, finishes: 9, decklists: 9 },
    });

    await userEvent.click(screen.getByRole("button", { name: "Show all 9 decklists" }));

    expect(deckTiles()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });

  it("drops the decklist section for a legend with no list anywhere on record", () => {
    renderPage({ finishes: [finish(4, null, "a")] });
    expect(screen.queryByText("Archived decklists")).not.toBeInTheDocument();
  });

  it("says the scope holds no list rather than dropping the section", () => {
    renderPage({
      finishes: [finish(1, null, "a")],
      counts: { wins: 0, finishes: 1, decklists: 0 },
      search: { tiers: ["premier"] },
    });

    expect(screen.getByRole("heading", { name: "Archived decklists" })).toBeInTheDocument();
    expect(
      screen.getByText("No list on this legend's record falls in this scope."),
    ).toBeInTheDocument();
  });

  it("asks the API for the lists inside the scope, facets and all", () => {
    renderPage({
      counts: { wins: 0, finishes: 2, decklists: 2 },
      decks: [deck("tok-a", "card-kennen", { slug: "worlds", tier: "premier" })],
      search: { era: "all", formats: [], tiers: ["premier"], countriesEx: ["DE"] },
    });

    expect(captured.deckQueries.at(-1)).toMatchObject({
      legend: "card-kennen",
      tiers: ["premier"],
      countriesEx: ["DE"],
    });
  });

  it("says nothing falls in the scope rather than nothing is on record", () => {
    renderPage({ search: { tiers: ["premier"] } });
    expect(
      screen.getByText("No finish on this legend's record falls in this scope."),
    ).toBeInTheDocument();
  });

  it("offers the countries its rows name, and the ones the scope itself picked", () => {
    renderPage({
      finishes: [
        finish(1, null, "a", "worlds", { country: "FR" }),
        finish(2, null, "b", "store-night", { country: "DE" }),
      ],
      search: { era: "all", formats: [], countries: ["JP"] },
    });

    expect(captured.countries).toEqual(["DE", "FR", "JP"]);
  });

  it("writes a scope choice to the URL without stacking a history entry per dropdown", async () => {
    renderPage({ finishes: [finish(1, null, "a")] });
    await userEvent.click(screen.getByRole("button", { name: "Scope to premier" }));
    expect(captured.navigated.at(-1)).toMatchObject({ tiers: ["premier"] });
    expect(captured.replaced.at(-1)).toBe(true);
  });

  it("collapses an expanded record back to the best finishes once the scope changes", async () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      finish(index + 1, null, `p${String(index)}`, `event-${String(index)}`),
    );
    const page = renderPage({ finishes: rows, total: 8 });
    await userEvent.click(screen.getByRole("button", { name: "Show all 8 finishes" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);

    page.navigateTo({ era: "all", formats: [], tiers: ["competitive"] });

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("replaces the finishes section on a scope change rather than stacking a second copy", () => {
    const page = renderPage({
      finishes: [finish(1, "tok-a", "a", "worlds")],
      counts: { wins: 1, finishes: 1, decklists: 1 },
      decks: [deck("tok-a", "card-kennen", { slug: "worlds" })],
    });

    page.navigateTo({ era: "all", formats: [], tiers: ["competitive"] });

    expect(screen.getAllByRole("heading", { name: "Finishes" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Archived decklists" })).toHaveLength(1);
  });

  it("drops every facet on reset", async () => {
    renderPage({
      finishes: [finish(1, null, "a")],
      search: { era: "vendetta", tiers: ["premier"], countries: ["FR"] },
    });
    await userEvent.click(screen.getByRole("button", { name: "Reset scope" }));
    expect(captured.navigated.at(-1)).toEqual({});
  });

  it("trails back through the archive and titles the bar with the legend", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Legends" })).toHaveAttribute("href", "/meta/legends");
    expect(screen.getByRole("heading", { level: 1, name: "Kennen" })).toBeInTheDocument();
  });

  it("publishes no percentage, rate or share", () => {
    renderPage({ finishes: [finish(1, "tok-a", "a")], decks: [deck("tok-a", "card-kennen")] });
    expect(document.body.textContent).not.toMatch(/%|\brate\b|\bshare\b/iu);
  });
});
