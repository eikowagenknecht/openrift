// Public card-catalog sync (ADR-027 catalog vertical, WEB half).
//
// The card catalog is public, read-only, and identical for every visitor, so
// it is synced through 16 single-table Electric shapes (no `where` clause, no
// per-user params) and reassembled client-side into the same `UseCardsResult`
// the edge-fetch path produces. Once the shapes are synced, `useCards` reads
// from here and never touches the network again on return visits — the local
// SQLite cache rehydrates instantly and the shapes only stream deltas when the
// catalog actually changes (sets/cards/printings shipping, weeks apart).
//
// This is a READ-ONLY vertical: no writes, no offline executor, no txid. The
// collections carry no onInsert/onUpdate/onDelete and there is nothing to queue.
//
// GLOBAL singleton — unlike the per-user copies/collections/lists/decks cache,
// the catalog is the same for every visitor and signed-out users see it too.
// It is therefore created exactly once per page (module-level), not keyed by
// (queryClient, userId). It still shares the one OPFS database, the one
// persistence coordinator, and the one PERSISTED_SCHEMA_VERSION as every other
// persisted collection — diverging the version silently cross-wipes the other
// verticals' rows (see the long comment in copies-collection.ts).
//
// Derivation strategy: the catalog changes rarely, so rather than wiring a
// 16-way differential live-query join we recompute the enriched
// `UseCardsResult` from plain collection snapshots, memoized on a version key
// that bumps whenever any shape emits a change. The recompute is cheap relative
// to how often it runs (essentially once, after the initial sync settles).

import type { CatalogResponse, Domain, SuperType } from "@openrift/shared";
import type {
  CatalogBanRowInput,
  CatalogCardRowInput,
  CatalogChannelLinkRowInput,
  CatalogChannelRowInput,
  CatalogCustomTagAssignmentRowInput,
  CatalogErrataRowInput,
  CatalogImageRowInput,
  CatalogMarkerRowInput,
  CatalogPrintingRowInput,
  CatalogSetRowInput,
} from "@openrift/shared/catalog-assembly";
import { assembleCatalogStaticParts } from "@openrift/shared/catalog-assembly";
import { persistedCollectionOptions } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { ElectricCollectionUtils } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import type { Collection } from "@tanstack/react-db";
import { useSyncExternalStore } from "react";

import { useHydrated } from "@/hooks/use-hydrated";
import { enrichCatalog } from "@/lib/catalog-query";
import type { UseCardsResult } from "@/lib/catalog-query";
import { PERSISTED_SCHEMA_VERSION } from "@/lib/copies-collection";
import { usePersistence } from "@/lib/db-persistence";
import { electricShapeOrigin } from "@/lib/electric-origin";

// ── Raw shape rows ───────────────────────────────────────────────────────────
//
// Each mirrors the columns the public proxy pins (see
// apps/api/src/routes/public/public-shapes.ts). Type aliases, not interfaces:
// the Electric adapter's `T extends Row<unknown>` constraint needs the implicit
// index signature interfaces don't get.
// oxlint-disable typescript/consistent-type-definitions -- see above

type CatalogCardShapeRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  might: number | null;
  energy: number | null;
  power: number | null;
  might_bonus: number | null;
  keywords: string[];
  tags: string[];
  comment: string | null;
};

type CatalogCardDomainShapeRow = {
  card_id: string;
  domain_slug: string;
  ordinal: number;
};

type CatalogCardSuperTypeShapeRow = {
  card_id: string;
  super_type_slug: string;
};

type CatalogCardTypeShapeRow = {
  card_id: string;
  type_slug: string;
  position: number;
};

type CatalogPrintingShapeRow = {
  id: string;
  card_id: string;
  set_id: string;
  short_code: string;
  rarity: string;
  art_variant: string;
  is_signed: boolean;
  finish: string;
  size: string;
  artist: string;
  public_code: string;
  printed_rules_text: string | null;
  printed_effect_text: string | null;
  flavor_text: string | null;
  printed_name: string | null;
  printed_year: number | null;
  language: string;
  marker_slugs: string[];
  comment: string | null;
  canonical_rank: number;
};

type CatalogSetShapeRow = {
  id: string;
  slug: string;
  name: string;
  released_at: string | null;
  released: boolean;
  set_type: "main" | "supplemental";
};

type CatalogPrintingImageShapeRow = {
  id: string;
  printing_id: string;
  face: "front" | "back";
  image_file_id: string;
  is_active: boolean;
};

type CatalogImageFileShapeRow = {
  id: string;
  rehosted_url: string | null;
};

type CatalogMarkerShapeRow = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sort_order: number;
};

type CatalogDistributionChannelShapeRow = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  kind: "event" | "product";
  parent_id: string | null;
  children_label: string | null;
  sort_order: number;
};

type CatalogPrintingDistributionChannelShapeRow = {
  printing_id: string;
  channel_id: string;
  distribution_note: string | null;
};

type CatalogErrataShapeRow = {
  id: string;
  card_id: string;
  corrected_rules_text: string | null;
  corrected_effect_text: string | null;
  source: string;
  source_url: string | null;
  effective_date: string | null;
};

type CatalogBanShapeRow = {
  id: string;
  card_id: string;
  format_id: string;
  banned_at: string;
  unbanned_at: string | null;
  reason: string | null;
};

type CatalogFormatShapeRow = {
  id: string;
  name: string;
};

type CatalogCardCustomTagShapeRow = {
  card_id: string;
  custom_tag_id: string;
};

type CatalogCustomTagShapeRow = {
  id: string;
  slug: string;
};
// oxlint-enable typescript/consistent-type-definitions

// Any of the 16 catalog shape collections (the row types differ, but the
// readiness / version machinery treats them uniformly).
type AnyCatalogCollection = Collection<Record<string, unknown>, string | number>;

interface CatalogCollections {
  cards: Collection<CatalogCardShapeRow, string | number>;
  cardDomains: Collection<CatalogCardDomainShapeRow, string | number>;
  cardSuperTypes: Collection<CatalogCardSuperTypeShapeRow, string | number>;
  cardCardTypes: Collection<CatalogCardTypeShapeRow, string | number>;
  printings: Collection<CatalogPrintingShapeRow, string | number>;
  sets: Collection<CatalogSetShapeRow, string | number>;
  printingImages: Collection<CatalogPrintingImageShapeRow, string | number>;
  imageFiles: Collection<CatalogImageFileShapeRow, string | number>;
  markers: Collection<CatalogMarkerShapeRow, string | number>;
  distributionChannels: Collection<CatalogDistributionChannelShapeRow, string | number>;
  printingDistributionChannels: Collection<
    CatalogPrintingDistributionChannelShapeRow,
    string | number
  >;
  cardErrata: Collection<CatalogErrataShapeRow, string | number>;
  cardBans: Collection<CatalogBanShapeRow, string | number>;
  formats: Collection<CatalogFormatShapeRow, string | number>;
  cardCustomTags: Collection<CatalogCardCustomTagShapeRow, string | number>;
  customTags: Collection<CatalogCustomTagShapeRow, string | number>;
}

interface CatalogStoreEntry {
  collections: CatalogCollections;
  /** All 16 collections as a flat array, for uniform iteration. */
  all: AnyCatalogCollection[];
  /**
   * Monotonic version, bumped on every change emitted by any collection.
   * Subscribers re-read; the derivation cache keys on it.
   */
  version: number;
  listeners: Set<() => void>;
  unsubscribes: (() => void)[];
  /** Memoized enrichment: { version, result }. Recomputed when version moves. */
  derived: { version: number; result: UseCardsResult } | null;
}

/**
 * Build one persisted (or plain, when persistence is unavailable) Electric
 * collection for a public catalog shape. Mirrors the helper pattern in
 * copies-collection.ts: the schema version is part of the URL so a bump
 * invalidates the cached rows AND the Electric resume point together; and the
 * persisted variant pins `schemaVersion` to the SAME shared constant.
 *
 * @returns The collection for `<endpoint>`.
 */
function createCatalogShapeCollection<TRow extends Record<string, unknown>>(
  endpoint: string,
  getKey: (row: TRow) => string,
  persistence: PersistedCollectionPersistence | null | undefined,
): Collection<TRow, string | number> {
  const electricOptions = electricCollectionOptions<TRow>({
    id: `catalog:${endpoint}`,
    shapeOptions: {
      // Public, unauthenticated, CDN-cacheable. Schema version in the URL for
      // the same resume-point-invalidation reason as the copies shape.
      url: `${electricShapeOrigin()}/api/v1/public-shapes/${endpoint}?v=${PERSISTED_SCHEMA_VERSION}`,
      // Catch up, then STOP — no standing live long-poll. The catalog changes
      // weeks apart, but a live catalog costs 16 held connections per visitor
      // at every hop (browser where HTTP/1.1 applies, host nginx, proxy
      // nginx, the Bun API proxying each stream, Electric itself) — the
      // connection-saturation that got ADR-027 pulled from main. With
      // subscribe: false the shapes sync to head on page load (a cheap 204
      // when nothing changed, thanks to the persisted resume point) and hold
      // nothing open; freshness becomes per-page-load, which for this catalog
      // is indistinguishable from live. The 5 per-user shapes stay live.
      subscribe: false,
    },
    getKey,
    // No onInsert/onUpdate/onDelete — the catalog is read-only.
  });
  return persistence
    ? (createCollection(
        persistedCollectionOptions<TRow, string | number, never, ElectricCollectionUtils<TRow>>({
          ...electricOptions,
          persistence,
          schemaVersion: PERSISTED_SCHEMA_VERSION,
        }),
      ) as unknown as Collection<TRow, string | number>)
    : createCollection(electricOptions);
}

function createCollections(
  persistence: PersistedCollectionPersistence | null | undefined,
): CatalogCollections {
  return {
    cards: createCatalogShapeCollection<CatalogCardShapeRow>("cards", (row) => row.id, persistence),
    cardDomains: createCatalogShapeCollection<CatalogCardDomainShapeRow>(
      "card-domains",
      (row) => `${row.card_id}:${row.domain_slug}`,
      persistence,
    ),
    cardSuperTypes: createCatalogShapeCollection<CatalogCardSuperTypeShapeRow>(
      "card-super-types",
      (row) => `${row.card_id}:${row.super_type_slug}`,
      persistence,
    ),
    cardCardTypes: createCatalogShapeCollection<CatalogCardTypeShapeRow>(
      "card-card-types",
      (row) => `${row.card_id}:${row.type_slug}`,
      persistence,
    ),
    printings: createCatalogShapeCollection<CatalogPrintingShapeRow>(
      "printings",
      (row) => row.id,
      persistence,
    ),
    sets: createCatalogShapeCollection<CatalogSetShapeRow>("sets", (row) => row.id, persistence),
    printingImages: createCatalogShapeCollection<CatalogPrintingImageShapeRow>(
      "printing-images",
      (row) => row.id,
      persistence,
    ),
    imageFiles: createCatalogShapeCollection<CatalogImageFileShapeRow>(
      "image-files",
      (row) => row.id,
      persistence,
    ),
    markers: createCatalogShapeCollection<CatalogMarkerShapeRow>(
      "markers",
      (row) => row.id,
      persistence,
    ),
    distributionChannels: createCatalogShapeCollection<CatalogDistributionChannelShapeRow>(
      "distribution-channels",
      (row) => row.id,
      persistence,
    ),
    printingDistributionChannels:
      createCatalogShapeCollection<CatalogPrintingDistributionChannelShapeRow>(
        "printing-distribution-channels",
        (row) => `${row.printing_id}:${row.channel_id}`,
        persistence,
      ),
    cardErrata: createCatalogShapeCollection<CatalogErrataShapeRow>(
      "card-errata",
      (row) => row.id,
      persistence,
    ),
    cardBans: createCatalogShapeCollection<CatalogBanShapeRow>(
      "card-bans",
      (row) => row.id,
      persistence,
    ),
    formats: createCatalogShapeCollection<CatalogFormatShapeRow>(
      "formats",
      (row) => row.id,
      persistence,
    ),
    cardCustomTags: createCatalogShapeCollection<CatalogCardCustomTagShapeRow>(
      "card-custom-tags",
      (row) => `${row.card_id}:${row.custom_tag_id}`,
      persistence,
    ),
    customTags: createCatalogShapeCollection<CatalogCustomTagShapeRow>(
      "custom-tags",
      (row) => row.id,
      persistence,
    ),
  };
}

// Stable no-op for the server-side `useSyncExternalStore` unsubscribe.
// oxlint-disable-next-line no-empty-function -- intentional no-op unsubscribe
const noop = (): void => {};

let entry: CatalogStoreEntry | null = null;
let entryHasPersistence = false;

/**
 * The global catalog store. Created once per page; if it was first created
 * before persistence settled (e.g. an early signed-out read), it is recreated
 * once persistence resolves so the rows persist to OPFS. Identity is otherwise
 * stable for the lifetime of the page.
 *
 * @returns The catalog store entry.
 */
function getEntry(
  persistence: PersistedCollectionPersistence | null | undefined,
): CatalogStoreEntry {
  // Recreate only to upgrade from no-persistence to persistence (the common
  // case: the first read happens before db-persistence has settled). Never
  // recreate once we already have a persistence handle.
  if (entry && entryHasPersistence) {
    return entry;
  }
  if (entry && !persistence) {
    return entry;
  }
  if (entry) {
    // Upgrade path: tear down the in-memory entry and rebuild persisted.
    for (const unsubscribe of entry.unsubscribes) {
      unsubscribe();
    }
  }

  const collections = createCollections(persistence);
  const all: AnyCatalogCollection[] = [
    collections.cards as unknown as AnyCatalogCollection,
    collections.cardDomains as unknown as AnyCatalogCollection,
    collections.cardSuperTypes as unknown as AnyCatalogCollection,
    collections.cardCardTypes as unknown as AnyCatalogCollection,
    collections.printings as unknown as AnyCatalogCollection,
    collections.sets as unknown as AnyCatalogCollection,
    collections.printingImages as unknown as AnyCatalogCollection,
    collections.imageFiles as unknown as AnyCatalogCollection,
    collections.markers as unknown as AnyCatalogCollection,
    collections.distributionChannels as unknown as AnyCatalogCollection,
    collections.printingDistributionChannels as unknown as AnyCatalogCollection,
    collections.cardErrata as unknown as AnyCatalogCollection,
    collections.cardBans as unknown as AnyCatalogCollection,
    collections.formats as unknown as AnyCatalogCollection,
    collections.cardCustomTags as unknown as AnyCatalogCollection,
    collections.customTags as unknown as AnyCatalogCollection,
  ];

  const created: CatalogStoreEntry = {
    collections,
    all,
    version: 0,
    listeners: new Set(),
    unsubscribes: [],
    derived: null,
  };

  const notify = () => {
    created.version += 1;
    for (const listener of created.listeners) {
      listener();
    }
  };
  for (const collection of all) {
    // `includeInitialState: false` (default) — we only need to know that the
    // snapshot moved; the data is read in bulk via `.toArray` on recompute.
    const subscription = collection.subscribeChanges(notify);
    created.unsubscribes.push(() => subscription.unsubscribe());
  }

  entry = created;
  entryHasPersistence = Boolean(persistence);

  if (import.meta.env.DEV) {
    registerSyncDebug(created);
  }

  return created;
}

function registerSyncDebug(store: CatalogStoreEntry): void {
  const existing = (globalThis as Record<string, unknown>).__openriftSyncDebug as
    | Record<string, unknown>
    | undefined;
  const catalogSummary = () =>
    Object.fromEntries(
      store.all.map((collection) => [
        collection.id,
        { size: collection.size, status: collection.status },
      ]),
    );
  if (existing) {
    // Augment the copies-collection debug hook rather than clobbering it.
    const baseSummary = existing.summary as (() => Record<string, unknown>) | undefined;
    existing.catalog = store.collections;
    existing.summary = () => ({ ...(baseSummary ? baseSummary() : {}), catalog: catalogSummary() });
  } else {
    (globalThis as Record<string, unknown>).__openriftSyncDebug = {
      catalog: store.collections,
      summary: () => ({ catalog: catalogSummary() }),
    };
  }
}

/**
 * Whether all 16 catalog shapes have finished their initial sync — i.e. the
 * derived `UseCardsResult` is trustworthy. `useCards` only switches to the
 * synced path once this is true.
 *
 * @returns True when every catalog collection is ready.
 */
function isEntryReady(store: CatalogStoreEntry): boolean {
  return store.all.every((collection) => collection.isReady());
}

/**
 * Reconstruct the static `CatalogResponse` parts from the synced collections
 * and enrich them into a `UseCardsResult`, identical to the edge-fetch path's
 * output. Memoized on the store version so it recomputes only when a shape
 * actually changes — essentially once, after the initial sync settles.
 *
 * @returns The derived `UseCardsResult`.
 */
function deriveCardsResult(store: CatalogStoreEntry): UseCardsResult {
  if (store.derived && store.derived.version === store.version) {
    return store.derived.result;
  }

  const collections = store.collections;

  // Aggregate per-card domains (ordered by ordinal) and super-types from the
  // base tables, replacing the server's mv_card_aggregates which can't be a
  // shape.
  const domainsByCard = new Map<string, CatalogCardDomainShapeRow[]>();
  for (const row of collections.cardDomains.toArray) {
    const existing = domainsByCard.get(row.card_id);
    if (existing) {
      existing.push(row);
    } else {
      domainsByCard.set(row.card_id, [row]);
    }
  }
  const superTypesByCard = new Map<string, SuperType[]>();
  for (const row of collections.cardSuperTypes.toArray) {
    const existing = superTypesByCard.get(row.card_id);
    if (existing) {
      existing.push(row.super_type_slug);
    } else {
      superTypesByCard.set(row.card_id, [row.super_type_slug]);
    }
  }
  // Ordered multi-type list (ADR-037), position 0 first. Falls back to the
  // card's own `type` column for a card whose junction rows haven't synced
  // yet — `types` is contractually non-empty and position 0 mirrors `type`.
  const typesByCard = new Map<string, CatalogCardTypeShapeRow[]>();
  for (const row of collections.cardCardTypes.toArray) {
    const existing = typesByCard.get(row.card_id);
    if (existing) {
      existing.push(row);
    } else {
      typesByCard.set(row.card_id, [row]);
    }
  }

  const cardRows: CatalogCardRowInput[] = collections.cards.toArray.map((row) => {
    const typeRows = typesByCard.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      type: row.type,
      types: typeRows?.length
        ? typeRows.toSorted((a, b) => a.position - b.position).map((typeRow) => typeRow.type_slug)
        : [row.type],
      might: row.might,
      energy: row.energy,
      power: row.power,
      mightBonus: row.might_bonus,
      keywords: row.keywords,
      tags: row.tags,
      domains: (domainsByCard.get(row.id) ?? [])
        .toSorted((a, b) => a.ordinal - b.ordinal)
        .map((domainRow): Domain => domainRow.domain_slug),
      superTypes: superTypesByCard.get(row.id) ?? [],
    };
  });

  const setRows: CatalogSetRowInput[] = collections.sets.toArray.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    releasedAt: row.released_at,
    released: row.released,
    setType: row.set_type,
  }));

  const printingRows: CatalogPrintingRowInput[] = collections.printings.toArray.map((row) => ({
    id: row.id,
    cardId: row.card_id,
    setId: row.set_id,
    shortCode: row.short_code,
    rarity: row.rarity,
    artVariant: row.art_variant,
    isSigned: row.is_signed,
    finish: row.finish,
    size: row.size,
    artist: row.artist,
    publicCode: row.public_code,
    printedRulesText: row.printed_rules_text,
    printedEffectText: row.printed_effect_text,
    flavorText: row.flavor_text,
    printedName: row.printed_name,
    printedYear: row.printed_year,
    language: row.language,
    markerSlugs: row.marker_slugs,
    comment: row.comment,
    canonicalRank: row.canonical_rank,
  }));

  // Images: keep an active printing image only once its file has a rehosted
  // URL (matches the server's `imageId IS NOT NULL` filter). The resolved
  // `imageId` is the image_files.id, which the client turns into URLs.
  const rehostedFileIds = new Set<string>();
  for (const file of collections.imageFiles.toArray) {
    if (file.rehosted_url !== null) {
      rehostedFileIds.add(file.id);
    }
  }
  const imageRows: CatalogImageRowInput[] = collections.printingImages.toArray
    .filter((row) => row.is_active && rehostedFileIds.has(row.image_file_id))
    .map((row) => ({
      printingId: row.printing_id,
      face: row.face,
      imageId: row.image_file_id,
    }));

  // Bans: keep only active (not yet unbanned), resolve format display name.
  const formatNameById = new Map(collections.formats.toArray.map((row) => [row.id, row.name]));
  const banRows: CatalogBanRowInput[] = collections.cardBans.toArray
    .filter((row) => row.unbanned_at === null)
    .map((row) => ({
      cardId: row.card_id,
      formatId: row.format_id,
      formatName: formatNameById.get(row.format_id) ?? row.format_id,
      bannedAt: row.banned_at,
      reason: row.reason,
    }));

  const errataRows: CatalogErrataRowInput[] = collections.cardErrata.toArray.map((row) => ({
    cardId: row.card_id,
    correctedRulesText: row.corrected_rules_text,
    correctedEffectText: row.corrected_effect_text,
    source: row.source,
    sourceUrl: row.source_url,
    effectiveDate: row.effective_date,
  }));

  const markerRows: CatalogMarkerRowInput[] = collections.markers.toArray.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description,
  }));

  const allChannels: CatalogChannelRowInput[] = collections.distributionChannels.toArray.map(
    (row) => ({
      id: row.id,
      slug: row.slug,
      label: row.label,
      description: row.description,
      kind: row.kind,
      parentId: row.parent_id,
      childrenLabel: row.children_label,
    }),
  );

  // Printing → channel links, joined to the channel columns the assembly needs.
  const channelById = new Map(collections.distributionChannels.toArray.map((row) => [row.id, row]));
  const channelLinkRows: CatalogChannelLinkRowInput[] = [];
  for (const link of collections.printingDistributionChannels.toArray) {
    const channel = channelById.get(link.channel_id);
    if (!channel) {
      continue;
    }
    channelLinkRows.push({
      printingId: link.printing_id,
      channelId: channel.id,
      channelSlug: channel.slug,
      channelLabel: channel.label,
      channelDescription: channel.description,
      channelKind: channel.kind,
      channelParentId: channel.parent_id,
      channelChildrenLabel: channel.children_label,
      distributionNote: link.distribution_note,
    });
  }

  // Custom-tag assignments, joined to the tag slug.
  const tagSlugById = new Map(collections.customTags.toArray.map((row) => [row.id, row.slug]));
  const customTagAssignmentRows: CatalogCustomTagAssignmentRowInput[] = [];
  for (const assignment of collections.cardCustomTags.toArray) {
    const slug = tagSlugById.get(assignment.custom_tag_id);
    if (slug === undefined) {
      continue;
    }
    customTagAssignmentRows.push({ cardId: assignment.card_id, slug });
  }

  const staticParts = assembleCatalogStaticParts({
    setRows,
    cardRows,
    printingRows,
    imageRows,
    banRows,
    errataRows,
    markerRows,
    allChannels,
    channelLinkRows,
    customTagAssignmentRows,
  });

  // Compose the full CatalogResponse shape `enrichCatalog` expects. The dynamic
  // `totalCopies` scalar is NOT synced and the enriched `UseCardsResult` never
  // exposes it (consumers that need it stay on the existing query path), so a
  // placeholder 0 is correct here.
  const catalog: CatalogResponse = { ...staticParts, totalCopies: 0 };
  const result = enrichCatalog(catalog);
  store.derived = { version: store.version, result };
  return result;
}

// ── Hook surface ─────────────────────────────────────────────────────────────

/**
 * The synced catalog, or null until it is usable. Returns null on the server,
 * before hydration, while persistence is still settling, while the initial
 * 15-shape sync is in flight, or in OPFS-less browsers that never reach a
 * persisted-ready state in time — in all those cases `useCards` falls back to
 * the edge-fetch path, byte-equivalent to before this feature.
 *
 * SSR-safe: the readiness subscription only ever fires in the browser, and the
 * server snapshot is a constant null.
 *
 * @returns The derived `UseCardsResult`, or null when not yet ready.
 */
export function useSyncedCatalog(): UseCardsResult | null {
  const hydrated = useHydrated();
  const persistenceState = usePersistence();

  // Subscribe to the store's readiness/version so React re-renders when the
  // sync settles or the catalog later changes. The subscribe callback creates
  // the store lazily (browser-only) and tears the subscription down on unmount.
  const synced = useSyncExternalStore(
    (onStoreChange) => {
      if (globalThis.window === undefined) {
        return noop;
      }
      const persistence =
        persistenceState.status === "ready" ? persistenceState.persistence : undefined;
      const store = getEntry(persistence);
      store.listeners.add(onStoreChange);
      return () => {
        store.listeners.delete(onStoreChange);
      };
    },
    () => {
      if (globalThis.window === undefined || entry === null || !isEntryReady(entry)) {
        return null;
      }
      return deriveCardsResult(entry);
    },
    () => null,
  );

  // Gate the synced path behind hydration and a settled persistence state — the
  // fallback (edge fetch) must stay byte-identical through SSR and first paint.
  if (!hydrated || persistenceState.status === "pending") {
    return null;
  }
  return synced;
}

/**
 * Test-only: reset the module singleton so each test starts fresh.
 *
 * @returns Nothing.
 */
export function resetCatalogCollectionForTesting(): void {
  if (entry) {
    for (const unsubscribe of entry.unsubscribes) {
      unsubscribe();
    }
  }
  entry = null;
  entryHasPersistence = false;
}

/**
 * Test-only accessor for the underlying store (creates it if needed), so tests
 * can drive the sync pipeline directly without a React tree.
 *
 * @returns The catalog store entry.
 */
export function getCatalogStoreForTesting(
  persistence: PersistedCollectionPersistence | null | undefined,
): { isReady: () => boolean; derive: () => UseCardsResult } {
  const store = getEntry(persistence);
  return {
    isReady: () => isEntryReady(store),
    derive: () => deriveCardsResult(store),
  };
}
