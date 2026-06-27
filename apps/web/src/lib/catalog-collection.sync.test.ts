// End-to-end client-side catalog sync pipeline: real Electric collections fed
// by a mocked shape protocol, reassembled by `assembleCatalogStaticParts` +
// `enrichCatalog` into the same `UseCardsResult` the edge-fetch path produces.
// Guards the 15 public catalog shapes → raw collections → enriched result chain
// (canonicalRank ride-through, marker resolution, set-slug join, image build,
// custom-tag join), parking live polls so the test only needs the initial
// snapshot.
import { SingleProcessCoordinator } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCatalogStoreForTesting, resetCatalogCollectionForTesting } from "./catalog-collection";

function createFakePersistence(): PersistedCollectionPersistence {
  const adapter = {
    loadSubset: vi.fn().mockResolvedValue([]),
    applyCommittedTx: vi.fn().mockResolvedValue(undefined),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    loadCollectionMetadata: vi.fn().mockResolvedValue([]),
  };
  return {
    adapter,
    coordinator: new SingleProcessCoordinator(),
  } as unknown as PersistedCollectionPersistence;
}

const originalFetch = globalThis.fetch;

function shapeResponse(
  messages: unknown[],
  { handle, offset }: { handle: string; offset: string },
) {
  const body = [...messages, { headers: { control: "up-to-date" } }];
  return Response.json(body, {
    status: 200,
    headers: {
      "electric-handle": handle,
      "electric-offset": offset,
      "electric-schema": JSON.stringify({}),
      "electric-up-to-date": "true",
    },
  });
}

function insert(table: string, key: string, value: Record<string, unknown>) {
  return {
    key: `"public"."${table}"/"${key}"`,
    value,
    headers: { relation: ["public", table], operation: "insert" },
  };
}

// One insert page per shape endpoint, keyed by the URL path suffix.
const SHAPE_ROWS: Record<string, { table: string; rows: ReturnType<typeof insert>[] }> = {
  "/public-shapes/cards": {
    table: "cards",
    rows: [
      insert("cards", "card-1", {
        id: "card-1",
        slug: "RB1-001",
        name: "Card One",
        type: "unit",
        might: 3,
        energy: 2,
        power: 1,
        might_bonus: 0,
        keywords: ["deflect"],
        tags: [],
        comment: null,
      }),
    ],
  },
  "/public-shapes/card-domains": {
    table: "card_domains",
    rows: [
      insert("card_domains", "card-1:fury", {
        card_id: "card-1",
        domain_slug: "fury",
        ordinal: 1,
      }),
      insert("card_domains", "card-1:calm", {
        card_id: "card-1",
        domain_slug: "calm",
        ordinal: 0,
      }),
    ],
  },
  "/public-shapes/card-super-types": {
    table: "card_super_types",
    rows: [
      insert("card_super_types", "card-1:champion", {
        card_id: "card-1",
        super_type_slug: "champion",
      }),
    ],
  },
  "/public-shapes/printings": {
    table: "printings",
    rows: [
      insert("printings", "printing-1", {
        id: "printing-1",
        card_id: "card-1",
        set_id: "set-1",
        short_code: "RB1-001",
        rarity: "common",
        art_variant: "normal",
        is_signed: false,
        finish: "normal",
        artist: "Artist",
        public_code: "rb1-001",
        printed_rules_text: null,
        printed_effect_text: null,
        flavor_text: null,
        printed_name: null,
        printed_year: 2025,
        language: "EN",
        marker_slugs: ["first-edition"],
        comment: null,
        canonical_rank: 42,
      }),
    ],
  },
  "/public-shapes/sets": {
    table: "sets",
    rows: [
      insert("sets", "set-1", {
        id: "set-1",
        slug: "RB1",
        name: "First Set",
        released_at: "2025-01-01",
        released: true,
        set_type: "main",
      }),
    ],
  },
  "/public-shapes/printing-images": {
    table: "printing_images",
    rows: [
      insert("printing_images", "img-1", {
        id: "img-1",
        printing_id: "printing-1",
        face: "front",
        image_file_id: "file-1",
        is_active: true,
      }),
      // Inactive image — must be filtered out.
      insert("printing_images", "img-2", {
        id: "img-2",
        printing_id: "printing-1",
        face: "back",
        image_file_id: "file-2",
        is_active: false,
      }),
      // Active but its file has no rehosted URL — must be filtered out.
      insert("printing_images", "img-3", {
        id: "img-3",
        printing_id: "printing-1",
        face: "back",
        image_file_id: "file-3",
        is_active: true,
      }),
    ],
  },
  "/public-shapes/image-files": {
    table: "image_files",
    rows: [
      insert("image_files", "file-1", { id: "file-1", rehosted_url: "https://cdn/file-1.png" }),
      insert("image_files", "file-2", { id: "file-2", rehosted_url: "https://cdn/file-2.png" }),
      insert("image_files", "file-3", { id: "file-3", rehosted_url: null }),
    ],
  },
  "/public-shapes/markers": {
    table: "markers",
    rows: [
      insert("markers", "marker-1", {
        id: "marker-1",
        slug: "first-edition",
        label: "First Edition",
        description: null,
        sort_order: 0,
      }),
    ],
  },
  "/public-shapes/distribution-channels": {
    table: "distribution_channels",
    rows: [
      insert("distribution_channels", "chan-root", {
        id: "chan-root",
        slug: "events",
        label: "Events",
        description: null,
        kind: "event",
        parent_id: null,
        children_label: null,
        sort_order: 0,
      }),
      insert("distribution_channels", "chan-1", {
        id: "chan-1",
        slug: "worlds",
        label: "Worlds",
        description: null,
        kind: "event",
        parent_id: "chan-root",
        children_label: null,
        sort_order: 0,
      }),
    ],
  },
  "/public-shapes/printing-distribution-channels": {
    table: "printing_distribution_channels",
    rows: [
      insert("printing_distribution_channels", "printing-1:chan-1", {
        printing_id: "printing-1",
        channel_id: "chan-1",
        distribution_note: "Top 8 prize",
      }),
    ],
  },
  "/public-shapes/card-errata": {
    table: "card_errata",
    rows: [],
  },
  "/public-shapes/card-bans": {
    table: "card_bans",
    rows: [
      insert("card_bans", "card-1:standard:2025-02-01", {
        card_id: "card-1",
        format_id: "standard",
        banned_at: "2025-02-01",
        unbanned_at: null,
        reason: "too strong",
      }),
      // Already unbanned — must be filtered out.
      insert("card_bans", "card-1:legacy:2025-01-01", {
        card_id: "card-1",
        format_id: "legacy",
        banned_at: "2025-01-01",
        unbanned_at: "2025-03-01",
        reason: null,
      }),
    ],
  },
  "/public-shapes/formats": {
    table: "formats",
    rows: [insert("formats", "standard", { id: "standard", name: "Standard" })],
  },
  "/public-shapes/card-custom-tags": {
    table: "card_custom_tags",
    rows: [
      insert("card_custom_tags", "card-1:tag-1", { card_id: "card-1", custom_tag_id: "tag-1" }),
    ],
  },
  "/public-shapes/custom-tags": {
    table: "custom_tags",
    rows: [insert("custom_tags", "tag-1", { id: "tag-1", slug: "region-locked" })],
  },
};

function mockShapeFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const offset = url.searchParams.get("offset");
    const live = url.searchParams.get("live");

    if (live === "true") {
      // Park live polls forever — the test only needs the initial snapshot.
      // oxlint-disable-next-line promise/avoid-new -- a never-settling promise is the point
      return new Promise<Response>(() => {});
    }

    const match = Object.entries(SHAPE_ROWS).find(([suffix]) => url.pathname.endsWith(suffix));
    if (match && offset === "-1") {
      const [suffix, { rows }] = match;
      return shapeResponse(rows, { handle: `${suffix}-h1`, offset: `0_${rows.length}` });
    }
    // Any non-initial offset (or unknown shape): an empty up-to-date page.
    return shapeResponse([], { handle: "h-any", offset: String(offset) });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetCatalogCollectionForTesting();
});

describe("catalog fed by mocked Electric shapes", () => {
  it("derives an enriched UseCardsResult with joins and resolutions applied", async () => {
    mockShapeFetch();
    const store = getCatalogStoreForTesting(createFakePersistence());

    await vi.waitFor(() => expect(store.isReady()).toBe(true), { timeout: 5000 });

    const result = store.derive();

    // One printing, joined to its set slug and card.
    expect(result.allPrintings).toHaveLength(1);
    const printing = result.allPrintings[0];
    expect(printing.id).toBe("printing-1");
    expect(printing.cardId).toBe("card-1");
    expect(printing.setSlug).toBe("RB1");
    expect(printing.card.name).toBe("Card One");

    // canonicalRank rides through from the synced row.
    expect(printing.canonicalRank).toBe(42);

    // Markers resolved from marker_slugs against the markers vocabulary.
    expect(printing.markers).toEqual([
      { id: "marker-1", slug: "first-edition", label: "First Edition", description: null },
    ]);

    // Only the active image whose file has a rehosted URL survives.
    expect(printing.images).toEqual([{ face: "front", imageId: "file-1" }]);

    // Distribution channel joined, with the ancestor label chain resolved.
    expect(printing.distributionChannels).toHaveLength(1);
    expect(printing.distributionChannels[0].channel.slug).toBe("worlds");
    expect(printing.distributionChannels[0].ancestorLabels).toEqual(["Events"]);
    expect(printing.distributionChannels[0].distributionNote).toBe("Top 8 prize");

    // Card aggregates: domains ordered by ordinal, super-types collected, bans
    // resolved to the active one with its format display name.
    const card = result.cardsById["card-1"];
    expect(card.domains).toEqual(["calm", "fury"]);
    expect(card.superTypes).toEqual(["champion"]);
    expect(card.bans).toEqual([
      {
        formatId: "standard",
        formatName: "Standard",
        bannedAt: "2025-02-01",
        reason: "too strong",
      },
    ]);

    // Sets exposed with the set-info shape.
    expect(result.sets).toEqual([
      {
        id: "set-1",
        slug: "RB1",
        name: "First Set",
        releasedAt: "2025-01-01",
        released: true,
        setType: "main",
      },
    ]);

    // printingsByCardId / printingsById round out the result.
    expect(result.printingsById["printing-1"]?.id).toBe("printing-1");
    expect(result.printingsByCardId.get("card-1")).toHaveLength(1);
  });

  it("is not ready until every shape has synced", async () => {
    // Only the cards shape resolves; everything else parks (returns a
    // never-settling promise) so readiness must stay false.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const offset = url.searchParams.get("offset");
      const live = url.searchParams.get("live");
      if (live === "true" || !url.pathname.endsWith("/public-shapes/cards")) {
        // oxlint-disable-next-line promise/avoid-new -- a never-settling promise is the point
        return new Promise<Response>(() => {});
      }
      if (offset === "-1") {
        return shapeResponse(SHAPE_ROWS["/public-shapes/cards"].rows, {
          handle: "cards-h1",
          offset: "0_1",
        });
      }
      return shapeResponse([], { handle: "h-any", offset: String(offset) });
    }) as typeof fetch;

    const store = getCatalogStoreForTesting(createFakePersistence());
    // Give the one resolvable shape time to settle; the store must still be
    // not-ready because the other 14 are parked.
    await vi.waitFor(
      () =>
        expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1),
      { timeout: 5000 },
    );
    expect(store.isReady()).toBe(false);
  });
});
