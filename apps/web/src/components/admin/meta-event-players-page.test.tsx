import type { AdminMetaPlayer } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  players: [] as unknown[],
  playerCount: null as number | null,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a href="/admin/meta">{children}</a>,
  useNavigate: () => vi.fn(),
  createLink: (component: unknown) => component,
}));

vi.mock("@/components/admin/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ back, actions }: { back?: ReactNode; actions?: ReactNode }) => (
    <div>
      {back}
      {actions}
    </div>
  ),
}));

vi.mock("@/hooks/use-admin-meta", () => ({
  useAdminMetaEvent: () => ({
    data: {
      id: "event-1",
      name: "Summoner Skirmish 2026",
      slug: "summoner-skirmish-2026",
      format: "standard",
      playerCount: captured.playerCount,
    },
  }),
  useAdminMetaEventPlayers: () => ({ data: { players: captured.players } }),
  useDeleteMetaPlayer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaEventPlayersPage } from "./meta-event-players-page";

function player(overrides: Partial<AdminMetaPlayer> = {}): AdminMetaPlayer {
  return {
    id: "player-1",
    rank: 1,
    rankIsTier: false,
    playerName: "Rell Enjoyer",
    wins: 6,
    losses: 1,
    draws: 0,
    legendCardId: "legend-1",
    legendName: "Jinx",
    championCardId: "champion-1",
    championName: "Jinx, Loose Cannon",
    listStatus: "full",
    deckId: "deck-1",
    shareToken: "abcd1234",
    deckName: "Chaos Engine",
    deckFormat: "standard",
    cardCount: 40,
    ...overrides,
  };
}

describe("MetaEventPlayersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.players = [player()];
    captured.playerCount = null;
  });

  it("keeps a way back to the event list and out to the public page", () => {
    render(<MetaEventPlayersPage eventId="event-1" />);

    expect(screen.getByLabelText("Back to all events")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Open Summoner Skirmish 2026 in the public archive"),
    ).toHaveAttribute("href", "/meta/summoner-skirmish-2026");
  });

  it("names a deck by its legend and champion, the way the public archive does", () => {
    render(<MetaEventPlayersPage eventId="event-1" />);
    expect(screen.getByText("Jinx / Jinx, Loose Cannon")).toBeInTheDocument();
  });

  it("falls back to whichever half of the pair the source named", () => {
    captured.players = [player({ championName: null, championCardId: null })];
    render(<MetaEventPlayersPage eventId="event-1" />);
    expect(screen.getByText("Jinx")).toBeInTheDocument();
  });

  it("marks a row the source published no record for", () => {
    captured.players = [player({ wins: null, losses: null, draws: null })];
    render(<MetaEventPlayersPage eventId="event-1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("flags a partial list on the deck itself", () => {
    captured.players = [player({ listStatus: "partial" })];
    render(<MetaEventPlayersPage eventId="event-1" />);
    expect(screen.getByText("Partial list")).toBeInTheDocument();
  });

  it("offers no deck link for a standings-only entry", () => {
    captured.players = [player({ listStatus: "none", deckId: null, shareToken: null })];
    render(<MetaEventPlayersPage eventId="event-1" />);
    expect(screen.getByText("Standings only")).toBeInTheDocument();
    expect(screen.queryByLabelText(/archived deck/u)).not.toBeInTheDocument();
  });

  it("leads a deck row out to its public permalink", () => {
    render(<MetaEventPlayersPage eventId="event-1" />);
    expect(screen.getByLabelText("Open Rell Enjoyer's archived deck")).toHaveAttribute(
      "href",
      "/meta/decks/abcd1234",
    );
  });

  it("names the ranks the archive is missing from the field", () => {
    captured.players = [player({ id: "a", rank: 1 }), player({ id: "b", rank: 3 })];
    captured.playerCount = 4;
    render(<MetaEventPlayersPage eventId="event-1" />);
    expect(screen.getByText("2 of 4 standings archived")).toBeInTheDocument();
    expect(screen.getByText("Missing 2, 4")).toBeInTheDocument();
  });

  it("says nothing about gaps once the field is whole", () => {
    captured.players = [player({ id: "a", rank: 1 }), player({ id: "b", rank: 2 })];
    captured.playerCount = 2;
    render(<MetaEventPlayersPage eventId="event-1" />);
    expect(screen.getByText("2 standings archived")).toBeInTheDocument();
    expect(screen.queryByText(/Missing/u)).not.toBeInTheDocument();
  });
});
