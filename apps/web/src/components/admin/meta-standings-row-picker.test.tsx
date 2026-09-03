import type { AdminMetaPlayer } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MetaStandingsRowPicker } from "@/components/admin/meta-standings-row-picker";
import { queryKeys } from "@/lib/query-keys";

function player(overrides: Partial<AdminMetaPlayer> = {}): AdminMetaPlayer {
  return {
    id: "player-1",
    rank: 1,
    rankIsTier: false,
    playerName: "Rell Enjoyer",
    wins: 6,
    losses: 1,
    draws: 0,
    legendCardId: null,
    legendName: null,
    championCardId: null,
    championName: null,
    listStatus: "full",
    deckId: "deck-1",
    shareToken: "abcd1234",
    deckName: "Chaos Engine",
    deckFormat: "standard",
    cardCount: 40,
    claimedFields: [],
    ...overrides,
  };
}

const STANDINGS = [
  player(),
  player({ id: "player-2", rank: 4, rankIsTier: true, playerName: "Braum Main", deckId: null }),
  player({ id: "player-3", rank: 8, playerName: "kim dongha", deckId: null }),
];

async function openPicker(
  onPick: (metaEventPlayerId: string, playerName: string) => void,
  currentPlayerId: string | null = null,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.admin.meta.eventPlayers("e1"), { players: STANDINGS });

  render(
    <QueryClientProvider client={client}>
      <MetaStandingsRowPicker metaEventId="e1" currentPlayerId={currentPlayerId} onPick={onPick} />
    </QueryClientProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", {
      name: currentPlayerId === null ? "Pick a standings row" : "Pick another row",
    }),
  );
}

describe("MetaStandingsRowPicker", () => {
  it("offers every standings row, whatever the overlay's name matched", async () => {
    await openPicker(vi.fn());

    expect(screen.getByText("Rell Enjoyer")).toBeInTheDocument();
    expect(screen.getByText("Braum Main")).toBeInTheDocument();
    expect(screen.getByText("kim dongha")).toBeInTheDocument();
  });

  it("prints a cut tier as a tier, so the finish reads as the archive holds it", async () => {
    await openPicker(vi.fn());

    expect(screen.getByText("T4")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("links the row that is picked", async () => {
    const onPick = vi.fn();
    await openPicker(onPick);
    await userEvent.click(screen.getByText("kim dongha"));

    expect(onPick).toHaveBeenCalledWith("player-3", "kim dongha");
  });

  it("finds a row by its finish, which is what an unrecognized name leaves", async () => {
    const onPick = vi.fn();
    await openPicker(onPick);
    await userEvent.type(screen.getByPlaceholderText("Search the standings…"), "T4");

    expect(screen.queryByText("Rell Enjoyer")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Braum Main"));
    expect(onPick).toHaveBeenCalledWith("player-2", "Braum Main");
  });

  it("marks the row already linked and does not offer to link it again", async () => {
    const onPick = vi.fn();
    await openPicker(onPick, "player-1");
    await userEvent.click(screen.getByText("Rell Enjoyer"));

    expect(screen.getByText("linked")).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });
});
