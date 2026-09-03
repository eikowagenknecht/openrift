import type { MetaDeckSummary, MetaLegendDetailResponse } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  legend: {} as MetaLegendDetailResponse,
  decks: [] as MetaDeckSummary[],
  search: {} as Record<string, unknown>,
  navigated: [] as Record<string, unknown>[],
  replaced: [] as (boolean | undefined)[],
  countries: [] as readonly string[],
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
// Newest first, the way the hook itself orders them: the first is the current
// set, which is the era an unscoped page opens on.
vi.mock("@/hooks/use-meta-eras", () => ({
  useMetaEras: () => [
    { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
    { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
  ],
}));
vi.mock("@/components/meta/meta-scope-bar", () => ({
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

function renderPage(
  finishes: MetaLegendDetailResponse["finishes"],
  decks: MetaDeckSummary[] = [],
  search: Record<string, unknown> = {},
) {
  captured.legend = { slug: "kennen-heart-of-the-tempest", legend: LEGEND, finishes };
  captured.decks = decks;
  captured.search = search;
  captured.navigated = [];
  const view = render(<MetaLegendPage />);
  return {
    /** Re-renders under new URL params, the way a navigate would. */
    navigateTo(next: Record<string, unknown>) {
      captured.search = next;
      view.rerender(<MetaLegendPage />);
    },
  };
}

/** @returns The counter's number, read off the label it sits above. */
function counterValue(label: string): string {
  return (screen.getByText(label).previousSibling as HTMLElement).textContent ?? "";
}

beforeEach(() => {
  captured.search = {};
  captured.navigated = [];
  captured.replaced = [];
  captured.countries = [];
});

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

    expect(counterValue("event wins")).toBe("2");
    expect(counterValue("archived finishes")).toBe("3");
    expect(counterValue("decklists")).toBe("1");
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

  it("narrows the finishes, the decklists and the counters to one scope", () => {
    renderPage(
      [
        finish(1, "tok-a", "a", "worlds", { tier: "premier", eventDate: "2026-08-20" }),
        finish(3, "tok-b", "b", "store-night", { tier: "store", eventDate: "2026-03-02" }),
      ],
      [
        deck("tok-a", "card-kennen", { slug: "worlds", tier: "premier" }),
        deck("tok-b", "card-kennen", { slug: "store-night", tier: "store" }),
      ],
      { tiers: ["premier"] },
    );

    expect(counterValue("event wins")).toBe("1");
    expect(counterValue("archived finishes")).toBe("1");
    expect(counterValue("decklists")).toBe("1");
    expect(screen.getAllByText("Pilot a").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Pilot b")).toHaveLength(0);
    const grid = screen.getByRole("heading", { name: "Archived decklists" })
      .parentElement as HTMLElement;
    expect(within(grid).getAllByRole("listitem")).toHaveLength(1);
  });

  it("keeps offering every country the record covers, not only the scoped slice", () => {
    renderPage(
      [
        finish(1, null, "a", "worlds", { country: "FR", tier: "premier" }),
        finish(2, null, "b", "store-night", { country: "DE", tier: "store" }),
      ],
      [deck("tok-c", "card-kennen", { slug: "tokyo-open", country: "JP" })],
      { tiers: ["premier"] },
    );
    expect(captured.countries).toEqual(["DE", "FR", "JP"]);
  });

  it("says the scope holds no list rather than dropping the decklist section", () => {
    renderPage(
      [finish(1, "tok-a", "a", "store-night", { tier: "store" })],
      [deck("tok-a", "card-kennen", { slug: "store-night", tier: "store" })],
      { tiers: ["premier"] },
    );
    expect(screen.getByRole("heading", { name: "Archived decklists" })).toBeInTheDocument();
    expect(
      screen.getByText("No list on this legend's record falls in this scope."),
    ).toBeInTheDocument();
  });

  it("says nothing falls in the scope rather than nothing is on record", () => {
    renderPage([finish(1, null, "a")], [], { tiers: ["premier"] });
    expect(
      screen.getByText("No finish on this legend's record falls in this scope."),
    ).toBeInTheDocument();
  });

  it("writes a scope choice to the URL without stacking a history entry per dropdown", async () => {
    renderPage([finish(1, null, "a")]);
    await userEvent.click(screen.getByRole("button", { name: "Scope to premier" }));
    expect(captured.navigated.at(-1)).toMatchObject({ tiers: ["premier"] });
    expect(captured.replaced.at(-1)).toBe(true);
  });

  it("collapses an expanded record back to the best finishes once the scope changes", async () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      finish(index + 1, null, `p${String(index)}`, `event-${String(index)}`),
    );
    const page = renderPage(many);
    await userEvent.click(screen.getByRole("button", { name: "Show all 8 finishes" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);

    page.navigateTo({ tiers: ["competitive"] });

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("replaces the finishes section on a scope change rather than stacking a second copy", () => {
    const page = renderPage(
      [
        finish(1, "tok-a", "a", "worlds", { tier: "premier" }),
        finish(3, "tok-b", "b", "store-night", { tier: "store" }),
      ],
      [deck("tok-a", "card-kennen", { slug: "worlds", tier: "premier" })],
    );

    page.navigateTo({ tiers: ["premier"] });

    expect(screen.getAllByRole("heading", { name: "Finishes" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Archived decklists" })).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("drops every facet on reset", async () => {
    renderPage([finish(1, null, "a")], [], {
      era: "vendetta",
      tiers: ["premier"],
      countries: ["FR"],
    });
    await userEvent.click(screen.getByRole("button", { name: "Reset scope" }));
    expect(captured.navigated.at(-1)).toEqual({});
  });

  it("trails back through the archive and titles the bar with the legend", () => {
    renderPage([]);
    expect(screen.getByRole("link", { name: "Legends" })).toHaveAttribute("href", "/meta/legends");
    expect(screen.getByRole("heading", { level: 1, name: "Kennen" })).toBeInTheDocument();
  });

  it("publishes no percentage, rate or share", () => {
    const { container } = render(<MetaLegendPage />);
    expect(container.textContent).not.toMatch(/%|\brate\b|\bshare\b/iu);
  });
});
