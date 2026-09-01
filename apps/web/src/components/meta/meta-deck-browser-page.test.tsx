import type { MetaDeckSummary } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaDeckOwnership } from "@/lib/meta-deck-collection";

const captured = vi.hoisted(() => ({
  decks: [] as MetaDeckSummary[],
  search: {} as Record<string, unknown>,
  signedIn: false,
  ownership: undefined as Map<string, MetaDeckOwnership> | undefined,
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

vi.mock("@/hooks/use-meta", () => ({ useMetaDecks: () => ({ data: { decks: captured.decks } }) }));
vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "standard", label: "Standard" }],
    labels: { standard: "Standard" },
  }),
}));
vi.mock("@/hooks/use-meta-eras", () => ({
  useMetaEras: () => [{ id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null }],
}));
vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));
vi.mock("@/hooks/use-meta-deck-ownership", () => ({
  useMetaDeckOwnership: () => captured.ownership,
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

// The scope bar and the fanned deck art pull chrome these tests do not exercise;
// what matters here is which lists the page puts on the screen.
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
    captured.ownership = undefined;
  });

  it("opens on the best finish per legend at each event", () => {
    render(<MetaDeckBrowserPage />);
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.queryByText("Ekko")).not.toBeInTheDocument();
    expect(screen.getByText("1 deck")).toBeInTheDocument();
  });

  it("offers every archived list one click away", async () => {
    render(<MetaDeckBrowserPage />);
    await userEvent.click(screen.getByRole("button", { name: "Show all 2" }));
    expect(navigate).toHaveBeenCalled();
    const search = navigate.mock.calls.at(-1)?.[0].search as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(search({})).toEqual({ all: true });
  });

  it("lists every entry once the curation is off", () => {
    captured.search = { all: true };
    render(<MetaDeckBrowserPage />);
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.getByText("Ekko")).toBeInTheDocument();
    expect(screen.getByText("2 decks")).toBeInTheDocument();
  });

  it("shows each event's tier on the tile", () => {
    render(<MetaDeckBrowserPage />);
    expect(screen.getByText("Premier")).toBeInTheDocument();
  });

  it("keeps the collection filter hidden for a signed-out reader", () => {
    render(<MetaDeckBrowserPage />);
    expect(screen.queryByText("Mostly buildable")).not.toBeInTheDocument();
  });

  it("counts the reader's own cards on each tile once the collection is in", () => {
    captured.signedIn = true;
    captured.ownership = new Map([["winner", { owned: 34, needed: 40 }]]);
    render(<MetaDeckBrowserPage />);
    expect(screen.getByText("34/40")).toBeInTheDocument();
    expect(screen.getByText("Mostly buildable")).toBeInTheDocument();
  });

  it("narrows to the lists the reader can mostly build", () => {
    captured.signedIn = true;
    captured.search = { all: true, buildable: true };
    captured.ownership = new Map([
      ["winner", { owned: 40, needed: 40 }],
      ["eighth", { owned: 4, needed: 40 }],
    ]);
    render(<MetaDeckBrowserPage />);
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.queryByText("Ekko")).not.toBeInTheDocument();
  });

  it("shows the whole archive on a shared buildable link before any collection loads", () => {
    captured.search = { all: true, buildable: true };
    render(<MetaDeckBrowserPage />);
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.getByText("Ekko")).toBeInTheDocument();
  });

  it("sends the tile's legend to its archive page and the rest of the tile to the list", () => {
    captured.decks = [deck({ legendArchiveSlug: "kennen-heart-of-the-tempest" })];
    render(<MetaDeckBrowserPage />);
    expect(screen.getByRole("link", { name: "Kennen" })).toHaveAttribute(
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

  it("names the era and format it is scoped to", () => {
    captured.search = { era: "vendetta", formats: ["standard"] };
    render(<MetaDeckBrowserPage />);
    expect(screen.getByText("Vendetta")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
  });

  it("renders no chip strip when the scope narrows by a custom range alone", () => {
    captured.search = { era: "custom", from: "2026-01-01" };
    render(<MetaDeckBrowserPage />);
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });

  it("says so when nothing matches", () => {
    captured.search = { tiers: ["casual"] };
    render(<MetaDeckBrowserPage />);
    expect(screen.getByText("No decks match these filters.")).toBeInTheDocument();
  });
});
