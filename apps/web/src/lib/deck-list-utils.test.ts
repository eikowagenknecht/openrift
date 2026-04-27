import type { DeckListItemResponse, Domain } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { DeckListItemWithNames } from "./deck-list-utils";
import {
  attachNames,
  availableDomainsFrom,
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
  domains?: { domain: Domain; count: number }[];
  legendName?: string | null;
  championName?: string | null;
}

function makeItem(overrides: DeckOverrides = {}): DeckListItemWithNames {
  const base: DeckListItemResponse = {
    deck: {
      id: overrides.id ?? "deck-1",
      name: overrides.name ?? "Test Deck",
      format: overrides.format ?? "constructed",
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
    totalValueCents: overrides.totalValueCents ?? null,
  };
  return attachNames(base, overrides.legendName ?? null, overrides.championName ?? null);
}

describe("filterDecks", () => {
  it("matches search against name, legend, and champion", () => {
    const items = [
      makeItem({ id: "a", name: "Aatrox Aggro", legendName: "Aatrox" }),
      makeItem({ id: "b", name: "Sett Brawl", legendName: "Sett", championName: "Sett" }),
      makeItem({ id: "c", name: "Random", legendName: null, championName: "Aatrox" }),
    ];
    const search = (query: string) =>
      filterDecks(items, { search: query, format: "all", validity: "all", domains: [] }).map(
        (item) => item.deck.id,
      );
    expect(search("aatrox")).toEqual(["a", "c"]);
    expect(search("sett")).toEqual(["b"]);
    expect(search("AGGRO")).toEqual(["a"]);
    expect(search("")).toEqual(["a", "b", "c"]);
  });

  it("filters by format", () => {
    const items = [
      makeItem({ id: "a", format: "constructed" }),
      makeItem({ id: "b", format: "freeform" }),
    ];
    const result = filterDecks(items, {
      search: "",
      format: "freeform",
      validity: "all",
      domains: [],
    });
    expect(result.map((item) => item.deck.id)).toEqual(["b"]);
  });

  it("filters by validity", () => {
    const items = [makeItem({ id: "a", isValid: true }), makeItem({ id: "b", isValid: false })];
    const validOnly = filterDecks(items, {
      search: "",
      format: "all",
      validity: "valid",
      domains: [],
    });
    expect(validOnly.map((item) => item.deck.id)).toEqual(["a"]);

    const invalidOnly = filterDecks(items, {
      search: "",
      format: "all",
      validity: "invalid",
      domains: [],
    });
    expect(invalidOnly.map((item) => item.deck.id)).toEqual(["b"]);
  });

  it("requires all selected domains to be present (intersection)", () => {
    const items = [
      makeItem({
        id: "a",
        domains: [
          { domain: "Fury", count: 10 },
          { domain: "Body", count: 5 },
        ],
      }),
      makeItem({ id: "b", domains: [{ domain: "Fury", count: 12 }] }),
      makeItem({ id: "c", domains: [{ domain: "Calm", count: 20 }] }),
    ];
    const result = filterDecks(items, {
      search: "",
      format: "all",
      validity: "all",
      domains: ["Fury", "Body"],
    });
    expect(result.map((item) => item.deck.id)).toEqual(["a"]);
  });

  it("returns everything when no filters are active", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const result = filterDecks(items, {
      search: "  ",
      format: "all",
      validity: "all",
      domains: [],
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
    expect(sortDecks(items, "name-asc").map((item) => item.deck.id)).toEqual(["b", "a", "c"]);
  });

  it("sinks archived decks to the bottom regardless of sort field", () => {
    const items = [
      makeItem({ id: "a", name: "Aaa", archivedAt: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "b", name: "Bbb", archivedAt: null }),
    ];
    expect(sortDecks(items, "name-asc").map((item) => item.deck.id)).toEqual(["b", "a"]);
  });

  it("orders by updatedAt desc by default", () => {
    const items = [
      makeItem({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "b", updatedAt: "2026-04-15T00:00:00.000Z" }),
      makeItem({ id: "c", updatedAt: "2026-02-20T00:00:00.000Z" }),
    ];
    expect(sortDecks(items, "updated-desc").map((item) => item.deck.id)).toEqual(["b", "c", "a"]);
  });

  it("orders by name ascending case-insensitively", () => {
    const items = [
      makeItem({ id: "a", name: "zebra" }),
      makeItem({ id: "b", name: "Apple" }),
      makeItem({ id: "c", name: "mango" }),
    ];
    expect(sortDecks(items, "name-asc").map((item) => item.deck.id)).toEqual(["b", "c", "a"]);
  });

  it("orders by total value descending and treats null as the lowest", () => {
    const items = [
      makeItem({ id: "a", totalValueCents: 5000 }),
      makeItem({ id: "b", totalValueCents: null }),
      makeItem({ id: "c", totalValueCents: 12_000 }),
    ];
    expect(sortDecks(items, "value-desc").map((item) => item.deck.id)).toEqual(["c", "a", "b"]);
  });
});

describe("groupDecks", () => {
  it("returns a single bucket when groupBy is none", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const groups = groupDecks(items, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("");
    expect(groups[0].items).toHaveLength(2);
  });

  it("groups by format with stable labels", () => {
    const items = [
      makeItem({ id: "a", format: "constructed" }),
      makeItem({ id: "b", format: "freeform" }),
      makeItem({ id: "c", format: "constructed" }),
    ];
    const groups = groupDecks(items, "format");
    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
    expect(byKey.constructed.items.map((item) => item.deck.id)).toEqual(["a", "c"]);
    expect(byKey.freeform.items.map((item) => item.deck.id)).toEqual(["b"]);
  });

  it("groups by primary domain (largest count) with a 'No domain' bucket at the end", () => {
    const items = [
      makeItem({
        id: "a",
        domains: [
          { domain: "Fury", count: 12 },
          { domain: "Body", count: 4 },
        ],
      }),
      makeItem({ id: "b", domains: [{ domain: "Calm", count: 8 }] }),
      makeItem({ id: "c", domains: [] }),
    ];
    const groups = groupDecks(items, "primary-domain");
    expect(groups.map((group) => group.label)).toEqual(["Calm", "Fury", "No domain"]);
  });

  it("groups validity with freeform decks bucketed separately from constructed validity", () => {
    const items = [
      makeItem({ id: "a", format: "constructed", isValid: true }),
      makeItem({ id: "b", format: "constructed", isValid: false }),
      makeItem({ id: "c", format: "freeform" }),
    ];
    const groups = groupDecks(items, "validity");
    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
    expect(byKey.valid.items.map((item) => item.deck.id)).toEqual(["a"]);
    expect(byKey.invalid.items.map((item) => item.deck.id)).toEqual(["b"]);
    expect(byKey.freeform.items.map((item) => item.deck.id)).toEqual(["c"]);
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

describe("availableDomainsFrom", () => {
  it("returns the union of domains across all decks, sorted", () => {
    const items: DeckListItemResponse[] = [
      makeItem({ domains: [{ domain: "Fury", count: 5 }] }),
      makeItem({
        domains: [
          { domain: "Body", count: 3 },
          { domain: "Fury", count: 2 },
        ],
      }),
      makeItem({ domains: [{ domain: "Calm", count: 1 }] }),
    ];
    expect(availableDomainsFrom(items)).toEqual(["Body", "Calm", "Fury"]);
  });

  it("returns an empty array when no decks have domains", () => {
    expect(availableDomainsFrom([makeItem({ domains: [] })])).toEqual([]);
  });
});
