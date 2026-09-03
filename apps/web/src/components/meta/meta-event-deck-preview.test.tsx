import type { MetaDeckDetailResponse, PublicDeckCardResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { createStoreResetter } from "@/test/store-helpers";

const state = vi.hoisted(() => ({
  deck: null as MetaDeckDetailResponse | null,
  ownership: undefined as DeckOwnershipData | undefined,
  userId: null as string | null,
}));

vi.mock("@/hooks/use-meta", () => ({ useMetaDeck: () => ({ data: state.deck }) }));
vi.mock("@/lib/auth-session", () => ({ useUserId: () => state.userId }));
vi.mock("@/hooks/use-decks", () => ({
  useCloneSharedDeck: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["fury", "calm"] },
    labels: { domains: { fury: "Fury", calm: "Calm" } },
  }),
}));
vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return { Link: fixtures.StubLink, useNavigate: () => vi.fn() };
});

// The real bridge needs the catalog, the price feed and a live query. The
// preview only ever sees its result, so the mock publishes a fixture instead.
vi.mock("@/components/deck/deck-ownership-bridge", () => ({
  DeckOwnershipBridge: ({
    onResult,
  }: {
    onResult: (data: DeckOwnershipData | undefined) => void;
  }) => {
    useEffect(() => {
      onResult(state.ownership);
    }, [onResult]);
    return null;
  },
}));

const { MetaEventDeckPreview } = await import("./meta-event-deck-preview");
const { useDisplayStore } = await import("@/stores/display-store");

const TOKEN = "aB3dE5gH7jK9";

function card(overrides: Partial<PublicDeckCardResponse>): PublicDeckCardResponse {
  return {
    cardId: "card-a",
    zone: "main",
    quantity: 1,
    preferredPrintingId: null,
    cardName: "Punch First",
    cardSlug: "punch-first",
    cardType: "spell",
    cardTypes: ["spell"],
    superTypes: [],
    domains: ["fury"],
    tags: [],
    keywords: [],
    maxCopiesOverride: null,
    banned: false,
    energy: null,
    might: null,
    power: null,
    resolvedPrintingId: null,
    shortCode: null,
    imageId: null,
    ...overrides,
  } as PublicDeckCardResponse;
}

const CARDS: PublicDeckCardResponse[] = [
  card({
    cardId: "card-legend",
    zone: "legend",
    cardName: "Emperor of the Sands",
    cardType: "legend",
    cardTypes: ["legend"],
    tags: ["Azir"],
  }),
  card({ cardId: "card-champion", zone: "champion", cardName: "Sivir, Battle Mistress" }),
  card({ cardId: "card-unit", zone: "main", cardType: "unit", cardTypes: ["unit"], quantity: 12 }),
  card({ cardId: "card-spell", zone: "main", quantity: 8 }),
  card({ cardId: "card-gear", zone: "main", cardType: "gear", cardTypes: ["gear"], quantity: 3 }),
  card({ cardId: "card-side", zone: "sideboard", quantity: 5 }),
  card({
    cardId: "card-rune-fury",
    zone: "runes",
    cardType: "rune",
    cardTypes: ["rune"],
    quantity: 8,
    domains: ["fury"],
  }),
  card({
    cardId: "card-rune-calm",
    zone: "runes",
    cardType: "rune",
    cardTypes: ["rune"],
    quantity: 4,
    domains: ["calm"],
  }),
];

function metaDeck(
  meta: Partial<MetaDeckDetailResponse["meta"]> = {},
  cards = CARDS,
): MetaDeckDetailResponse {
  return {
    deck: { name: "Azir Control", format: "constructed", formatConfig: null, links: [] },
    cards,
    owner: { displayName: "Nova", gravatarHash: null },
    plan: null,
    planCardMeta: [],
    customTagAssignments: {},
    meta: {
      event: { slug: "summoner-skirmish", name: "Summoner Skirmish", eventDate: "2026-08-01" },
      listStatus: "full",
      playerName: "Nova",
      rank: 1,
      rankIsTier: false,
      wins: 6,
      losses: 1,
      draws: null,
      contributors: [],
      ...meta,
    },
  } as unknown as MetaDeckDetailResponse;
}

function ownership(overrides: Partial<DeckOwnershipData> = {}): DeckOwnershipData {
  return {
    deckValueCents: 123.45,
    mainValueCents: 100,
    sideboardValueCents: 23.45,
    totalOwned: 40,
    totalNeeded: 56,
    missingCount: 16,
    ...overrides,
  } as DeckOwnershipData;
}

function renderPreview(): void {
  render(<MetaEventDeckPreview token={TOKEN} />);
}

describe("MetaEventDeckPreview", () => {
  let resetDisplay: () => void;

  beforeEach(() => {
    resetDisplay = createStoreResetter(useDisplayStore);
    useDisplayStore.setState({ marketplaceOrder: ["cardmarket"] });
    state.deck = metaDeck();
    state.ownership = ownership();
    state.userId = null;
  });

  afterEach(() => {
    resetDisplay();
  });

  it("names the chosen champion, which the standings row does not", () => {
    renderPreview();

    expect(screen.getByText("Chosen champion")).toBeInTheDocument();
    expect(screen.getByText("Sivir, Battle Mistress")).toBeInTheDocument();
  });

  it("leaves what the standings row above it already carries to that row", () => {
    state.deck = metaDeck({ listStatus: "partial" });
    renderPreview();

    expect(screen.queryByText("Nova")).toBeNull();
    expect(screen.queryByText("Partial list")).toBeNull();
    expect(screen.queryByText("Azir Control")).toBeNull();
  });

  it("credits the contributors who typed the list in", () => {
    state.deck = metaDeck({ contributors: ["Alice", "Bob"] });
    renderPreview();

    expect(screen.getByText("Contributed by Alice and Bob")).toBeInTheDocument();
  });

  it("counts the main deck by type, sideboard excluded", () => {
    renderPreview();

    expect(screen.getByText("12 units · 8 spells · 3 gear")).toBeInTheDocument();
  });

  it("counts the runes per domain", () => {
    renderPreview();

    expect(screen.getByAltText("Fury").closest("span.items-center")?.textContent).toBe("8");
    expect(screen.getByAltText("Calm").closest("span.items-center")?.textContent).toBe("4");
  });

  it("leaves the composition blocks out of a list holding neither", () => {
    state.deck = metaDeck({}, [CARDS[0]!]);
    renderPreview();

    expect(screen.queryByText("Card types")).not.toBeInTheDocument();
    expect(screen.queryByText("Runes")).not.toBeInTheDocument();
  });

  it("leads with the deck's value and splits the sideboard out", () => {
    renderPreview();

    expect(screen.getByText("123,45 €")).toBeInTheDocument();
    expect(screen.getByText("Main deck 100,00 € · Sideboard 23,45 €")).toBeInTheDocument();
  });

  it("says nothing about a sideboard that costs nothing", () => {
    state.ownership = ownership({ sideboardValueCents: 0 });
    renderPreview();

    expect(screen.getByText("Main deck 100,00 €")).toBeInTheDocument();
  });

  it("says so when the marketplace has no prices for the list", () => {
    state.ownership = ownership({
      deckValueCents: undefined,
      mainValueCents: undefined,
      sideboardValueCents: undefined,
    });
    renderPreview();

    expect(screen.getByText("No prices yet")).toBeInTheDocument();
    expect(screen.queryByText(/Main deck/u)).not.toBeInTheDocument();
  });

  it("measures a signed-in reader's collection against the list", () => {
    state.userId = "user-1";
    renderPreview();

    expect(screen.getByText("40 of 56 cards owned")).toBeInTheDocument();
  });

  it("calls out a list the reader owns in full", () => {
    state.userId = "user-1";
    state.ownership = ownership({ missingCount: 0 });
    renderPreview();

    expect(screen.getByText("All 56 cards owned")).toBeInTheDocument();
  });

  it("offers a signed-out reader the sign-in that would compare it", () => {
    renderPreview();

    const link = screen.getByRole("link", { name: "Sign in to compare with your collection" });
    expect(link).toHaveAttribute("href", "/login?redirect=%2Fmeta%2Fsummoner-skirmish");
    expect(screen.queryByText(/cards owned/u)).not.toBeInTheDocument();
  });

  it("labels the fork by where the copy lands", () => {
    renderPreview();
    expect(screen.getByRole("button", { name: "Open in deck builder" })).toBeInTheDocument();
  });

  it("labels the fork as forking for a signed-in reader", () => {
    state.userId = "user-1";
    renderPreview();

    expect(screen.getByRole("button", { name: "Fork to my decks" })).toBeInTheDocument();
  });

  it("links on to the deck's own page", () => {
    renderPreview();

    expect(screen.getByRole("link", { name: "Open deck" })).toHaveAttribute(
      "href",
      `/meta/decks/${TOKEN}`,
    );
  });
});
