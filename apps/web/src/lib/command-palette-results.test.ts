import { describe, expect, it } from "vitest";

import { buildPaletteGroups } from "@/lib/command-palette-results";
import type { HelpArticle } from "@/lib/help-article";
import type { NavItemConfig } from "@/lib/nav-items";
import type { QuickAddCardResult } from "@/lib/quick-add-result";
import { stubPrinting } from "@/test/factories";

function navItem(label: string, to: string, description?: string): NavItemConfig {
  return { label, to, icon: (() => null) as unknown as NavItemConfig["icon"], description };
}

function helpArticle(slug: string, title: string, description: string): HelpArticle {
  return {
    slug,
    title,
    description,
    icon: (() => null) as unknown as HelpArticle["icon"],
    component: () => Promise.resolve({ default: () => null }),
  };
}

function cardResult(name: string): QuickAddCardResult {
  const printing = stubPrinting({ card: { name } });
  return {
    cardId: printing.cardId,
    cardName: name,
    defaultPrinting: printing,
    printings: [printing],
    ownedCount: 0,
  };
}

const NAV = [
  navItem("Cards", "/cards"),
  navItem("Decks", "/decks"),
  navItem("Rules", "/rules", "Core and tournament rules"),
];
const HELP = [
  helpArticle("deck-building", "Building Decks", "How to build a deck."),
  helpArticle("groups", "Groups", "Share a collection with friends."),
];

function headings(groups: { heading: string }[]): string[] {
  return groups.map((group) => group.heading);
}

describe("buildPaletteGroups", () => {
  describe("with an empty query", () => {
    it("lists the whole navigation, uncapped", () => {
      const groups = buildPaletteGroups({
        query: "",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      expect(headings(groups)).toEqual(["Go to"]);
      expect(groups[0]?.rows).toHaveLength(NAV.length);
    });

    it("leads with the route's quick-add when it offers one", () => {
      const groups = buildPaletteGroups({
        query: "",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: { label: "Add to My Binder", moveLabel: null },
      });
      expect(headings(groups)).toEqual(["Actions", "Go to"]);
    });

    it("lists a page once even when both nav lists carry it", () => {
      const groups = buildPaletteGroups({
        query: "",
        cards: [],
        navItems: [...NAV, navItem("Scan", "/scan"), navItem("Scan", "/scan", "Use your camera")],
        helpArticles: HELP,
        quickAdd: null,
      });
      const scans = (groups[0]?.rows ?? []).filter((row) => row.id === "nav:/scan");
      expect(scans).toHaveLength(1);
    });

    it("offers add and move as two rows rather than a mode inside one", () => {
      const groups = buildPaletteGroups({
        query: "",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: { label: "Add to My Binder", moveLabel: "Move to My Binder" },
      });
      const actions = groups.find((group) => group.heading === "Actions");
      expect(actions?.rows.map((row) => "verb" in row && row.verb)).toEqual(["add", "move"]);
    });

    it("offers only add where the surface cannot move copies", () => {
      const groups = buildPaletteGroups({
        query: "",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: { label: "Add cards to this deck", moveLabel: null },
      });
      const actions = groups.find((group) => group.heading === "Actions");
      expect(actions?.rows).toHaveLength(1);
    });

    it("offers no search rows, since there is nothing to search for", () => {
      const groups = buildPaletteGroups({
        query: "",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      expect(headings(groups)).not.toContain("Search");
    });
  });

  describe("with a query", () => {
    it("puts cards first and the search rows last", () => {
      const groups = buildPaletteGroups({
        query: "yasuo",
        cards: [cardResult("Yasuo, the Unforgiven")],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      expect(headings(groups)).toEqual(["Cards", "Search"]);
    });

    it("floats the search rows to the top when no card matched", () => {
      const groups = buildPaletteGroups({
        query: "might",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      expect(headings(groups)[0]).toBe("Search");
    });

    it("carries the trimmed query into both search rows", () => {
      const groups = buildPaletteGroups({
        query: "  might  ",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      const rows = groups[0]?.rows ?? [];
      expect(rows.map((row) => row.kind)).toEqual(["searchCards", "searchRules"]);
      expect(rows.every((row) => "query" in row && row.query === "might")).toBe(true);
    });

    it("keeps the description when folding a duplicate destination", () => {
      const groups = buildPaletteGroups({
        query: "camera",
        cards: [],
        navItems: [navItem("Scan", "/scan"), navItem("Scan", "/scan", "Use your camera")],
        helpArticles: [],
        quickAdd: null,
      });
      const nav = groups.find((group) => group.heading === "Go to");
      expect(nav?.rows).toHaveLength(1);
    });

    it("matches navigation on the label and on the description", () => {
      const groups = buildPaletteGroups({
        query: "tournament",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      const nav = groups.find((group) => group.heading === "Go to");
      expect(nav?.rows).toHaveLength(1);
      expect(nav?.rows[0]).toMatchObject({ kind: "nav", id: "nav:/rules" });
    });

    it("matches help articles on their description too", () => {
      const groups = buildPaletteGroups({
        query: "friends",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      const help = groups.find((group) => group.heading === "Help");
      expect(help?.rows[0]).toMatchObject({ kind: "help", id: "help:groups" });
    });

    it("ignores case", () => {
      const groups = buildPaletteGroups({
        query: "DECKS",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      const nav = groups.find((group) => group.heading === "Go to");
      expect(nav?.rows[0]).toMatchObject({ id: "nav:/decks" });
    });

    it("keeps the quick-add row only while the query still matches it", () => {
      const quickAdd = { label: "Add to My Binder", moveLabel: null };
      const matching = buildPaletteGroups({
        query: "binder",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd,
      });
      expect(headings(matching)).toContain("Actions");

      const notMatching = buildPaletteGroups({
        query: "zzz",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd,
      });
      expect(headings(notMatching)).not.toContain("Actions");
    });

    it("narrows to the verb the query names", () => {
      const groups = buildPaletteGroups({
        query: "move",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: { label: "Add to My Binder", moveLabel: "Move to My Binder" },
      });
      const actions = groups.find((group) => group.heading === "Actions");
      expect(actions?.rows.map((row) => "verb" in row && row.verb)).toEqual(["move"]);
    });

    it("holds the help and search rows back until the query is two characters", () => {
      const groups = buildPaletteGroups({
        query: "d",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      expect(headings(groups)).toEqual(["Go to"]);
    });

    it("caps the card list", () => {
      const groups = buildPaletteGroups({
        query: "a",
        cards: Array.from({ length: 12 }, (_, index) => cardResult(`Card ${index}`)),
        navItems: [],
        helpArticles: [],
        quickAdd: null,
      });
      expect(groups[0]?.rows).toHaveLength(6);
    });

    it("caps the navigation list, unlike the empty-query view", () => {
      const groups = buildPaletteGroups({
        query: "page",
        cards: [],
        navItems: Array.from({ length: 9 }, (_, index) => navItem(`Page ${index}`, `/p${index}`)),
        helpArticles: [],
        quickAdd: null,
      });
      const nav = groups.find((group) => group.heading === "Go to");
      expect(nav?.rows).toHaveLength(5);
    });

    it("returns only the search rows when nothing else matches", () => {
      const groups = buildPaletteGroups({
        query: "qqqq",
        cards: [],
        navItems: NAV,
        helpArticles: HELP,
        quickAdd: null,
      });
      expect(headings(groups)).toEqual(["Search"]);
    });
  });
});
