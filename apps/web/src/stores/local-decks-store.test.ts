import { WellKnown } from "@openrift/shared";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import type { LocalDeck, LocalDeckCard } from "./local-decks-store";
import {
  isLocalDeckId,
  LOCAL_DECK_PREFIX,
  sanitizeDecks,
  useLocalDecksStore,
  writeLocalDecksItem,
} from "./local-decks-store";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

/**
 * Non-reactive read of a single local deck, for assertions.
 * @returns The local deck, or undefined when absent.
 */
function getLocalDeck(id: string): LocalDeck | undefined {
  return useLocalDecksStore.getState().decks[id];
}

let resetStore: () => void;

const sampleCards: LocalDeckCard[] = [
  { zone: "legend", cardId: "card-legend", quantity: 1, preferredPrintingId: null },
  { zone: "main", cardId: "card-a", quantity: 3, preferredPrintingId: "printing-a" },
];

beforeEach(() => {
  resetStore = createStoreResetter(useLocalDecksStore);
  vi.clearAllMocks();
});

afterEach(() => {
  resetStore();
});

describe("isLocalDeckId", () => {
  it("matches only ids carrying the local prefix", () => {
    expect(isLocalDeckId(`${LOCAL_DECK_PREFIX}abc`)).toBe(true);
    expect(isLocalDeckId("0190a-real-server-uuid")).toBe(false);
    expect(isLocalDeckId("")).toBe(false);
  });
});

describe("createDeck", () => {
  it("creates an empty deck with a local id and the given name", () => {
    const id = useLocalDecksStore
      .getState()
      .createDeck(WellKnown.deckFormat.CONSTRUCTED, "My Deck");
    expect(isLocalDeckId(id)).toBe(true);
    const deck = getLocalDeck(id);
    expect(deck).toMatchObject({
      id,
      name: "My Deck",
      description: "",
      format: WellKnown.deckFormat.CONSTRUCTED,
      formatConfig: null,
      cards: [],
    });
    expect(deck?.createdAt).toBe(deck?.updatedAt);
    expect(typeof deck?.createdAt).toBe("string");
  });

  it("falls back to a default name when none is given or blank", () => {
    const id = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.FREEFORM, "   ");
    expect(getLocalDeck(id)?.name).toBe("New Deck");
  });
});

describe("updateDeck", () => {
  it("patches metadata and bumps updatedAt", () => {
    // Fake timers so the stamped `updatedAt` is provably later than `createdAt`
    // without a real delay.
    vi.useFakeTimers();
    try {
      const id = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED);
      const before = getLocalDeck(id)?.updatedAt;
      vi.advanceTimersByTime(5);
      useLocalDecksStore.getState().updateDeck(id, {
        name: "Renamed",
        description: "notes",
        format: WellKnown.deckFormat.CUSTOM_REGION,
        formatConfig: { tagSlugs: ["bandle-city"] },
      });
      const deck = getLocalDeck(id);
      expect(deck).toMatchObject({
        name: "Renamed",
        description: "notes",
        format: WellKnown.deckFormat.CUSTOM_REGION,
        formatConfig: { tagSlugs: ["bandle-city"] },
      });
      expect(deck?.updatedAt).not.toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a no-op for an unknown id", () => {
    useLocalDecksStore.getState().updateDeck("local:missing", { name: "x" });
    expect(getLocalDeck("local:missing")).toBeUndefined();
  });
});

describe("setCards", () => {
  it("replaces the full card set", () => {
    const id = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED);
    useLocalDecksStore.getState().setCards(id, sampleCards);
    expect(getLocalDeck(id)?.cards).toEqual(sampleCards);
  });

  it("is a no-op for an unknown id", () => {
    useLocalDecksStore.getState().setCards("local:missing", sampleCards);
    expect(getLocalDeck("local:missing")).toBeUndefined();
  });
});

describe("deleteDeck", () => {
  it("removes a deck and leaves others intact", () => {
    const keep = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED, "keep");
    const drop = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED, "drop");
    useLocalDecksStore.getState().deleteDeck(drop);
    expect(getLocalDeck(drop)).toBeUndefined();
    expect(getLocalDeck(keep)?.name).toBe("keep");
  });
});

describe("duplicateDeck", () => {
  it("deep-copies cards under a new id with a (copy) name", () => {
    const id = useLocalDecksStore
      .getState()
      .createDeck(WellKnown.deckFormat.CONSTRUCTED, "Original");
    useLocalDecksStore.getState().setCards(id, sampleCards);
    const copyId = useLocalDecksStore.getState().duplicateDeck(id);
    expect(copyId).not.toBeNull();
    expect(copyId).not.toBe(id);
    const copy = getLocalDeck(copyId as string);
    expect(copy?.name).toBe("Original (copy)");
    expect(copy?.cards).toEqual(sampleCards);
    // Mutating the copy must not touch the original (deep copy).
    expect(copy?.cards).not.toBe(getLocalDeck(id)?.cards);
  });

  it("returns null for an unknown id", () => {
    expect(useLocalDecksStore.getState().duplicateDeck("local:missing")).toBeNull();
  });
});

describe("clearImported", () => {
  it("removes only the listed ids", () => {
    const a = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED, "a");
    const b = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED, "b");
    const c = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED, "c");
    useLocalDecksStore.getState().clearImported([a, c]);
    expect(getLocalDeck(a)).toBeUndefined();
    expect(getLocalDeck(c)).toBeUndefined();
    expect(getLocalDeck(b)?.name).toBe("b");
  });
});

describe("writeLocalDecksItem", () => {
  it("writes through and returns true on success", () => {
    const setItem = vi.fn();
    expect(writeLocalDecksItem({ setItem }, "k", "v")).toBe(true);
    expect(setItem).toHaveBeenCalledWith("k", "v");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts and returns false when the quota is exceeded", () => {
    const setItem = vi.fn(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(writeLocalDecksItem({ setItem }, "k", "v")).toBe(false);
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it("rethrows non-quota errors", () => {
    const setItem = vi.fn(() => {
      throw new Error("boom");
    });
    expect(() => writeLocalDecksItem({ setItem }, "k", "v")).toThrow("boom");
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("sanitizeDecks", () => {
  const validDeck: LocalDeck = {
    id: "local:abc",
    name: "My Deck",
    description: "notes",
    format: WellKnown.deckFormat.CUSTOM_REGION,
    formatConfig: { tagSlugs: ["bandle-city"] },
    cards: sampleCards,
    coverCardId: null,
    coverPrintingId: null,
    coverPosition: null,
    videoUrl: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  };

  it("keeps a well-formed deck untouched", () => {
    expect(sanitizeDecks({ "local:abc": validDeck })).toEqual({ "local:abc": validDeck });
  });

  it("returns an empty record for non-object blobs", () => {
    expect(sanitizeDecks(null)).toEqual({});
    expect(sanitizeDecks("corrupt")).toEqual({});
    expect(sanitizeDecks([validDeck])).toEqual({});
  });

  it("keeps the valid decks when a sibling entry is corrupt", () => {
    const decks = sanitizeDecks({
      "local:abc": validDeck,
      "local:broken": "not a deck",
      "not-local": validDeck,
    });
    expect(Object.keys(decks)).toEqual(["local:abc"]);
  });

  it("salvages a deck with malformed cosmetic fields", () => {
    const decks = sanitizeDecks({
      "local:abc": { ...validDeck, name: 42, description: null, format: undefined },
    });
    const deck = decks["local:abc"];
    expect(deck.name).toBe("Recovered deck");
    expect(deck.description).toBe("");
    expect(deck.format).toBe(WellKnown.deckFormat.CONSTRUCTED);
    expect(deck.cards).toEqual(sampleCards);
  });

  it("drops malformed card rows but keeps the valid ones", () => {
    const decks = sanitizeDecks({
      "local:abc": {
        ...validDeck,
        cards: [
          sampleCards[0],
          { zone: "main", cardId: 7, quantity: 1, preferredPrintingId: null },
          { zone: "main", cardId: "card-b", quantity: 0, preferredPrintingId: null },
          { zone: "main", cardId: "card-c", quantity: 2.9, preferredPrintingId: 5 },
          "garbage",
        ],
      },
    });
    expect(decks["local:abc"].cards).toEqual([
      sampleCards[0],
      { zone: "main", cardId: "card-c", quantity: 2, preferredPrintingId: null },
    ]);
  });

  it("keeps zones and formats this bundle doesn't know", () => {
    // Cross-version safety: a newer deploy may write zones/formats this
    // bundle predates. They must survive the round-trip, not be dropped.
    const decks = sanitizeDecks({
      "local:abc": {
        ...validDeck,
        format: "future-format",
        cards: [{ zone: "future-zone", cardId: "card-x", quantity: 1, preferredPrintingId: null }],
      },
    });
    expect(decks["local:abc"].format).toBe("future-format");
    expect(decks["local:abc"].cards[0].zone).toBe("future-zone");
  });

  it("replaces a non-array cards value with an empty list", () => {
    const decks = sanitizeDecks({ "local:abc": { ...validDeck, cards: "corrupt" } });
    expect(decks["local:abc"].cards).toEqual([]);
  });
});
