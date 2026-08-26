import { describe, expect, it } from "vitest";

import type { CatalogCard, CatalogPrinting } from "./catalog-cache.js";
import { makeCard, makePrinting } from "./test/factories.js";
import {
  buildScanIndex,
  buildTradeReply,
  MAX_SCAN_MATCHES,
  scanForCards,
  scanTokens,
  tradeLine,
} from "./trade-scan.js";

const SITE = "https://openrift.example";

/**
 * Builds an index over cards given as `[id, name]`, each with one printing.
 *
 * @returns The scan index for those cards.
 */
function indexOf(
  entries: [string, string][],
  printings: Partial<CatalogPrinting>[] = [{ cardId: entries[0]?.[0] }],
) {
  const cards: CatalogCard[] = entries.map(([id, name]) =>
    makeCard({ id, name, slug: name.toLowerCase().replaceAll(/\W+/gu, "-") }),
  );
  const byCard = new Map<string, CatalogPrinting[]>();
  for (const [position, overrides] of printings.entries()) {
    const printing = makePrinting({ id: `printing-${position}`, ...overrides });
    byCard.set(printing.cardId, [...(byCard.get(printing.cardId) ?? []), printing]);
  }
  return buildScanIndex(cards, byCard);
}

const NAMES: [string, string][] = [
  ["card-jinx", "Jinx, Rebel"],
  ["card-bare", "Jinx"],
  ["card-draw", "Quick-Draw"],
  ["card-gold", "Gold"],
];

function names(index: ReturnType<typeof indexOf>, content: string): string[] {
  return scanForCards(content, index).map((card) => card.name);
}

describe("scanTokens", () => {
  it("reduces a name to punctuation-free tokens", () => {
    expect(scanTokens("Jinx, Rebel")).toEqual(["jinx", "rebel"]);
    expect(scanTokens("Quick-Draw")).toEqual(["quick", "draw"]);
  });

  it("folds accents and swallows apostrophes like the site's search", () => {
    // The apostrophe vanishes rather than splitting, so a name and the message
    // quoting it reduce identically however the writer typed the quote mark.
    expect(scanTokens("Brïar’s Résolve")).toEqual(["briars", "resolve"]);
    expect(scanTokens("Briar's Resolve")).toEqual(["briars", "resolve"]);
  });

  it("returns nothing for text with no letters or digits", () => {
    expect(scanTokens("!!! ---")).toEqual([]);
  });
});

describe("buildScanIndex", () => {
  it("skips names too short to be safe on their own", () => {
    const index = indexOf([["card-x", "Ox"]], []);
    expect(index.byName.size).toBe(0);
  });

  it("indexes both the short and the public printing code", () => {
    const index = indexOf([["card-1", "Jinx, Rebel"]], [{ cardId: "card-1" }]);
    expect(index.byCode.get("ogn202")?.name).toBe("Jinx, Rebel");
    expect(index.byCode.get("ogn202298")?.name).toBe("Jinx, Rebel");
  });
});

describe("scanForCards", () => {
  const index = indexOf(NAMES, [{ cardId: "card-jinx" }]);

  it("finds a card name written out in ordinary prose", () => {
    expect(names(index, "looking for Jinx, Rebel if anyone has spares")).toEqual(["Jinx, Rebel"]);
  });

  it("ignores the punctuation a chat message drops or adds", () => {
    expect(names(index, "wts jinx rebel.")).toEqual(["Jinx, Rebel"]);
    expect(names(index, "have: quick draw")).toEqual(["Quick-Draw"]);
  });

  it("prefers the longest name, so a champion's card doesn't shadow the full print", () => {
    expect(names(index, "trading Jinx, Rebel today")).toEqual(["Jinx, Rebel"]);
  });

  it("matches a bare name only when a card actually carries it", () => {
    // "Jinx" is its own card here, so it matches; the point is that it does
    // NOT resolve to "Jinx, Rebel".
    expect(names(index, "anyone got Jinx?")).toEqual(["Jinx"]);
    const withoutBare = indexOf([["card-jinx", "Jinx, Rebel"]], [{ cardId: "card-jinx" }]);
    expect(names(withoutBare, "anyone got Jinx?")).toEqual([]);
  });

  it("stays quiet on chatter that merely mentions champions", () => {
    const withoutBare = indexOf([["card-jinx", "Jinx, Rebel"]], [{ cardId: "card-jinx" }]);
    expect(names(withoutBare, "jinx into vi is such a bad matchup honestly")).toEqual([]);
  });

  it("resolves printing codes, the most precise thing a trade post can carry", () => {
    expect(names(index, "wtb OGN-202 or OGN-202/298")).toEqual(["Jinx, Rebel"]);
  });

  it("reads nothing out of code blocks, inline code, links, or quotes", () => {
    expect(names(index, "```\nJinx, Rebel\n```")).toEqual([]);
    expect(names(index, "the string `Jinx, Rebel` is in my export")).toEqual([]);
    expect(names(index, "https://example.test/jinx-rebel/gold")).toEqual([]);
    expect(names(index, "> Jinx, Rebel\nnot me though")).toEqual([]);
  });

  it("leaves bracketed references to the mention path, so nothing answers twice", () => {
    expect(names(index, "[[Jinx, Rebel]]")).toEqual([]);
  });

  it("reads nothing out of mentions, channels, and custom emoji", () => {
    expect(names(index, "<@123456> <#98765> <:Gold:42>")).toEqual([]);
  });

  it("dedupes a card named several times", () => {
    expect(names(index, "Gold, Gold and more Gold")).toEqual(["Gold"]);
  });

  it("caps a long want list", () => {
    const many: [string, string][] = Array.from({ length: 9 }, (_, position) => [
      `card-${position}`,
      `Cardname${position}`,
    ]);
    const wide = indexOf(many, []);
    const content = many.map(([, name]) => name).join(", ");
    expect(scanForCards(content, wide)).toHaveLength(MAX_SCAN_MATCHES);
  });

  it("finds every card sharing one name", () => {
    const homonyms = indexOf(
      [
        ["card-a", "Gold"],
        ["card-b", "Gold"],
      ],
      [],
    );
    expect(scanForCards("selling Gold", homonyms).map((card) => card.id)).toEqual([
      "card-a",
      "card-b",
    ]);
  });

  it("returns nothing for an empty or nameless message", () => {
    expect(names(index, "")).toEqual([]);
    expect(names(index, "gg wp thanks for the trade")).toEqual([]);
  });
});

describe("tradeLine", () => {
  const card = makeCard();

  it("names each holder and their count, linking the card", () => {
    expect(
      tradeLine(
        card,
        {
          groupName: "Summoner Skirmish",
          holders: [
            { userName: "Alice", quantity: 2, printings: [] },
            { userName: "Mira", quantity: 1, printings: [] },
          ],
        },
        SITE,
      ),
    ).toBe(`**[Jinx, Rebel](${SITE}/cards/jinx-rebel)** · Alice 2× · Mira 1×`);
  });

  it("copes with a holder whose display name is gone", () => {
    expect(
      tradeLine(
        card,
        { groupName: null, holders: [{ userName: null, quantity: 1, printings: [] }] },
        SITE,
      ),
    ).toContain("Unknown user 1×");
  });

  it("is silent when nobody offers the card", () => {
    expect(tradeLine(card, null, SITE)).toBeNull();
    expect(tradeLine(card, { groupName: "Empty", holders: [] }, SITE)).toBeNull();
  });
});

describe("buildTradeReply", () => {
  it("heads the reply with the group whose lists it read", () => {
    expect(buildTradeReply(["line one", "line two"], "Summoner Skirmish")).toBe(
      "On tradelists in **Summoner Skirmish**:\nline one\nline two",
    );
  });

  it("drops the cards nobody offers", () => {
    expect(buildTradeReply([null, "line two", null], null)).toBe("On tradelists:\nline two");
  });

  it("says nothing at all when no card had an offer", () => {
    expect(buildTradeReply([null, null], "Summoner Skirmish")).toBeNull();
    expect(buildTradeReply([], null)).toBeNull();
  });
});
