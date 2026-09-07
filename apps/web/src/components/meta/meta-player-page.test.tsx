import type { MetaDeckSummary, MetaPlayerDetailResponse } from "@openrift/shared/types/api/meta";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  player: {} as MetaPlayerDetailResponse,
  decks: [] as MetaDeckSummary[],
  deckQueries: [] as Record<string, unknown>[],
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
      useParams: () => ({ key: "pnrenata" }),
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
  useMetaPlayer: () => ({ data: captured.player }),
  useMetaDecks: (query: Record<string, unknown>) => {
    captured.deckQueries.push(query);
    return { data: { decks: captured.decks, total: captured.decks.length } };
  },
}));

vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => captured.hydrated }));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["calm"] },
    labels: { domains: { calm: "Calm" } },
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
import { makeMetaPlayerDetail, makeMetaPlayerFinish, resetIdCounter } from "@/test/factories";

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaPlayerPage } from "./meta-player-page";

const LUX = {
  cardId: "legend-lux",
  name: "Lux, Lady of Luminosity",
  slug: "lady-of-luminosity",
  imageId: "img-lux",
  domains: ["calm"],
  archiveSlug: "lux-lady-of-luminosity",
};

function deck(deckId: string, shareToken: string, country = "DE"): MetaDeckSummary {
  return {
    playerId: `p-${deckId}`,
    deckId,
    shareToken,
    listStatus: "full",
    name: "Luminous Skirmish",
    format: "constructed",
    legendCardId: LUX.cardId,
    legendName: LUX.name,
    legendSlug: LUX.slug,
    legendArchiveSlug: LUX.archiveSlug,
    legendImageId: LUX.imageId,
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: "Renata",
    playerKey: "pnrenata",
    rank: 1,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: 0,
    event: {
      slug: "summoner-skirmish",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "local",
      country,
    },
  };
}

beforeEach(() => {
  resetIdCounter();
  captured.search = { era: "all", formats: [] };
  captured.navigated = [];
  captured.replaced = [];
  captured.decks = [];
  captured.deckQueries = [];
  captured.hydrated = true;
  captured.player = makeMetaPlayerDetail({
    name: "Renata",
    finishes: [
      makeMetaPlayerFinish({
        legend: LUX,
        rank: 1,
        shareToken: "tok-1",
        listStatus: "full",
        event: { slug: "summoner-skirmish", name: "Summoner Skirmish" },
      }),
      makeMetaPlayerFinish({
        legend: null,
        rank: 12,
        event: {
          slug: "rift-open-paris",
          name: "Rift Open Paris",
          eventDate: "2026-03-14",
          country: "FR",
          tier: "premier",
        },
      }),
    ],
  });
});

describe("MetaPlayerPage", () => {
  it("titles the page with the player and trails back to the archive alone", () => {
    render(<MetaPlayerPage />);

    expect(screen.getAllByText("Renata").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Meta Archive" })).toHaveAttribute("href", "/meta");
    expect(screen.queryByRole("link", { name: "Players" })).not.toBeInTheDocument();
  });

  it("renders the record, the legends and nothing else the archive lacks", () => {
    render(<MetaPlayerPage />);

    expect(screen.getByRole("heading", { name: "Legends played" })).toBeInTheDocument();
    expect(screen.getByText("1 finish has no legend on file")).toBeInTheDocument();
    expect(screen.getAllByText("Summoner Skirmish").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rift Open Paris").length).toBeGreaterThan(0);
  });

  it("offers the scope bar every country the whole record touches", () => {
    captured.player = makeMetaPlayerDetail({
      name: "Renata",
      finishes: [
        makeMetaPlayerFinish({ event: { slug: "a", country: "DE" } }),
        makeMetaPlayerFinish({ event: { slug: "b", country: "FR" } }),
        makeMetaPlayerFinish({ shareToken: "tok-1", event: { slug: "c", country: "US" } }),
      ],
    });
    captured.decks = [deck("d1", "tok-1", "US")];
    render(<MetaPlayerPage />);
    expect(captured.countries).toEqual(["DE", "FR", "US"]);
  });

  it("shows only the archived lists this player's own finishes point at", () => {
    captured.decks = [deck("d1", "tok-1"), deck("d2", "tok-other")];
    render(<MetaPlayerPage />);

    const grid = screen.getByRole("heading", { name: "Archived decklists" })
      .parentElement as HTMLElement;
    expect(within(grid).getAllByRole("listitem")).toHaveLength(1);
  });

  it("leaves the decklists section out when the player registered none", () => {
    captured.player = makeMetaPlayerDetail({
      name: "Renata",
      finishes: [makeMetaPlayerFinish({ shareToken: null, listStatus: "none" })],
    });
    render(<MetaPlayerPage />);
    expect(screen.queryByText("Archived decklists")).not.toBeInTheDocument();
  });

  it("renders the decklist grid from the server, without waiting for hydration", () => {
    captured.hydrated = false;
    captured.decks = [deck("d1", "tok-1")];
    render(<MetaPlayerPage />);

    const grid = screen.getByRole("heading", { name: "Archived decklists" })
      .parentElement as HTMLElement;
    expect(within(grid).getAllByRole("listitem")).toHaveLength(1);
  });

  it("asks the API for this player's lists inside the whole scope, not for the archive", () => {
    captured.search = { era: "origins", tiers: ["premier"] };
    render(<MetaPlayerPage />);

    expect(captured.deckQueries.at(-1)).toEqual({
      from: "2026-01-01",
      to: "2026-07-31",
      formats: ["constructed"],
      tiers: ["premier"],
      player: "pnrenata",
    });
  });

  it("replaces the URL when the scope bar moves, so Back leaves the page", async () => {
    render(<MetaPlayerPage />);

    await userEvent.click(screen.getByRole("button", { name: "Scope to premier" }));
    expect(captured.navigated.at(-1)).toMatchObject({ tiers: ["premier"] });
    expect(captured.replaced.at(-1)).toBe(true);
  });

  it("narrows the record to the scope and says so when it empties", () => {
    captured.search = { era: "all", formats: [], countries: ["JP"] };
    render(<MetaPlayerPage />);

    expect(
      screen.getByText("No finish on this player's record falls in this scope."),
    ).toBeInTheDocument();
  });
});
