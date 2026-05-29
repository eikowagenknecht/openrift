import type { TimeRange } from "@openrift/shared";

import type { SourceMappingConfig } from "@/components/admin/price-mappings-types";

// User-scoped keys take a `userId` first segment so user A's cache slot and
// user B's never collide. Public/global keys are plain string tuples.
//
// Convention: anything that fetches per-user data from the API (collections,
// copies, decks, preferences, collection events, value history) is keyed
// per-user. Catalog data, sets, prices, marketplace info, and admin queries
// are not — they're either public or admin-scoped.

export const queryKeys = {
  featureFlags: {
    all: ["feature-flags"] as const,
  },
  siteSettings: {
    all: ["site-settings"] as const,
  },
  catalog: {
    all: ["catalog"] as const,
  },
  landingSummary: {
    all: ["landing-summary"] as const,
  },
  prices: {
    all: ["prices"] as const,
  },
  cards: {
    detail: (slug: string) => ["card-detail", slug] as const,
  },
  sets: {
    all: ["sets"] as const,
    detail: (slug: string) => ["sets", slug] as const,
  },
  promos: {
    all: ["promos"] as const,
  },
  init: {
    all: ["init"] as const,
  },
  collections: {
    all: (userId: string) => ["collections", userId] as const,
    publicByToken: (token: string) => ["collections", "share", token] as const,
    groupShares: (userId: string, id: string) =>
      ["collections", userId, id, "group-shares"] as const,
  },
  preferences: {
    all: (userId: string) => ["preferences", userId] as const,
  },
  copies: {
    all: (userId: string) => ["copies", userId] as const,
    byCollection: (userId: string, id: string) => ["copies", userId, id] as const,
  },
  collectionEvents: {
    all: (userId: string) => ["collection-events", userId] as const,
  },
  ownedCount: {
    all: ["ownedCount"] as const,
  },
  priceHistory: {
    byPrinting: (printingId: string, range: TimeRange) =>
      ["priceHistory", printingId, range] as const,
  },
  marketplaceInfo: {
    byPrintings: (printingIds: readonly string[]) => ["marketplaceInfo", printingIds] as const,
  },
  collectionValueHistory: {
    byParams: (
      userId: string,
      marketplace: string,
      range: TimeRange,
      collectionId?: string,
      scope?: string,
    ) => ["collectionValueHistory", userId, marketplace, range, collectionId, scope] as const,
  },
  decks: {
    all: (userId: string) => ["decks", userId] as const,
    detail: (userId: string, id: string) => ["decks", userId, id] as const,
    availability: (userId: string, id: string) => ["decks", userId, id, "availability"] as const,
    publicByToken: (token: string) => ["decks", "share", token] as const,
  },
  lists: {
    // intent: optional filter (buy | sell | organize). Cache miss for the
    // intent-filtered key is fine — different intents live in different UI
    // surfaces and rarely overlap in practice.
    all: (userId: string, intent?: string) =>
      intent === undefined
        ? (["lists", userId] as const)
        : (["lists", userId, "intent", intent] as const),
    detail: (userId: string, id: string) => ["lists", userId, id] as const,
    publicByToken: (token: string) => ["lists", "share", token] as const,
    groupShares: (userId: string, id: string) => ["lists", userId, id, "group-shares"] as const,
  },
  userShare: {
    state: (userId: string) => ["user-share", userId] as const,
    publicByToken: (token: string) => ["user-share", "public", token] as const,
    publicListByToken: (token: string, listId: string) =>
      ["user-share", "public", token, "lists", listId] as const,
  },
  friendGroups: {
    all: (userId: string) => ["friend-groups", userId] as const,
    detail: (userId: string, slug: string) => ["friend-groups", userId, slug] as const,
    matches: (userId: string, slug: string) => ["friend-groups", userId, slug, "matches"] as const,
    memberDetail: (userId: string, slug: string, memberId: string) =>
      ["friend-groups", userId, slug, "members", memberId] as const,
    shareableLists: (userId: string, slug: string) =>
      ["friend-groups", userId, slug, "shareable-lists"] as const,
    shareableCollections: (userId: string, slug: string) =>
      ["friend-groups", userId, slug, "shareable-collections"] as const,
    pendingInvitesCount: (userId: string) =>
      ["friend-groups", userId, "pending-invites-count"] as const,
    joinPreview: (code: string) => ["friend-groups", "join-preview", code] as const,
    sharedList: (userId: string, slug: string, listId: string) =>
      ["friend-groups", userId, slug, "lists", listId] as const,
    sharedCollection: (userId: string, slug: string, collectionId: string) =>
      ["friend-groups", userId, slug, "collections", collectionId] as const,
  },
  trades: {
    // Broad prefix mutations invalidate to refresh any open tab and the badge
    // counts (invalidation is prefix-based, so this also clears byGroup/actionCounts).
    all: (userId: string) => ["trades", userId] as const,
    byGroup: (userId: string, groupId: string) => ["trades", userId, "group", groupId] as const,
    actionCounts: (userId: string) => ["trades", userId, "action-counts"] as const,
  },
  rules: {
    all: (kind: string) => ["rules", kind] as const,
    versions: (kind: string) => ["rules", kind, "versions"] as const,
    byVersion: (kind: string, version: string) => ["rules", kind, version] as const,
  },
  admin: {
    me: ["admin", "me"] as const,
    sets: ["admin", "sets"] as const,
    cards: {
      all: ["admin", "cards"] as const,
      list: ["admin", "cards", "list"] as const,
      detail: (cardId: string) => ["admin", "cards", "detail", cardId] as const,
      unmatched: (name: string) => ["admin", "cards", "unmatched", name] as const,
      allCards: ["admin", "cards", "all-cards"] as const,
      providerNames: ["admin", "cards", "provider-names"] as const,
      providerStats: ["admin", "cards", "provider-stats"] as const,
    },
    marketplaceGroups: ["admin", "marketplace-groups"] as const,
    featureFlags: ["admin", "feature-flags"] as const,
    featureFlagOverrides: ["admin", "feature-flag-overrides"] as const,
    siteSettings: ["admin", "site-settings"] as const,
    status: ["admin", "status"] as const,
    jobRuns: ["admin", "job-runs"] as const,
    jobRunsByKind: (kind: string) => ["admin", "job-runs", "by-kind", kind] as const,
    cronStatus: ["admin", "cron-status"] as const,
    cacheStatus: ["admin", "cache-status"] as const,
    rehostStatus: ["admin", "rehost-status"] as const,
    brokenImages: ["admin", "broken-images"] as const,
    lowResImages: ["admin", "low-res-images"] as const,
    missingImages: ["admin", "missing-images"] as const,
    priceMappings: {
      bySource: (config: SourceMappingConfig) => ["admin", config.source] as const,
      bySourceAndFilter: (config: SourceMappingConfig, showAll: boolean) =>
        ["admin", config.source, "mappings", { all: showAll }] as const,
    },
    unifiedMappings: {
      all: ["admin", "unified-mappings"] as const,
      list: ["admin", "unified-mappings", "list"] as const,
      byCard: (cardId: string) => ["admin", "unified-mappings", "card", cardId] as const,
    },
    ignoredProducts: ["admin", "ignored-products"] as const,
    ignoredCandidates: ["admin", "ignored-candidates"] as const,
    deckZones: ["admin", "deck-zones"] as const,
    domains: ["admin", "domains"] as const,
    languages: ["admin", "languages"] as const,
    finishes: ["admin", "finishes"] as const,
    artVariants: ["admin", "art-variants"] as const,
    rarities: ["admin", "rarities"] as const,
    cardTypes: ["admin", "card-types"] as const,
    superTypes: ["admin", "super-types"] as const,
    deckFormats: ["admin", "deck-formats"] as const,
    formats: ["admin", "formats"] as const,
    markers: ["admin", "markers"] as const,
    customTags: ["admin", "custom-tags"] as const,
    customTagCategories: ["admin", "custom-tag-categories"] as const,
    cardCustomTags: Object.assign(
      (cardId: string) => ["admin", "card-custom-tags", cardId] as const,
      { prefix: ["admin", "card-custom-tags"] as const },
    ),
    distributionChannels: ["admin", "distribution-channels"] as const,
    distinctArtists: ["admin", "distinct-artists"] as const,
    providerSettings: ["admin", "provider-settings"] as const,
    cardBans: Object.assign((cardId: string) => ["admin", "card-bans", cardId] as const, {
      prefix: ["admin", "card-bans"] as const,
    }),
    cardErrata: Object.assign((cardId: string) => ["admin", "card-errata", cardId] as const, {
      prefix: ["admin", "card-errata"] as const,
    }),
    keywordStats: ["admin", "keyword-stats"] as const,
    typographyReview: ["admin", "typography-review"] as const,
    rules: {
      versions: ["admin", "rules", "versions"] as const,
    },
    users: ["admin", "users"] as const,
  },
} as const;
