import type { MetaDeckDetailResponse, PublicDeckCardResponse } from "@openrift/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  deck: null as MetaDeckDetailResponse | null,
  userId: null as string | null,
  openCardDetail: null as ReturnType<typeof vi.fn> | null,
  encode: vi.fn(),
  copy: vi.fn(),
}));

vi.mock("@/hooks/use-meta", () => ({ useMetaDeck: () => ({ data: state.deck }) }));
vi.mock("@/lib/auth-session", () => ({ useUserId: () => state.userId }));
vi.mock("@/hooks/use-decks", () => ({
  useCloneSharedDeck: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEncodeDeckCards: () => ({ mutateAsync: state.encode, isPending: false }),
}));
vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: state.copy, reset: vi.fn() }),
}));
vi.mock("@/components/cards/card-detail-opener", () => ({
  useOpenCardDetail: () => state.openCardDetail,
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

const { MetaEventDeckPreview } = await import("./meta-event-deck-preview");

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
    imageId: "img-a",
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
  card({
    cardId: "card-champion",
    zone: "champion",
    cardName: "Sivir, Battle Mistress",
    cardType: "unit",
    cardTypes: ["unit"],
    resolvedPrintingId: "p-champion",
  }),
  card({
    cardId: "card-battlefield",
    zone: "battlefield",
    cardName: "Howling Abyss",
    cardType: "battlefield",
    cardTypes: ["battlefield"],
    resolvedPrintingId: "p-battlefield",
  }),
  card({
    cardId: "card-ruin",
    zone: "main",
    cardName: "Ruin Runner",
    cardType: "unit",
    cardTypes: ["unit"],
    quantity: 3,
    energy: 5,
    resolvedPrintingId: "p-ruin",
  }),
  card({
    cardId: "card-punch",
    zone: "main",
    quantity: 8,
    energy: 1,
    resolvedPrintingId: "p-punch",
  }),
  card({
    cardId: "card-squire",
    zone: "main",
    cardName: "Blade Squire",
    cardType: "unit",
    cardTypes: ["unit"],
    quantity: 9,
    energy: 2,
  }),
  card({
    cardId: "card-gadget",
    zone: "main",
    cardName: "Yordle Gadget",
    cardType: "gear",
    cardTypes: ["gear"],
    quantity: 3,
    energy: null,
    preferredPrintingId: "p-gadget",
  }),
  card({
    cardId: "card-side",
    zone: "sideboard",
    cardName: "Sideboard Sage",
    quantity: 5,
    energy: 3,
    resolvedPrintingId: "p-side",
  }),
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

/** The strip in render order: every thumb carries its card name as a title. */
const STRIP_ORDER = [
  "Sivir, Battle Mistress",
  "Howling Abyss",
  "Punch First",
  "Blade Squire",
  "Ruin Runner",
  "Yordle Gadget",
  "Sideboard Sage",
];

const SEQUENCE = ["p-champion", "p-battlefield", "p-punch", "p-ruin", "p-gadget", "p-side"];

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

function renderPreview(): HTMLElement {
  const { container } = render(<MetaEventDeckPreview token={TOKEN} />);
  return container;
}

function stripNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[title]")].map((el) => el.getAttribute("title") ?? "");
}

function groupKeys(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>("[data-group]")].map(
    (el) => el.dataset.group ?? "",
  );
}

describe("MetaEventDeckPreview", () => {
  beforeEach(() => {
    state.deck = metaDeck();
    state.userId = null;
    state.openCardDetail = vi.fn();
    state.encode = vi.fn(async () => ({ code: "RB1-TESTCODE", warnings: [] }));
    state.copy = vi.fn();
  });

  it("leads the strip with the champion and its battlefields", () => {
    const container = renderPreview();

    expect(stripNames(container).slice(0, 2)).toEqual(["Sivir, Battle Mistress", "Howling Abyss"]);
  });

  it("orders the main deck by energy, the costless cards last", () => {
    const container = renderPreview();

    expect(stripNames(container).slice(2, 6)).toEqual([
      "Punch First",
      "Blade Squire",
      "Ruin Runner",
      "Yordle Gadget",
    ]);
  });

  it("badges a card only where several copies were played", () => {
    renderPreview();

    expect(screen.getByRole("button", { name: "3× Ruin Runner" })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "Sivir, Battle Mistress" }).textContent).toBe("");
  });

  it("ends the strip with a dimmed sideboard", () => {
    const container = renderPreview();

    expect(stripNames(container).at(-1)).toBe("Sideboard Sage");
    expect(screen.getByRole("button", { name: "5× Sideboard Sage" })).toHaveClass("opacity-55");
    expect(groupKeys(container)).toEqual(["lead", "main", "sideboard"]);
  });

  it("drops the sideboard group from a list without one", () => {
    state.deck = metaDeck(
      {},
      CARDS.filter((entry) => entry.zone !== "sideboard"),
    );
    const container = renderPreview();

    expect(container.querySelector("[title='Sideboard Sage']")).toBeNull();
    expect(groupKeys(container)).toEqual(["lead", "main"]);
    expect(screen.queryByText(/Sideboard/u)).toBeNull();
  });

  it("says which zones a partial list is missing", () => {
    state.deck = metaDeck(
      { listStatus: "partial" },
      CARDS.filter((entry) => entry.zone !== "battlefield"),
    );
    renderPreview();

    expect(screen.getByText(/the battlefields are not/u)).toBeInTheDocument();
  });

  it("says nothing about missing zones on a full list", () => {
    renderPreview();

    expect(screen.queryByText(/are not/u)).toBeNull();
  });

  it("splits the main deck by type without ever printing its total", () => {
    renderPreview();

    expect(screen.getByText("12 units · 8 spells · 3 gear")).toBeInTheDocument();
    expect(screen.queryByText(/23/u)).toBeNull();
  });

  it("counts the runes per domain", () => {
    renderPreview();

    expect(screen.getByAltText("Fury").closest("span.items-center")?.textContent).toBe("8");
    expect(screen.getByAltText("Calm").closest("span.items-center")?.textContent).toBe("4");
  });

  it("counts the sideboard the strip only dims", () => {
    renderPreview();

    expect(screen.getByText("Sideboard 5")).toBeInTheDocument();
  });

  it("credits the contributors who typed the list in", () => {
    state.deck = metaDeck({ contributors: ["Alice", "Bob"] });
    renderPreview();

    expect(screen.getByText("Contributed by Alice and Bob")).toBeInTheDocument();
  });

  it("opens a clicked card's detail on the whole strip's sequence", async () => {
    const user = userEvent.setup();
    renderPreview();

    await user.click(screen.getByRole("button", { name: "3× Ruin Runner" }));

    expect(state.openCardDetail).toHaveBeenCalledWith({
      printingId: "p-ruin",
      sequence: SEQUENCE,
    });
  });

  it("falls back to the preferred printing where none resolved", async () => {
    const user = userEvent.setup();
    renderPreview();

    await user.click(screen.getByRole("button", { name: "3× Yordle Gadget" }));

    expect(state.openCardDetail).toHaveBeenCalledWith({
      printingId: "p-gadget",
      sequence: SEQUENCE,
    });
  });

  it("leaves a card the catalog cannot open as plain art", () => {
    const container = renderPreview();

    expect(screen.queryByRole("button", { name: /Blade Squire/u })).toBeNull();
    expect(container.querySelector("[title='Blade Squire']")?.tagName).toBe("SPAN");
  });

  it("makes nothing clickable without a card detail overlay above it", () => {
    state.openCardDetail = null;
    const container = renderPreview();

    for (const name of STRIP_ORDER) {
      expect(container.querySelector(`[title='${name}']`)?.tagName).toBe("SPAN");
    }
  });

  it("labels the menu's fork by where the copy lands", async () => {
    const user = userEvent.setup();
    renderPreview();

    await user.click(screen.getByRole("button", { name: "Decklist actions" }));

    expect(
      await screen.findByRole("menuitem", { name: "Open in deck builder" }),
    ).toBeInTheDocument();
  });

  it("labels the menu's fork as forking for a signed-in reader", async () => {
    const user = userEvent.setup();
    state.userId = "user-1";
    renderPreview();

    await user.click(screen.getByRole("button", { name: "Decklist actions" }));

    expect(await screen.findByRole("menuitem", { name: "Fork to my decks" })).toBeInTheDocument();
  });

  it("encodes the list before putting its code on the clipboard", async () => {
    const user = userEvent.setup();
    renderPreview();

    await user.click(screen.getByRole("button", { name: "Decklist actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Copy deck code" }));

    await waitFor(() => {
      expect(state.copy).toHaveBeenCalledWith("RB1-TESTCODE");
    });
    expect(state.encode).toHaveBeenCalledTimes(1);
  });

  it("links on to the deck's own page", () => {
    renderPreview();

    expect(screen.getByRole("link", { name: "Open deck" })).toHaveAttribute(
      "href",
      `/meta/decks/${TOKEN}`,
    );
  });

  it("offers a signed-out reader the sign-in that would compare it", () => {
    renderPreview();

    expect(
      screen.getByRole("link", { name: "Sign in to compare with your collection" }),
    ).toHaveAttribute("href", "/login?redirect=%2Fmeta%2Fsummoner-skirmish");
  });

  it("says nothing about signing in to a reader already signed in", () => {
    state.userId = "user-1";
    renderPreview();

    expect(screen.queryByText("Sign in to compare with your collection")).toBeNull();
  });
});
