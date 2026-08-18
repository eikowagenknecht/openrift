import type { AdminMetaDeck, MetaCandidateDeck, MetaCandidateSource } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMetaRosterStore } from "@/stores/meta-roster-store";
import { createStoreResetter } from "@/test/store-helpers";

const captured = vi.hoisted(() => ({
  liveDecks: [] as unknown[],
  /** Candidate deck id -> its ledger row, as the submissions endpoint answers. */
  submissions: {} as Record<string, unknown>,
  acceptDeck: vi.fn(),
  acceptField: vi.fn(),
  acceptList: vi.fn(),
  linkDeck: vi.fn(),
  unlinkDeck: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { decks: captured.liveDecks }, isPending: false }),
}));

vi.mock("@/hooks/use-admin-meta", () => ({
  adminMetaEventDecksQueryOptions: (eventId: string) => ({ queryKey: ["decks", eventId] }),
}));

const stub = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock("@/hooks/use-admin-meta-candidates", () => ({
  useAcceptMetaCandidateDeck: () => ({ ...stub, mutate: captured.acceptDeck }),
  useAcceptMetaDeckField: () => ({ ...stub, mutate: captured.acceptField }),
  useAcceptMetaDeckList: () => ({ ...stub, mutate: captured.acceptList }),
  useLinkMetaCandidateDeck: () => ({ ...stub, mutate: captured.linkDeck }),
  useUnlinkMetaCandidateDeck: () => ({ ...stub, mutate: captured.unlinkDeck }),
}));

vi.mock("@/hooks/use-admin-meta-submissions", () => ({
  useMetaSubmissionForCandidateDeck: (candidateDeckId: string) => ({
    data: { submission: captured.submissions[candidateDeckId] ?? null },
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
vi.mock("@/components/admin/meta-deck-suggestions", () => ({
  MetaDeckSuggestions: ({ candidateDeckId }: { candidateDeckId: string }) => (
    <div data-testid="suggestions">{candidateDeckId}</div>
  ),
}));

vi.mock("@/components/admin/meta-card-name-picker", () => ({
  MetaCardNamePicker: () => null,
}));

vi.mock("@/components/admin/meta-public-link", () => ({
  MetaPublicLinkButton: ({ label }: { label: string }) => <span>{label}</span>,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaDeckRoster } from "./meta-deck-roster";

function liveDeck(overrides: Partial<AdminMetaDeck> = {}): AdminMetaDeck {
  return {
    deckId: "live-1",
    shareToken: "abc123abc123",
    listStatus: "full",
    name: "Yasuo Aggro",
    format: "standard",
    playerName: "Ana",
    finishTier: 1,
    record: "6-1",
    cardCount: 40,
    ...overrides,
  };
}

function candidateDeck(overrides: Partial<MetaCandidateDeck> = {}): MetaCandidateDeck {
  return {
    id: "cand-1",
    externalId: "1",
    playerName: "Ana",
    finishTier: 1,
    record: "6-1",
    name: "Yasuo Aggro",
    cards: [{ name: "Yasuo", zone: "legend", quantity: 1, cardId: "card-1" }],
    listStatus: "full",
    unresolvedNames: [],
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

function source(id: string, provider: string, decks: MetaCandidateDeck[]): MetaCandidateSource {
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
    checkedAt: null,
    decks,
  };
}

const reset = createStoreResetter(useMetaRosterStore);

describe("MetaDeckRoster", () => {
  beforeEach(() => {
    reset();
    captured.liveDecks = [];
    captured.submissions = {};
    vi.clearAllMocks();
  });
  afterEach(reset);

  it("renders one column per source", () => {
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[source("s1", "uvsgames", []), source("s2", "playriftbound", [])]}
        submittedDecks={[candidateDeck({ id: "sub" })]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "uvsgames" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "playriftbound" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Submissions" })).toBeInTheDocument();
  });

  it("leaves a dash where a source does not have the pilot at all", () => {
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [candidateDeck({ id: "a", playerName: "Bo", finishTier: 2 })]),
          source("s2", "playriftbound", []),
        ]}
        submittedDecks={[]}
      />,
    );
    const row = screen.getByRole("row", { name: /Bo/u });
    const cells = within(row).getAllByRole("cell");
    // Pilot, Archive, uvsgames, playriftbound.
    expect(cells).toHaveLength(4);
    expect(cells[1]).toHaveTextContent("Not archived");
    expect(cells[2]).toHaveTextContent("2nd");
    expect(cells[3]).toHaveTextContent("—");
  });

  it("expands one row without expanding its neighbour", async () => {
    const user = userEvent.setup();
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidateDeck({ id: "a", playerName: "Ana", finishTier: 1 }),
            candidateDeck({ id: "b", playerName: "Bo", finishTier: 2 }),
          ]),
        ]}
        submittedDecks={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.getByTestId("suggestions")).toHaveTextContent("a");
    expect(useMetaRosterStore.getState().expandedRows.has("pilot:bo")).toBe(false);
  });

  it("offers the link and the new-deck accept while a source is unlinked", async () => {
    const user = userEvent.setup();
    captured.liveDecks = [liveDeck({ playerName: "Ana" })];
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[source("s1", "uvsgames", [candidateDeck({ id: "a", playerName: "Ana" })])]}
        submittedDecks={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    await user.click(screen.getByRole("button", { name: "Link to this deck" }));
    expect(captured.linkDeck).toHaveBeenCalledWith({ id: "a", deckId: "live-1" });

    await user.click(screen.getByRole("button", { name: "Accept as new deck" }));
    expect(captured.acceptDeck).toHaveBeenCalledWith({ id: "a" });
  });

  it("takes one field of a linked deck, and the whole list separately", async () => {
    const user = userEvent.setup();
    captured.liveDecks = [liveDeck({ playerName: "Ana", finishTier: 1 })];
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidateDeck({
              id: "a",
              playerName: "Ana",
              finishTier: 4,
              deckId: "live-1",
              state: "changed",
              diff: { fields: [], cards: { added: [], removed: [], changed: [] } },
            }),
          ]),
        ]}
        submittedDecks={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    // Only the differing field offers a take.
    const takes = screen.getAllByRole("button", { name: "Take" });
    expect(takes).toHaveLength(1);
    await user.click(takes[0]!);
    expect(captured.acceptField).toHaveBeenCalledWith({ id: "a", field: "finishTier" });

    await user.click(screen.getByRole("button", { name: "Take this list" }));
    expect(captured.acceptList).toHaveBeenCalledWith({ id: "a" });
  });

  it("blocks the accept of a deck with unmatched card names", async () => {
    const user = userEvent.setup();
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[
          source("s1", "uvsgames", [
            candidateDeck({ id: "a", playerName: "Ana", unresolvedNames: ["Yasou"] }),
          ]),
        ]}
        submittedDecks={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.getByRole("button", { name: "Accept as new deck" })).toBeDisabled();
    expect(screen.getByText("1 card name still unmatched.")).toBeInTheDocument();
  });

  it("shows no resolve control for a provider's deck", async () => {
    const user = userEvent.setup();
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[source("s1", "uvsgames", [candidateDeck({ id: "a", playerName: "Ana" })])]}
        submittedDecks={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.queryByTestId("resolve-control")).not.toBeInTheDocument();
  });

  it("shows the resolve control for a deck someone contributed", async () => {
    const user = userEvent.setup();
    captured.submissions = { sub: { id: "s-1", status: "pending" } };
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[]}
        submittedDecks={[candidateDeck({ id: "sub", playerName: "Ana", submittedByName: "Rin" })]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ana/u }));
    expect(screen.getByTestId("resolve-control")).toBeInTheDocument();
  });

  it("says so when no source carries a deck", () => {
    render(
      <MetaDeckRoster
        metaEventId="event-1"
        sources={[source("s1", "uvsgames", [])]}
        submittedDecks={[]}
      />,
    );
    expect(screen.getByText("No source carries a deck for this event yet.")).toBeInTheDocument();
  });
});
