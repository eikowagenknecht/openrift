import type {
  MetaEventDetail,
  MetaEventMatch,
  MetaEventPhase,
  MetaEventPlayer,
} from "@openrift/shared/types/api/meta";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metaEvent, metaMatch, metaPhase, metaPlayer } from "@/test/meta-event-fixtures";

const captured = vi.hoisted(() => ({
  event: null as MetaEventDetail | null,
  players: [] as MetaEventPlayer[],
  matches: [] as MetaEventMatch[],
  phases: [] as MetaEventPhase[],
  key: "u1001",
}));

vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return {
    Link: fixtures.StubLink,
    getRouteApi: () => ({
      useParams: () => ({ slug: "summoner-skirmish", key: captured.key }),
    }),
  };
});

vi.mock("@/features/meta/hooks/use-meta", () => ({
  useMetaEvent: () => ({
    data: {
      event: captured.event,
      players: captured.players,
      matches: captured.matches,
      phases: captured.phases,
    },
  }),
}));

vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: { domains: ["fury"] }, labels: { domains: { fury: "Fury" } } }),
}));

vi.mock("@/components/layout/page-top-bar", () => ({
  PageTopBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarSticky: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarTitle: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("@/components/layout/top-bar-breadcrumb", () => ({
  TopBarBreadcrumbSeparator: () => null,
  TopBarBreadcrumbTrail: () => null,
}));

const { MetaEventRunPage } = await import("./meta-event-run-page");

const ANA = metaPlayer({
  id: "p-1",
  rank: 1,
  playerName: "Ana",
  playerKey: "u1001",
  wins: 6,
  losses: 1,
  draws: 1,
  shareToken: "tok-ana",
  listStatus: "partial",
  champion: {
    cardId: "card-yasuo-unit",
    name: "Yasuo",
    slug: "yasuo",
    imageId: null,
    domains: ["fury"],
    archiveSlug: null,
  },
});

const BO = metaPlayer({
  id: "p-2",
  rank: 2,
  playerName: "Bo",
  playerKey: "u1002",
  wins: 4,
  losses: 2,
  draws: 0,
  shareToken: "tok-bo",
  listStatus: "full",
});

const CY = metaPlayer({
  id: "p-3",
  rank: 4,
  playerName: "Cy",
  playerKey: "u1003",
  wins: 3,
  losses: 3,
  draws: 0,
});

const SWISS_PHASE = metaPhase({
  phaseOrder: 1,
  name: "Swiss",
  roundType: "SWISS",
  roundCount: 3,
  rankRequired: null,
  maxGameWins: 2,
});

const CUT_PHASE = metaPhase({ phaseOrder: 2, roundCount: 2, rankRequired: 4, maxGameWins: 2 });

const MATCHES: MetaEventMatch[] = [
  metaMatch({
    phaseOrder: 1,
    roundNumber: 1,
    tableNumber: null,
    isBye: true,
    player2Id: null,
    winnerId: null,
    gamesWonP1: null,
    gamesWonP2: null,
  }),
  metaMatch({ phaseOrder: 1, roundNumber: 2, tableNumber: 3, player2Id: "p-2" }),
  metaMatch({
    phaseOrder: 1,
    roundNumber: 3,
    tableNumber: 5,
    isDraw: true,
    player2Id: "p-99",
    winnerId: null,
    gamesWonP1: 1,
    gamesWonP2: 1,
  }),
  metaMatch({ phaseOrder: 2, roundNumber: 1, tableNumber: 2, player2Id: "p-3", gamesWonP2: 1 }),
  metaMatch({ phaseOrder: 2, roundNumber: 2, tableNumber: 1, player2Id: "p-2" }),
];

function renderPage(
  overrides: {
    players?: MetaEventPlayer[];
    matches?: MetaEventMatch[];
    phases?: MetaEventPhase[];
    event?: Partial<MetaEventDetail>;
    key?: string;
  } = {},
): void {
  captured.players = overrides.players ?? [ANA, BO, CY];
  captured.matches = overrides.matches ?? MATCHES;
  captured.phases = overrides.phases ?? [SWISS_PHASE, CUT_PHASE];
  captured.event = metaEvent({ playerRowCount: captured.players.length, ...overrides.event });
  captured.key = overrides.key ?? "u1001";
  render(<MetaEventRunPage />);
}

function rowTexts(): string[] {
  return screen.getAllByRole("listitem").map((row) => row.textContent ?? "");
}

function hrefOf(label: string): string | null {
  return screen.getAllByText(label)[0]!.closest("a")?.getAttribute("href") ?? null;
}

describe("MetaEventRunPage", () => {
  beforeEach(() => {
    captured.event = null;
    captured.players = [];
    captured.matches = [];
    captured.phases = [];
    captured.key = "u1001";
  });

  it("lists the rounds in the order they were played, Swiss before the cut", () => {
    renderPage();
    const rows = rowTexts();

    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain("No opponent this round");
    expect(rows[1]).toContain("Bo");
    expect(rows[2]).toContain("Unknown");
    expect(rows[3]).toContain("Cy");
    expect(rows[4]).toContain("Bo");
  });

  it("says a bye had no opponent instead of leaving the row blank", () => {
    renderPage();
    expect(screen.getAllByText("No opponent this round").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bye").length).toBeGreaterThan(0);
  });

  it("prints each opponent's own finish and record beside the result", () => {
    renderPage();
    expect(screen.getAllByText("2nd").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4-2-0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("finished 2nd · 4-2-0").length).toBeGreaterThan(0);
  });

  it("carries the game score on the result chip", () => {
    renderPage();
    expect(screen.getAllByText("Win").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2-0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draw").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1-1").length).toBeGreaterThan(0);
  });

  it("names a row the payload never carried rather than dropping the round", () => {
    renderPage();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  });

  it("names the cut rounds from the event's last cut round", () => {
    renderPage();
    expect(screen.getAllByText("Semifinal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Final").length).toBeGreaterThan(0);
  });

  it("still calls a quarterfinal exit a quarterfinal", () => {
    renderPage({
      players: [ANA, CY],
      phases: [CUT_PHASE],
      matches: [
        metaMatch({ phaseOrder: 2, roundNumber: 1, player2Id: "p-3", winnerId: "p-3" }),
        metaMatch({ phaseOrder: 2, roundNumber: 2, player1Id: "p-3", player2Id: "p-4" }),
        metaMatch({ phaseOrder: 2, roundNumber: 3, player1Id: "p-3", player2Id: "p-5" }),
      ],
    });

    expect(screen.getAllByText("Quarterfinal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("QF").length).toBeGreaterThan(0);
  });

  it("heads a winner's page with the title they were playing for", () => {
    renderPage();
    expect(screen.getByText("Road to the title")).toBeInTheDocument();
  });

  it("heads everyone else's page as the run it was", () => {
    renderPage({ players: [metaPlayer({ ...ANA, rank: 7 }), BO, CY] });
    expect(screen.getByText("Tournament run")).toBeInTheDocument();
  });

  it("states the finish against the field and how far the run ran", () => {
    renderPage({ event: { playerCount: 3283 } });
    expect(screen.getByText("1st")).toBeInTheDocument();
    expect(screen.getByText("of 3,283 players")).toBeInTheDocument();
    expect(screen.getByText("6-1-1")).toBeInTheDocument();
    expect(screen.getByText("final record")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("rounds played")).toBeInTheDocument();
  });

  it("falls back to the standings rows on file when no source published a field size", () => {
    renderPage({ event: { playerCount: null } });
    expect(screen.getByText("of 3 players")).toBeInTheDocument();
  });

  it("offers the player's own list and the rest of their record", () => {
    renderPage();
    expect(hrefOf("Partial list")).toBe("/meta/decks/tok-ana");
    expect(hrefOf("Every finish by Ana")).toBe("/meta/players/u1001");
  });

  it("links an opponent's list from the row they played", () => {
    renderPage();
    expect(hrefOf("Decklist")).toBe("/meta/decks/tok-bo");
  });

  it("subtitles each section with its rounds, record and match length", () => {
    renderPage();
    expect(screen.getByText("3 rounds · 2-0-1 · best of 3")).toBeInTheDocument();
    expect(screen.getByText("2 rounds · 2-0-0 · best of 3")).toBeInTheDocument();
  });

  it("names the sections by what the event actually ran", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Swiss" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top 4" })).toBeInTheDocument();
  });

  it("renders a phone row beside the desktop one, so neither reads alone", () => {
    renderPage();
    expect(screen.getAllByText("R2")).toHaveLength(2);
    expect(screen.getAllByText("Final")).toHaveLength(1);
    expect(screen.getAllByText("F")).toHaveLength(1);
  });

  it("sends the reader back to the standings the run is one row of", () => {
    renderPage();
    expect(hrefOf("Full standings")).toBe("/meta/summoner-skirmish");
    expect(
      screen.getByText(/the result published by the tournament organizer/u),
    ).toBeInTheDocument();
  });
});
