import type { DeckListItemResponse, Domain } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { DeckListItemWithNames } from "./deck-list-utils";
import {
  availableDomainsFrom,
  deckListEnrichment,
  enrichItem,
  filterAvailabilityFrom,
  filterCountsFrom,
  filterDecks,
  groupDecks,
  partitionByArchived,
  sortDecks,
} from "./deck-list-utils";

interface DeckOverrides {
  id?: string;
  name?: string;
  format?: "constructed" | "freeform";
  isPinned?: boolean;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isValid?: boolean;
  totalCards?: number;
  totalValueCents?: number | null;
  missingCount?: number | null;
  domains?: { domain: Domain; count: number }[];
  legendName?: string | null;
  championName?: string | null;
  legendDomains?: Domain[] | null;
  folderIds?: string[];
  familyId?: string | null;
  predecessorDeckId?: string | null;
  isPrimary?: boolean;
  isDraft?: boolean;
}

function makeItem(overrides: DeckOverrides = {}): DeckListItemWithNames {
  const base: DeckListItemResponse = {
    deck: {
      id: overrides.id ?? "deck-1",
      name: overrides.name ?? "Test Deck",
      descriptionSnippet: null,
      format: overrides.format ?? "constructed",
      formatConfig: null,
      coverCardId: null,
      coverPrintingId: null,
      coverPosition: null,
      collectionId: null,
      familyId: overrides.familyId ?? null,
      predecessorDeckId: overrides.predecessorDeckId ?? null,
      isPrimary: overrides.isPrimary ?? false,
      isDraft: overrides.isDraft ?? false,
      isPinned: overrides.isPinned ?? false,
      archivedAt: overrides.archivedAt ?? null,
      createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
      updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    },
    legendCardId: null,
    championCardId: null,
    totalCards: overrides.totalCards ?? 40,
    typeCounts: [],
    domainDistribution: overrides.domains ?? [],
    isValid: overrides.isValid ?? true,
    requiredProgress: overrides.totalCards ?? 40,
    requiredTotal: 56,
    totalValueCents: overrides.totalValueCents ?? null,
    missingCount: overrides.missingCount ?? null,
    folderIds: overrides.folderIds ?? [],
  };
  return enrichItem(base, {
    legendName: overrides.legendName ?? null,
    championName: overrides.championName ?? null,
    legendDomains: overrides.legendDomains ?? null,
  });
}

const NO_FILTERS = {
  search: "",
  formats: [],
  formatsExclude: [],
  validity: "all" as const,
  drafts: "all" as const,
  domains: [],
  domainsExclude: [],
  folders: [],
  foldersExclude: [],
};

describe("filterDecks", () => {
  it("matches search against name, legend, and champion", () => {
    const items = [
      makeItem({ id: "a", name: "Aatrox Aggro", legendName: "Aatrox" }),
      makeItem({ id: "b", name: "Sett Brawl", legendName: "Sett", championName: "Sett" }),
      makeItem({ id: "c", name: "Random", legendName: null, championName: "Aatrox" }),
    ];
    const search = (query: string) =>
      filterDecks(items, { ...NO_FILTERS, search: query }).map((item) => item.deck.id);
    expect(search("aatrox")).toEqual(["a", "c"]);
    expect(search("sett")).toEqual(["b"]);
    expect(search("AGGRO")).toEqual(["a"]);
    expect(search("")).toEqual(["a", "b", "c"]);
  });

  it("matches a legend name whose stored apostrophe is curly", () => {
    const items = [
      makeItem({ id: "a", name: "Evolution", legendName: "Kai’Sa", championName: "Kai’Sa" }),
      makeItem({ id: "b", name: "Brawl", legendName: "Sett" }),
    ];
    const search = (query: string) =>
      filterDecks(items, { ...NO_FILTERS, search: query }).map((item) => item.deck.id);
    expect(search("kai’sa")).toEqual(["a"]);
    expect(search("kai'sa")).toEqual(["a"]);
    expect(search("kaisa")).toEqual(["a"]);
  });

  it("treats a query of only removed punctuation as no search", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const result = filterDecks(items, {
      search: "'",
      formats: [],
      formatsExclude: [],
      domainsExclude: [],
      validity: "all",
      domains: [],
      folders: [],
      foldersExclude: [],
    });
    expect(result.map((item) => item.deck.id)).toEqual(["a", "b"]);
  });

  it("filters by format", () => {
    const items = [
      makeItem({ id: "a", format: "constructed" }),
      makeItem({ id: "b", format: "freeform" }),
    ];
    const result = filterDecks(items, {
      search: "",
      formats: ["freeform"],
      formatsExclude: [],
      domainsExclude: [],
      validity: "all",
      domains: [],
      folders: [],
      foldersExclude: [],
    });
    expect(result.map((item) => item.deck.id)).toEqual(["b"]);
  });

  it("matches any of several formats", () => {
    const items = [
      makeItem({ id: "a", format: "constructed" }),
      makeItem({ id: "b", format: "freeform" }),
    ];
    const result = filterDecks(items, {
      search: "",
      formats: ["freeform", "constructed"],
      formatsExclude: [],
      domainsExclude: [],
      validity: "all",
      domains: [],
      folders: [],
      foldersExclude: [],
    });
    expect(result.map((item) => item.deck.id)).toEqual(["a", "b"]);
  });

  it("filters by validity", () => {
    const items = [makeItem({ id: "a", isValid: true }), makeItem({ id: "b", isValid: false })];
    const validOnly = filterDecks(items, {
      search: "",
      formats: [],
      formatsExclude: [],
      domainsExclude: [],
      validity: "valid",
      domains: [],
      folders: [],
      foldersExclude: [],
    });
    expect(validOnly.map((item) => item.deck.id)).toEqual(["a"]);

    const invalidOnly = filterDecks(items, {
      search: "",
      formats: [],
      formatsExclude: [],
      domainsExclude: [],
      validity: "invalid",
      domains: [],
      folders: [],
      foldersExclude: [],
    });
    expect(invalidOnly.map((item) => item.deck.id)).toEqual(["b"]);
  });

  it("filters by draft state", () => {
    const items = [makeItem({ id: "a", isDraft: true }), makeItem({ id: "b" })];
    const withDrafts = (drafts: "all" | "hide" | "only") =>
      filterDecks(items, { ...NO_FILTERS, drafts }).map((item) => item.deck.id);
    expect(withDrafts("all")).toEqual(["a", "b"]);
    expect(withDrafts("only")).toEqual(["a"]);
    expect(withDrafts("hide")).toEqual(["b"]);
  });

  it("treats an absent draft filter as showing both", () => {
    const items = [makeItem({ id: "a", isDraft: true }), makeItem({ id: "b" })];
    const result = filterDecks(items, {
      search: "",
      formats: [],
      formatsExclude: [],
      domainsExclude: [],
      validity: "all",
      domains: [],
      folders: [],
      foldersExclude: [],
    });
    expect(result.map((item) => item.deck.id)).toEqual(["a", "b"]);
  });

  describe("domains", () => {
    const items = [
      makeItem({
        id: "a",
        domains: [
          { domain: "fury", count: 10 },
          { domain: "body", count: 5 },
        ],
      }),
      makeItem({ id: "b", domains: [{ domain: "fury", count: 12 }] }),
      makeItem({ id: "c", domains: [{ domain: "calm", count: 20 }] }),
    ];

    it("takes any deck playing the domain when one is picked", () => {
      const result = filterDecks(items, { ...NO_FILTERS, domains: ["fury"] });
      expect(result.map((item) => item.deck.id)).toEqual(["a", "b"]);
    });

    it("restricts to decks playing nothing outside the set when several are picked", () => {
      const result = filterDecks(items, { ...NO_FILTERS, domains: ["fury", "body"] });
      expect(result.map((item) => item.deck.id)).toEqual(["a", "b"]);

      const furyOnly = filterDecks(items, { ...NO_FILTERS, domains: ["fury", "calm"] });
      expect(furyOnly.map((item) => item.deck.id)).toEqual(["b", "c"]);
    });

    it("measures a deck's identity, not every domain in its list", () => {
      const legendDeck = makeItem({
        id: "legend",
        legendDomains: ["fury"],
        domains: [
          { domain: "fury", count: 20 },
          { domain: "colorless", count: 6 },
        ],
      });
      const result = filterDecks([legendDeck], { ...NO_FILTERS, domains: ["fury", "body"] });
      expect(result.map((item) => item.deck.id)).toEqual(["legend"]);
    });

    it("rejects a deck playing an excluded domain", () => {
      const result = filterDecks(items, { ...NO_FILTERS, domainsExclude: ["fury"] });
      expect(result.map((item) => item.deck.id)).toEqual(["c"]);
    });
  });

  it("rejects a deck in an excluded format", () => {
    const items = [
      makeItem({ id: "a", format: "constructed" }),
      makeItem({ id: "b", format: "freeform" }),
    ];
    const result = filterDecks(items, { ...NO_FILTERS, formatsExclude: ["freeform"] });
    expect(result.map((item) => item.deck.id)).toEqual(["a"]);
  });

  describe("folders", () => {
    const items = [
      makeItem({ id: "a", folderIds: ["f1"] }),
      makeItem({ id: "b", folderIds: ["f2"] }),
      makeItem({ id: "c", folderIds: ["f1", "f2"] }),
      makeItem({ id: "unfiled", folderIds: [] }),
    ];

    it("matches decks in the selected folder", () => {
      const result = filterDecks(items, { ...NO_FILTERS, folders: ["f1"] });
      expect(result.map((item) => item.deck.id)).toEqual(["a", "c"]);
    });

    it("reads several selected folders as a union, not a subset test", () => {
      const result = filterDecks(items, { ...NO_FILTERS, folders: ["f1", "f2"] });
      expect(result.map((item) => item.deck.id)).toEqual(["a", "b", "c"]);
    });

    it("rejects a deck in an excluded folder even when it is also in an included one", () => {
      const result = filterDecks(items, {
        ...NO_FILTERS,
        folders: ["f1"],
        foldersExclude: ["f2"],
      });
      expect(result.map((item) => item.deck.id)).toEqual(["a"]);
    });

    it("keeps unfiled decks when only an exclude is set", () => {
      const result = filterDecks(items, { ...NO_FILTERS, foldersExclude: ["f1"] });
      expect(result.map((item) => item.deck.id)).toEqual(["b", "unfiled"]);
    });

    it("drops unfiled decks when any folder is required", () => {
      const result = filterDecks(items, { ...NO_FILTERS, folders: ["f1", "f2"] });
      expect(result.map((item) => item.deck.id)).not.toContain("unfiled");
    });

    it("returns everything when no folder filter is set", () => {
      const result = filterDecks(items, NO_FILTERS);
      expect(result).toHaveLength(4);
    });
  });

  it("returns everything when no filters are active", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const result = filterDecks(items, {
      search: "  ",
      formats: [],
      formatsExclude: [],
      domainsExclude: [],
      validity: "all",
      domains: [],
      folders: [],
      foldersExclude: [],
    });
    expect(result).toHaveLength(2);
  });
});

describe("partitionByArchived", () => {
  it("hides archived items by default", () => {
    const items = [
      makeItem({ id: "a", archivedAt: null }),
      makeItem({ id: "b", archivedAt: "2026-01-15T00:00:00.000Z" }),
    ];
    expect(partitionByArchived(items, false).map((item) => item.deck.id)).toEqual(["a"]);
  });

  it("includes archived items when showArchived is true", () => {
    const items = [
      makeItem({ id: "a", archivedAt: null }),
      makeItem({ id: "b", archivedAt: "2026-01-15T00:00:00.000Z" }),
    ];
    expect(partitionByArchived(items, true).map((item) => item.deck.id)).toEqual(["a", "b"]);
  });
});

describe("sortDecks", () => {
  it("floats pinned decks above non-pinned regardless of sort field", () => {
    const items = [
      makeItem({ id: "a", name: "Aaa", isPinned: false }),
      makeItem({ id: "b", name: "Bbb", isPinned: true }),
      makeItem({ id: "c", name: "Ccc", isPinned: false }),
    ];
    expect(sortDecks(items, "name", "asc").map((item) => item.deck.id)).toEqual(["b", "a", "c"]);
  });

  it("sinks archived decks to the bottom regardless of sort field", () => {
    const items = [
      makeItem({ id: "a", name: "Aaa", archivedAt: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "b", name: "Bbb", archivedAt: null }),
    ];
    expect(sortDecks(items, "name", "asc").map((item) => item.deck.id)).toEqual(["b", "a"]);
  });

  it("orders by updatedAt descending", () => {
    const items = [
      makeItem({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "b", updatedAt: "2026-04-15T00:00:00.000Z" }),
      makeItem({ id: "c", updatedAt: "2026-02-20T00:00:00.000Z" }),
    ];
    expect(sortDecks(items, "updated", "desc").map((item) => item.deck.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("flips the order when the direction toggles asc<->desc", () => {
    const items = [
      makeItem({ id: "a", name: "Apple" }),
      makeItem({ id: "b", name: "Banana" }),
      makeItem({ id: "c", name: "Cherry" }),
    ];
    expect(sortDecks(items, "name", "asc").map((item) => item.deck.id)).toEqual(["a", "b", "c"]);
    expect(sortDecks(items, "name", "desc").map((item) => item.deck.id)).toEqual(["c", "b", "a"]);
  });

  it("orders by name ascending case-insensitively", () => {
    const items = [
      makeItem({ id: "a", name: "zebra" }),
      makeItem({ id: "b", name: "Apple" }),
      makeItem({ id: "c", name: "mango" }),
    ];
    expect(sortDecks(items, "name", "asc").map((item) => item.deck.id)).toEqual(["b", "c", "a"]);
  });

  it("orders by total value descending and treats null as the lowest", () => {
    const items = [
      makeItem({ id: "a", totalValueCents: 5000 }),
      makeItem({ id: "b", totalValueCents: null }),
      makeItem({ id: "c", totalValueCents: 12_000 }),
    ];
    expect(sortDecks(items, "value", "desc").map((item) => item.deck.id)).toEqual(["c", "a", "b"]);
  });
});

describe("groupDecks", () => {
  it("returns a single bucket when groupBy is none", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const groups = groupDecks(items, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("");
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("groups by format with stable labels", () => {
    const items = [
      makeItem({ id: "a", format: "constructed" }),
      makeItem({ id: "b", format: "freeform" }),
      makeItem({ id: "c", format: "constructed" }),
    ];
    const groups = groupDecks(items, "format");
    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
    expect(byKey.constructed!.items.map((item) => item.deck.id)).toEqual(["a", "c"]);
    expect(byKey.freeform!.items.map((item) => item.deck.id)).toEqual(["b"]);
  });

  it("groups by domain combination using legend domains, sorted alphabetically", () => {
    const items = [
      makeItem({ id: "a", legendDomains: ["fury", "body"] }),
      makeItem({ id: "b", legendDomains: ["body", "fury"] }),
      makeItem({ id: "c", legendDomains: ["calm", "mind"] }),
    ];
    const groups = groupDecks(items, "domains", "asc", {
      domains: { fury: "Fury", body: "Body", calm: "Calm", mind: "Mind" },
    });
    const byLabel = Object.fromEntries(groups.map((group) => [group.label, group]));
    expect(byLabel["Body / Fury"]!.items.map((item) => item.deck.id)).toEqual(["a", "b"]);
    expect(byLabel["Calm / Mind"]!.items.map((item) => item.deck.id)).toEqual(["c"]);
  });

  it("falls back to deck distribution when no legend domains are known, excluding Colorless", () => {
    const items = [
      makeItem({
        id: "a",
        legendDomains: null,
        domains: [
          { domain: "fury", count: 10 },
          { domain: "colorless", count: 6 },
        ],
      }),
      makeItem({ id: "b", legendDomains: null, domains: [] }),
    ];
    const groups = groupDecks(items, "domains");
    expect(groups.map((group) => group.label)).toEqual(["fury", "No domain"]);
  });

  it("uses 'No domain' bucket when legend has only Colorless", () => {
    const items = [makeItem({ id: "a", legendDomains: ["colorless"] })];
    const groups = groupDecks(items, "domains");
    expect(groups.map((group) => group.label)).toEqual(["No domain"]);
  });

  it("groups validity with freeform decks bucketed separately from constructed validity", () => {
    const items = [
      makeItem({ id: "a", format: "constructed", isValid: true }),
      makeItem({ id: "b", format: "constructed", isValid: false }),
      makeItem({ id: "c", format: "freeform" }),
    ];
    const groups = groupDecks(items, "validity");
    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
    expect(byKey["valid:constructed"]!.items.map((item) => item.deck.id)).toEqual(["a"]);
    expect(byKey["invalid:constructed"]!.items.map((item) => item.deck.id)).toEqual(["b"]);
    expect(byKey.freeform!.items.map((item) => item.deck.id)).toEqual(["c"]);
  });

  describe("by folder", () => {
    const FOLDER_LABELS = { f1: "Standard Brews", f2: "Jank", f3: "Retired" };

    it("renders a deck under every folder it is filed in", () => {
      const items = [
        makeItem({ id: "a", folderIds: ["f1", "f2"] }),
        makeItem({ id: "b", folderIds: ["f1"] }),
      ];
      const groups = groupDecks(items, "folder", "asc", { folders: FOLDER_LABELS });
      const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
      expect(byKey["folder:f1"]!.items.map((item) => item.deck.id)).toEqual(["a", "b"]);
      expect(byKey["folder:f2"]!.items.map((item) => item.deck.id)).toEqual(["a"]);
    });

    it("counts a multi-folder deck once per folder, so sections outnumber decks", () => {
      const items = [makeItem({ id: "a", folderIds: ["f1", "f2", "f3"] })];
      const groups = groupDecks(items, "folder", "asc", { folders: FOLDER_LABELS });
      const total = groups.reduce((sum, group) => sum + group.items.length, 0);
      expect(total).toBe(3);
      expect(items).toHaveLength(1);
    });

    it("buckets unfiled decks under 'No folder' and pins it to the end", () => {
      const items = [
        makeItem({ id: "a", folderIds: [] }),
        makeItem({ id: "b", folderIds: ["f2"] }),
      ];
      const groups = groupDecks(items, "folder", "asc", { folders: FOLDER_LABELS });
      expect(groups.at(-1)?.label).toBe("No folder");
      expect(groups.at(-1)?.items.map((item) => item.deck.id)).toEqual(["a"]);
    });

    it("keeps 'No folder' last even when sorting descending", () => {
      const items = [
        makeItem({ id: "a", folderIds: [] }),
        makeItem({ id: "b", folderIds: ["f2"] }),
      ];
      const groups = groupDecks(items, "folder", "desc", { folders: FOLDER_LABELS });
      expect(groups.at(-1)?.label).toBe("No folder");
    });

    it("falls back to the folder id when no label is known", () => {
      const items = [makeItem({ id: "a", folderIds: ["f9"] })];
      const groups = groupDecks(items, "folder", "asc", { folders: FOLDER_LABELS });
      expect(groups[0]!.label).toBe("f9");
    });

    it("produces a single bucket when nothing is filed", () => {
      const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
      const groups = groupDecks(items, "folder", "asc", { folders: FOLDER_LABELS });
      expect(groups).toHaveLength(1);
      expect(groups[0]!.label).toBe("No folder");
    });
  });

  it("buckets decks with no legend under '(No legend)' at the end", () => {
    const items = [
      makeItem({ id: "a", legendName: "Aatrox" }),
      makeItem({ id: "b", legendName: null }),
      makeItem({ id: "c", legendName: "Sett" }),
    ];
    const groups = groupDecks(items, "legend");
    expect(groups.at(-1)?.label).toBe("(No legend)");
  });
});

describe("deckListEnrichment", () => {
  const azir = {
    name: "Emperor of the Sands",
    types: ["legend"],
    tags: ["Azir"],
    domains: ["fury" as Domain],
  };

  it("names a Legend by its champion", () => {
    expect(deckListEnrichment(azir, undefined).legendName).toBe("Azir, Emperor of the Sands");
  });

  it("groups and searches decks under the champion name", () => {
    const item = enrichItem(makeItem(), deckListEnrichment(azir, undefined));
    expect(groupDecks([item], "legend")[0]!.label).toBe("Azir, Emperor of the Sands");
    expect(filterDecks([item], { ...NO_FILTERS, search: "azir" })).toHaveLength(1);
  });

  it("leaves both names unset when neither zone is filled", () => {
    expect(deckListEnrichment(undefined, undefined)).toEqual({
      legendName: null,
      championName: null,
      legendDomains: null,
    });
  });
});

describe("availableDomainsFrom", () => {
  it("returns the union of domains across all decks, sorted", () => {
    const items = [
      makeItem({ domains: [{ domain: "fury", count: 5 }] }),
      makeItem({
        domains: [
          { domain: "body", count: 3 },
          { domain: "fury", count: 2 },
        ],
      }),
      makeItem({ domains: [{ domain: "calm", count: 1 }] }),
    ];
    expect(availableDomainsFrom(items)).toEqual(["body", "calm", "fury"]);
  });

  it("offers a legend deck's identity rather than every domain it splashes", () => {
    const items = [
      makeItem({
        legendDomains: ["fury"],
        domains: [
          { domain: "fury", count: 20 },
          { domain: "colorless", count: 6 },
        ],
      }),
    ];
    expect(availableDomainsFrom(items)).toEqual(["fury"]);
  });

  it("returns an empty array when no decks have domains", () => {
    expect(availableDomainsFrom([makeItem({ domains: [] })])).toEqual([]);
  });
});

describe("filterAvailabilityFrom", () => {
  it("reports no useful filters or groupings when every deck is identical", () => {
    const items = [
      makeItem({ id: "a", format: "constructed", isValid: true, legendName: "Aatrox" }),
      makeItem({ id: "b", format: "constructed", isValid: true, legendName: "Aatrox" }),
    ];
    const availability = filterAvailabilityFrom(items);
    expect(availability.hasMixedFormat).toBe(false);
    expect(availability.hasMixedValidity).toBe(false);
    expect(availability.hasArchived).toBe(false);
    expect(availability.usefulGroupings.size).toBe(0);
  });

  it("flags hasMixedFormat only when both formats are present", () => {
    expect(
      filterAvailabilityFrom([
        makeItem({ id: "a", format: "constructed" }),
        makeItem({ id: "b", format: "freeform" }),
      ]).hasMixedFormat,
    ).toBe(true);
    expect(filterAvailabilityFrom([makeItem({ format: "freeform" })]).hasMixedFormat).toBe(false);
  });

  it("flags hasMixedValidity only when both valid and invalid constructed decks exist", () => {
    const av = filterAvailabilityFrom([
      makeItem({ id: "a", format: "constructed", isValid: true }),
      makeItem({ id: "b", format: "constructed", isValid: false }),
    ]);
    expect(av.hasMixedValidity).toBe(true);

    const freeformOnly = filterAvailabilityFrom([
      makeItem({ id: "a", format: "freeform" }),
      makeItem({ id: "b", format: "freeform" }),
    ]);
    expect(freeformOnly.hasMixedValidity).toBe(false);
  });

  it("flags hasArchived when at least one deck is archived", () => {
    expect(filterAvailabilityFrom([makeItem({ archivedAt: null })]).hasArchived).toBe(false);
    expect(
      filterAvailabilityFrom([
        makeItem({ id: "a", archivedAt: null }),
        makeItem({ id: "b", archivedAt: "2026-01-01T00:00:00.000Z" }),
      ]).hasArchived,
    ).toBe(true);
  });

  it("flags hasDrafts when at least one deck is a draft", () => {
    expect(filterAvailabilityFrom([makeItem({})]).hasDrafts).toBe(false);
    expect(
      filterAvailabilityFrom([makeItem({ id: "a" }), makeItem({ id: "b", isDraft: true })])
        .hasDrafts,
    ).toBe(true);
  });

  it("includes a grouping in usefulGroupings only when it would yield more than one bucket", () => {
    const noneUseful = filterAvailabilityFrom([
      makeItem({ id: "a", legendName: "Aatrox", legendDomains: ["fury"] }),
      makeItem({ id: "b", legendName: "Aatrox", legendDomains: ["fury"] }),
    ]);
    expect([...noneUseful.usefulGroupings]).toEqual([]);

    const mixedLegend = filterAvailabilityFrom([
      makeItem({ id: "a", legendName: "Aatrox", legendDomains: ["fury"] }),
      makeItem({ id: "b", legendName: "Sett", legendDomains: ["fury"] }),
    ]);
    expect(mixedLegend.usefulGroupings.has("legend")).toBe(true);
    expect(mixedLegend.usefulGroupings.has("domains")).toBe(false);

    const mixedDomains = filterAvailabilityFrom([
      makeItem({ id: "a", legendDomains: ["fury", "body"] }),
      makeItem({ id: "b", legendDomains: ["calm", "mind"] }),
    ]);
    expect(mixedDomains.usefulGroupings.has("domains")).toBe(true);
  });

  it("treats folder grouping as useful only once the decks land in different buckets", () => {
    const noFolders = filterAvailabilityFrom([makeItem({ id: "a" }), makeItem({ id: "b" })]);
    expect(noFolders.usefulGroupings.has("folder")).toBe(false);

    const oneFolder = filterAvailabilityFrom([
      makeItem({ id: "a", folderIds: ["f1"] }),
      makeItem({ id: "b", folderIds: ["f1"] }),
    ]);
    expect(oneFolder.usefulGroupings.has("folder")).toBe(false);

    const someFiled = filterAvailabilityFrom([
      makeItem({ id: "a", folderIds: ["f1"] }),
      makeItem({ id: "b", folderIds: [] }),
    ]);
    expect(someFiled.usefulGroupings.has("folder")).toBe(true);
  });
});

describe("filterCountsFrom", () => {
  const decks = [
    makeItem({
      id: "a",
      format: "constructed",
      isValid: true,
      domains: [{ domain: "fury", count: 8 }],
    }),
    makeItem({
      id: "b",
      format: "constructed",
      isValid: false,
      domains: [
        { domain: "fury", count: 4 },
        { domain: "calm", count: 6 },
      ],
    }),
    makeItem({
      id: "c",
      format: "freeform",
      isValid: true,
      domains: [{ domain: "calm", count: 9 }],
    }),
  ];

  it("counts every option when nothing is filtered", () => {
    const counts = filterCountsFrom(decks, NO_FILTERS);
    expect(counts.formats.get("constructed")).toBe(2);
    expect(counts.formats.get("freeform")).toBe(1);
    expect(counts.validity.get("valid")).toBe(2);
    expect(counts.validity.get("invalid")).toBe(1);
    expect(counts.domains.get("fury")).toBe(2);
    expect(counts.domains.get("calm")).toBe(2);
  });

  it("counts each draft choice by what it would leave", () => {
    const mixed = [
      makeItem({ id: "a", isDraft: true }),
      makeItem({ id: "b", isDraft: true }),
      makeItem({ id: "c" }),
    ];
    const counts = filterCountsFrom(mixed, NO_FILTERS);
    expect(counts.drafts.get("only")).toBe(2);
    expect(counts.drafts.get("hide")).toBe(1);
    const picked = filterCountsFrom(mixed, { ...NO_FILTERS, drafts: "only" });
    expect(picked.drafts.get("hide")).toBe(1);
  });

  it("counts a dimension against the other filters, not its own", () => {
    const counts = filterCountsFrom(decks, { ...NO_FILTERS, formats: ["freeform"] });
    expect(counts.formats.get("constructed")).toBe(2);
    expect(counts.formats.get("freeform")).toBe(1);
    expect(counts.validity.get("valid")).toBe(1);
    expect(counts.validity.get("invalid")).toBeUndefined();
  });

  it("narrows the domain counts by the other filters", () => {
    const counts = filterCountsFrom(decks, { ...NO_FILTERS, validity: "invalid" });
    expect(counts.domains.get("fury")).toBe(1);
    expect(counts.domains.get("calm")).toBe(1);
  });

  it("counts domains against the other dimensions, not against itself", () => {
    const counts = filterCountsFrom(decks, { ...NO_FILTERS, domains: ["fury"] });
    expect(counts.domains.get("fury")).toBe(2);
    expect(counts.domains.get("calm")).toBe(2);
  });

  it("applies the search to every dimension", () => {
    const named = [
      makeItem({ id: "a", name: "Fury Aggro", format: "constructed" }),
      makeItem({ id: "b", name: "Calm Control", format: "freeform" }),
    ];
    const counts = filterCountsFrom(named, { ...NO_FILTERS, search: "aggro" });
    expect(counts.formats.get("constructed")).toBe(1);
    expect(counts.formats.get("freeform")).toBeUndefined();
  });

  it("returns empty maps for an empty deck set", () => {
    const counts = filterCountsFrom([], NO_FILTERS);
    expect(counts.formats.size).toBe(0);
    expect(counts.validity.size).toBe(0);
    expect(counts.domains.size).toBe(0);
    expect(counts.folders.size).toBe(0);
  });

  describe("folder counts", () => {
    const filed = [
      makeItem({ id: "a", format: "constructed", folderIds: ["f1"] }),
      makeItem({ id: "b", format: "freeform", folderIds: ["f2"] }),
      makeItem({ id: "c", format: "constructed", folderIds: ["f1", "f2"] }),
    ];

    it("counts a deck under each of its folders", () => {
      const counts = filterCountsFrom(filed, NO_FILTERS);
      expect(counts.folders.get("f1")).toBe(2);
      expect(counts.folders.get("f2")).toBe(2);
    });

    it("counts folders against the other dimensions, not against itself", () => {
      const counts = filterCountsFrom(filed, { ...NO_FILTERS, folders: ["f1"] });
      expect(counts.folders.get("f1")).toBe(2);
      expect(counts.folders.get("f2")).toBe(2);
    });

    it("narrows folder counts by the other filters", () => {
      const counts = filterCountsFrom(filed, { ...NO_FILTERS, formats: ["constructed"] });
      expect(counts.folders.get("f1")).toBe(2);
      expect(counts.folders.get("f2")).toBe(1);
    });

    it("narrows the other dimensions by the folder filter", () => {
      const counts = filterCountsFrom(filed, { ...NO_FILTERS, folders: ["f2"] });
      expect(counts.formats.get("freeform")).toBe(1);
      expect(counts.formats.get("constructed")).toBe(1);
    });
  });
});
