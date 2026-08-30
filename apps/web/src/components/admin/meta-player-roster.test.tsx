import type { AdminMetaPlayer, MetaCandidatePlayer, MetaCandidateSource } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMetaRosterStore } from "@/stores/meta-roster-store";
import { createStoreResetter } from "@/test/store-helpers";

const captured = vi.hoisted(() => ({
  livePlayers: [] as unknown[],
  /** Candidate row id -> its ledger row, as the submissions endpoint answers. */
  submissions: {} as Record<string, unknown>,
  acceptPlayer: vi.fn(),
  acceptField: vi.fn(),
  acceptList: vi.fn(),
  linkPlayer: vi.fn(),
  unlinkPlayer: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { players: captured.livePlayers }, isPending: false }),
}));

vi.mock("@/hooks/use-admin-meta", () => ({
  adminMetaEventPlayersQueryOptions: (eventId: string) => ({ queryKey: ["players", eventId] }),
}));

const stub = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock("@/hooks/use-admin-meta-candidates", () => ({
  useAcceptMetaCandidatePlayer: () => ({ ...stub, mutate: captured.acceptPlayer }),
  useAcceptMetaPlayerField: () => ({ ...stub, mutate: captured.acceptField }),
  useAcceptMetaDeckList: () => ({ ...stub, mutate: captured.acceptList }),
  useLinkMetaCandidatePlayer: () => ({ ...stub, mutate: captured.linkPlayer }),
  useUnlinkMetaCandidatePlayer: () => ({ ...stub, mutate: captured.unlinkPlayer }),
}));

vi.mock("@/hooks/use-admin-meta-submissions", () => ({
  useMetaSubmissionForCandidatePlayer: (candidatePlayerId: string) => ({
    data: { submission: captured.submissions[candidatePlayerId] ?? null },
    isPending: false,
  }),
}));

// The resolve control has its own test; here it only has to appear or not.
vi.mock("@/components/admin/meta-submission-resolve", () => ({
  MetaSubmissionResolve: () => <div data-testid="resolve-control" />,
}));

vi.mock("@/hooks/use-enums", () => ({
  useZoneOrder: () => ({
    zoneOrder: ["legend", "main"],
    zoneLabels: { legend: "Legend", main: "Main" },
  }),
}));

// The suggestion list runs its own query; it has its own test.
vi.mock("@/components/admin/meta-player-suggestions", () => ({
  MetaPlayerSuggestions: ({ candidatePlayerId }: { candidatePlayerId: string }) => (
    <div data-testid="suggestions">{candidatePlayerId}</div>
  ),
}));

vi.mock("@/components/admin/meta-card-name-picker", () => ({
  MetaCardNamePicker: () => null,
}));

vi.mock("@/components/admin/meta-public-link", () => ({
  MetaPublicLinkButton: ({ label }: { label: string }) => <span>{label}</span>,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaPlayerRoster } from "./meta-player-roster";

function livePlayer(overrides: Partial<AdminMetaPlayer> = {}): AdminMetaPlayer {
  return {
    id: "live-1",
    rank: 1,
    rankIsTier: false,
    playerName: "Ana",
    wins: 6,
    losses: 1,
    draws: null,
    legendCardId: "card-yasuo",
    legendName: "Yasuo",
    championCardId: null,
    championName: null,
    listStatus: "full",
    deckId: "deck-1",
    shareToken: "abc123abc123",
    deckName: "Yasuo Aggro",
    deckFormat: "standard",
    cardCount: 40,
    ...overrides,
  };
}

function candidatePlayer(overrides: Partial<MetaCandidatePlayer> = {}): MetaCandidatePlayer {
  return {
    id: "cand-1",
    externalId: "1",
    playerName: "Ana",
    rank: 1,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: null,
    matchPoints: null,
    opponentMatchWinPct: null,
    gameWinPct: null,
    opponentGameWinPct: null,
    entryStatus: null,
    legendName: "Yasuo",
    legendCardId: "card-yasuo",
    championName: null,
    championCardId: null,
    cards: [{ name: "Yasuo", zone: "legend", quantity: 1, cardId: "card-yasuo" }],
    listStatus: "full",
    unresolvedNames: [],
    metaEventPlayerId: null,
    deckId: null,
    shareToken: null,
    submittedByUserId: null,
    submittedByName: null,
    submissionNote: null,
    state: "new",
    diff: null,
    checkedAt: null,
    ...overrides,
  };
}

function source(id: string, provider: string, players: MetaCandidatePlayer[]): MetaCandidateSource {
  return {
    id,
    provider,
    externalId: `${provider}-1`,
    name: "Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "standard",
    playerCount: 64,
    organizer: null,
    sourceUrl: null,
    notes: null,
    tier: null,
    country: null,
    location: null,
    checkedAt: null,
    players,
  };
}

const reset = createStoreResetter(useMetaRosterStore);

describe("MetaPlayerRoster", () => {
  beforeEach(() => {
    reset();
    captured.livePlayers = [];
    captured.submissions = {};
    vi.clearAllMocks();
  });
  afterEach(reset);

  it("renders one column per source", () => {
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[source("s1", "uvsgames", []), source("s2", "playriftbound", [])]}
        submittedPlayers={[candidatePlayer({ id: "sub" })]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "uvsgames" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "playriftbound" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Submissions" })).toBeInTheDocument();
  });

  it("says so where a source does not have the player at all", () => {
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [candidatePlayer({ id: "a", playerName: "Bo", rank: 2 })]),
          source("s2", "playriftbound", []),
        ]}
        submittedPlayers={[]}
      />,
    );
    const row = screen.getByRole("row", { name: /Bo/u });
    const cells = within(row).getAllByRole("cell");
    // Player, Archive, uvsgames, playriftbound.
    expect(cells).toHaveLength(4);
    expect(cells[1]).toHaveTextContent("Not archived");
    expect(cells[2]).toHaveTextContent("2nd");
    expect(cells[3]).toHaveTextContent("(not listed)");
  });

  it("prints a cut-bucket rank as a bracket rather than a placing", () => {
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidatePlayer({ id: "a", playerName: "Bo", rank: 8, rankIsTier: true }),
          ]),
        ]}
        submittedPlayers={[]}
      />,
    );
    const row = screen.getByRole("row", { name: /Bo/u });
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("T8");
  });

  it("expands one row without expanding its neighbour", async () => {
    const user = userEvent.setup();
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidatePlayer({ id: "a", playerName: "Ana", rank: 1 }),
            candidatePlayer({ id: "b", playerName: "Bo", rank: 2 }),
          ]),
        ]}
        submittedPlayers={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.getByTestId("suggestions")).toHaveTextContent("a");
    expect(useMetaRosterStore.getState().expandedRows.has("player:bo")).toBe(false);
  });

  it("offers the link and the new-player accept while a source is unlinked", async () => {
    const user = userEvent.setup();
    captured.livePlayers = [livePlayer({ playerName: "Ana" })];
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[source("s1", "uvsgames", [candidatePlayer({ id: "a", playerName: "Ana" })])]}
        submittedPlayers={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    await user.click(screen.getByRole("button", { name: "Link to this player" }));
    expect(captured.linkPlayer).toHaveBeenCalledWith({ id: "a", metaEventPlayerId: "live-1" });

    await user.click(screen.getByRole("button", { name: "Accept with this list" }));
    expect(captured.acceptPlayer).toHaveBeenCalledWith({
      id: "a",
      allowUnresolvedLegend: false,
    });
  });

  it("waves through an unmatched legend on a standings-only row", async () => {
    const user = userEvent.setup();
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidatePlayer({
              id: "a",
              playerName: "Ana",
              cards: null,
              listStatus: "none",
              legendName: "Yasou",
              legendCardId: null,
            }),
          ]),
        ]}
        submittedPlayers={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    await user.click(screen.getByRole("button", { name: "Accept as new player" }));
    expect(captured.acceptPlayer).toHaveBeenCalledWith({ id: "a", allowUnresolvedLegend: true });
  });

  it("takes one field of a linked row, and the whole list separately", async () => {
    const user = userEvent.setup();
    captured.livePlayers = [livePlayer({ playerName: "Ana", rank: 1 })];
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidatePlayer({
              id: "a",
              playerName: "Ana",
              rank: 4,
              metaEventPlayerId: "live-1",
              state: "changed",
              diff: { fields: [], cards: { added: [], removed: [], changed: [] } },
            }),
          ]),
        ]}
        submittedPlayers={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    // Only the differing field offers a take.
    const takes = screen.getAllByRole("button", { name: "Take" });
    expect(takes).toHaveLength(1);
    await user.click(takes[0]!);
    expect(captured.acceptField).toHaveBeenCalledWith({ id: "a", field: "rank" });

    await user.click(screen.getByRole("button", { name: "Take this list" }));
    expect(captured.acceptList).toHaveBeenCalledWith({ id: "a" });
  });

  it("offers no list take for a standings-only row, which carries none", async () => {
    const user = userEvent.setup();
    captured.livePlayers = [livePlayer({ playerName: "Ana" })];
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidatePlayer({
              id: "a",
              playerName: "Ana",
              cards: null,
              listStatus: "none",
              metaEventPlayerId: "live-1",
            }),
          ]),
        ]}
        submittedPlayers={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.queryByRole("button", { name: "Take this list" })).not.toBeInTheDocument();
  });

  it("blocks the accept of a row with unmatched card names", async () => {
    const user = userEvent.setup();
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidatePlayer({ id: "a", playerName: "Ana", unresolvedNames: ["Yasou"] }),
          ]),
        ]}
        submittedPlayers={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.getByRole("button", { name: "Accept with this list" })).toBeDisabled();
    expect(screen.getByText("1 card name still unmatched.")).toBeInTheDocument();
  });

  it("shows no resolve control for a provider's row", async () => {
    const user = userEvent.setup();
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[source("s1", "uvsgames", [candidatePlayer({ id: "a", playerName: "Ana" })])]}
        submittedPlayers={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.queryByTestId("resolve-control")).not.toBeInTheDocument();
  });

  it("shows the resolve control for a list someone contributed", async () => {
    const user = userEvent.setup();
    captured.submissions = { sub: { id: "s-1", status: "pending" } };
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[]}
        submittedPlayers={[
          candidatePlayer({ id: "sub", playerName: "Ana", submittedByName: "Rin" }),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.getByTestId("resolve-control")).toBeInTheDocument();
  });

  it("says so when no source carries a standings row", () => {
    render(
      <MetaPlayerRoster
        metaEventId="event-1"
        sources={[source("s1", "uvsgames", [])]}
        submittedPlayers={[]}
      />,
    );
    expect(
      screen.getByText("No source carries a standings row for this event yet."),
    ).toBeInTheDocument();
  });
});
