import type { Card, DeckCardResponse, DeckDetailResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";

const USER_ID = "user-1";

function deckCard(cardId: string, quantity: number): DeckCardResponse {
  return { cardId, zone: WellKnown.deckZone.MAIN, quantity, preferredPrintingId: null };
}

function deckDetail(cards: DeckCardResponse[]): DeckDetailResponse {
  return { deck: {}, cards } as unknown as DeckDetailResponse;
}

// The server state each member's detail query resolves to. Tests mutate the
// query cache directly to stand in for an autosave writing new cards back.
const details: Record<string, DeckDetailResponse> = {};

vi.mock("@/lib/auth-session", () => ({ useRequiredUserId: () => USER_ID }));

vi.mock("@/hooks/use-cards", async () => {
  const { stubCard } = await import("@/test/factories");
  const cardsById: Record<string, Card> = { "card-1": stubCard({ slug: "card-1", name: "Yasuo" }) };
  return { useCards: () => ({ cardsById }) };
});

vi.mock("@/hooks/use-decks", async () => {
  const { queryKeys: keys } = await import("@/lib/query-keys");
  return {
    useDecks: () => ({
      data: [
        {
          deck: {
            id: "deck-a",
            name: "Yasuo Aggro",
            familyId: "family-1",
            predecessorDeckId: null,
            isDraft: false,
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        },
        {
          deck: {
            id: "deck-b",
            name: "Yasuo Aggro (v2)",
            familyId: "family-1",
            predecessorDeckId: "deck-a",
            isDraft: false,
            updatedAt: "2026-08-02T00:00:00.000Z",
          },
        },
      ],
    }),
    deckDetailQueryOptions: (userId: string, deckId: string) => ({
      queryKey: keys.decks.detail(userId, deckId),
      queryFn: () => Promise.resolve(details[deckId]),
    }),
  };
});

// Both dialogs render closed here and drag in the whole deck-editing surface.
vi.mock("./deck-variant-create-dialog", () => ({ DeckVariantCreateDialog: () => null }));
vi.mock("./deck-variants-dialog", () => ({ DeckVariantsDialog: () => null }));

const { DeckVariantRail } = await import("./deck-variant-rail");

describe("DeckVariantRail", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    details["deck-a"] = deckDetail([deckCard("card-1", 3)]);
    details["deck-b"] = deckDetail([deckCard("card-1", 3)]);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function renderRail() {
    return render(
      <QueryClientProvider client={queryClient}>
        <DeckVariantRail deckId="deck-b" />
      </QueryClientProvider>,
    );
  }

  it("draws the step diff between two family members", async () => {
    renderRail();
    expect(await screen.findByText("−0")).toBeInTheDocument();
    expect(screen.getByText("+0")).toBeInTheDocument();
  });

  it("follows later edits to the open deck's cards", async () => {
    renderRail();
    await screen.findByText("−0");

    act(() => {
      queryClient.setQueryData<DeckDetailResponse>(
        queryKeys.decks.detail(USER_ID, "deck-b"),
        deckDetail([deckCard("card-1", 1)]),
      );
    });

    expect(await screen.findByText("−2")).toBeInTheDocument();
    expect(screen.getByText("+0")).toBeInTheDocument();
  });
});
