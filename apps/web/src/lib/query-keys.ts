import type { MetaCountsQuery, MetaScopeQuery, TimeRange } from "@openrift/shared";

import type { MetaDateRange, MetaDeckQuery } from "@/lib/meta-scope";
import type { SourceMappingConfig } from "@/lib/price-mappings-types";

// An absent filter and one that narrows nothing share the unscoped key, so
// they don't cache the same fetch twice.
function metaFilterKey<T extends object>(
  base: readonly string[],
  filter: T | undefined,
  fields: readonly (keyof T)[],
): readonly unknown[] {
  if (filter === undefined || fields.every((field) => filter[field] === undefined)) {
    return base;
  }
  return [...base, Object.fromEntries(fields.map((field) => [field, filter[field] ?? null]))];
}

const RANGE_FIELDS = ["from", "to"] as const;

const SCOPE_FIELDS = [
  "from",
  "to",
  "formats",
  "formatsEx",
  "tiers",
  "tiersEx",
  "countries",
  "countriesEx",
] as const;

const DECK_QUERY_FIELDS = [...SCOPE_FIELDS, "legend", "player", "limit"] as const;

const COUNTS_QUERY_FIELDS = ["format", "dateFrom", "dateTo"] as const;

const LEGEND_QUERY_FIELDS = [...SCOPE_FIELDS, "page"] as const;

export const queryKeys = {
  featureFlags: {
    all: ["feature-flags"] as const,
  },
  siteSettings: {
    all: ["site-settings"] as const,
  },
  catalog: {
    all: ["catalog"] as const,
    none: ["catalog", "none"] as const,
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
    forLanguage: (language: string) => ["promos", language] as const,
  },
  products: {
    all: ["products"] as const,
    detail: (slug: string) => ["products", slug] as const,
  },
  // Admin mutations invalidate the `all` prefix: every public read
  // denormalizes event fields, so any write can stale any of them.
  meta: {
    all: ["meta"] as const,
    events: (range?: MetaDateRange) => metaFilterKey(["meta", "events"], range, RANGE_FIELDS),
    activity: ["meta", "activity"] as const,
    counts: (query?: MetaCountsQuery) =>
      metaFilterKey(["meta", "counts"], query, COUNTS_QUERY_FIELDS),
    event: (slug: string) => ["meta", "events", slug] as const,
    decks: (query?: MetaDeckQuery) => metaFilterKey(["meta", "decks"], query, DECK_QUERY_FIELDS),
    deckCards: (range?: MetaDateRange) =>
      metaFilterKey(["meta", "deck-cards"], range, RANGE_FIELDS),
    deck: (token: string) => ["meta", "decks", token] as const,
    legends: ["meta", "legends"] as const,
    legend: (slug: string, query?: MetaScopeQuery & { page?: number }) =>
      metaFilterKey(["meta", "legends", slug], query, LEGEND_QUERY_FIELDS),
    player: (key: string) => ["meta", "players", key] as const,
  },
  metaSubmissions: {
    all: (userId: string) => ["meta-submissions", userId] as const,
    creditVisibility: (userId: string) => ["meta-submissions", userId, "credit"] as const,
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
  contactMethods: {
    all: (userId: string) => ["contact-methods", userId] as const,
  },
  copies: {
    all: (userId: string) => ["copies", userId] as const,
    // The react-db copies store's queryFn re-reads `copies.all`, so
    // invalidate BOTH keys to sync fresh rows into the store.
    syncedStore: (userId: string) => ["copies-collection", userId] as const,
    byCollection: (userId: string, id: string) => ["copies", userId, id] as const,
    listMemberships: (userId: string, copyIds: readonly string[], excludeListId?: string) =>
      ["copies", userId, "list-memberships", copyIds, excludeListId ?? null] as const,
  },
  collectionEvents: {
    all: (userId: string) => ["collection-events", userId] as const,
  },
  cardSubmissions: {
    all: (userId: string) => ["card-submissions", userId] as const,
    forCandidate: (candidateCardId: string) =>
      ["card-submissions", "candidate", candidateCardId] as const,
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
    plan: (userId: string, id: string) => ["decks", userId, id, "plan"] as const,
    publicByToken: (token: string) => ["decks", "share", token] as const,
  },
  deckFolders: {
    all: (userId: string) => ["deck-folders", userId] as const,
  },
  tierLists: {
    all: (userId: string) => ["tier-lists", userId] as const,
    detail: (userId: string, id: string) => ["tier-lists", userId, id] as const,
    publicByToken: (token: string) => ["tier-lists", "share", token] as const,
  },
  lists: {
    all: (userId: string, intent?: string) =>
      intent === undefined
        ? (["lists", userId] as const)
        : (["lists", userId, "intent", intent] as const),
    detail: (userId: string, id: string) => ["lists", userId, id] as const,
    publicByToken: (token: string) => ["lists", "share", token] as const,
    groupShares: (userId: string, id: string) => ["lists", userId, id, "group-shares"] as const,
  },
  overlay: {
    channel: (userId: string) => ["overlay", userId] as const,
    // The preset is part of the key: two browser sources on the same token but
    // different presets must not share a cache slot.
    stateByToken: (token: string, presetId?: string) =>
      ["overlay", "state", token, presetId ?? null] as const,
  },
  stagePresets: {
    all: (userId: string) => ["stage-presets", userId] as const,
  },
  userShare: {
    state: (userId: string) => ["user-share", userId] as const,
    publicByToken: (token: string) => ["user-share", "public", token] as const,
    publicListByToken: (token: string, listId: string) =>
      ["user-share", "public", token, "lists", listId] as const,
  },
  tournamentDecks: {
    entry: (userId: string, tournamentId: string) =>
      ["tournament-decks", userId, tournamentId] as const,
    submission: (userId: string, token: string) =>
      ["tournament-decks", userId, "submission", token] as const,
    claim: (token: string) => ["tournament-decks", "claim", token] as const,
  },
  friendGroups: {
    all: (userId: string) => ["friend-groups", userId] as const,
    detail: (userId: string, slug: string) => ["friend-groups", userId, slug] as const,
    matches: (userId: string, slug: string) => ["friend-groups", userId, slug, "matches"] as const,
    boxWants: (userId: string, slug: string) =>
      ["friend-groups", userId, slug, "box-wants"] as const,
    checks: (userId: string, slug: string) => ["friend-groups", userId, slug, "checks"] as const,
    checkEvent: (userId: string, slug: string, eventId: string) =>
      ["friend-groups", userId, slug, "checks", eventId] as const,
    checkEntry: (userId: string, slug: string, eventId: string, entryId: string) =>
      ["friend-groups", userId, slug, "checks", eventId, entryId] as const,
    checkKeys: (userId: string, slug: string) =>
      ["friend-groups", userId, slug, "check-keys"] as const,
    activity: (userId: string, slug: string) =>
      ["friend-groups", userId, slug, "activity"] as const,
    memberDetail: (userId: string, slug: string, memberId: string) =>
      ["friend-groups", userId, slug, "members", memberId] as const,
    shareableLists: (userId: string, slug: string) =>
      ["friend-groups", userId, slug, "shareable-lists"] as const,
    shareableCollections: (userId: string, slug: string) =>
      ["friend-groups", userId, slug, "shareable-collections"] as const,
    // Not user-scoped: the header polls it without an authenticated route
    // boundary; the server answers for whoever the cookie identifies.
    pendingRequestsCount: () => ["friend-groups", "pending-requests-count"] as const,
    joinPreview: (code: string) => ["friend-groups", "join-preview", code] as const,
    sharedList: (userId: string, slug: string, listId: string) =>
      ["friend-groups", userId, slug, "lists", listId] as const,
    sharedCollection: (userId: string, slug: string, collectionId: string) =>
      ["friend-groups", userId, slug, "collections", collectionId] as const,
    discordLinks: (userId: string, slug: string) =>
      ["friend-groups", userId, slug, "discord-links"] as const,
  },
  podTournaments: {
    all: (userId: string) => ["pod-tournaments", userId] as const,
    detail: (userId: string, id: string) => ["pod-tournaments", userId, id] as const,
    report: (token: string) => ["pod-tournaments", "report", token] as const,
  },
  tournaments: {
    all: (userId: string) => ["tournaments", userId] as const,
    detail: (userId: string, id: string) => ["tournaments", userId, id] as const,
    participants: (userId: string, id: string) =>
      ["tournaments", userId, id, "participants"] as const,
    staffCandidates: (userId: string, id: string) =>
      ["tournaments", userId, id, "staff-candidates"] as const,
    submitLanding: (token: string) => ["tournaments", "submit", token] as const,
    staffInviteLanding: (token: string) => ["tournaments", "staff-invite", token] as const,
    forGroup: (userId: string, slug: string) => ["tournaments", userId, "group", slug] as const,
  },
  tournamentDeckCheck: {
    entries: (userId: string, tournamentId: string) =>
      ["tournament-deck-check", userId, tournamentId] as const,
    entry: (userId: string, tournamentId: string, entryId: string) =>
      ["tournament-deck-check", userId, tournamentId, entryId] as const,
  },
  deckCheckKeys: {
    mine: (userId: string) => ["deck-check-keys", userId, "me"] as const,
    org: (userId: string, orgId: string) => ["deck-check-keys", userId, "org", orgId] as const,
  },
  organizations: {
    mine: (userId: string) => ["organizations", userId] as const,
    detail: (userId: string, id: string) => ["organizations", userId, id] as const,
    adminAll: ["admin", "organizations"] as const,
  },
  trades: {
    // Prefix-based: invalidating `all` also clears byGroup/actionCounts.
    all: (userId: string) => ["trades", userId] as const,
    byGroup: (userId: string, groupId: string) => ["trades", userId, "group", groupId] as const,
    actionCounts: (userId: string) => ["trades", userId, "action-counts"] as const,
    // Under the `all` prefix on purpose, so every trade mutation refreshes it.
    liveByPrinting: (userId: string) => ["trades", userId, "live-by-printing"] as const,
    // Under the `all` prefix so an accept or a quantity change drops it
    // without its own invalidation entry.
    copyOptions: (userId: string, tradeId: string) =>
      ["trades", userId, "copy-options", tradeId] as const,
    // Deliberately under the `["trades", userId]` prefix so every trade
    // mutation refreshes the open sheet.
    sheet: (userId: string, memberId: string) => ["trades", userId, "sheet", memberId] as const,
  },
  loans: {
    // Same prefix-invalidation shape as trades: invalidating `all` also
    // clears actionCounts and borrowerOptions.
    all: (userId: string) => ["loans", userId] as const,
    actionCounts: (userId: string) => ["loans", userId, "action-counts"] as const,
    borrowerOptions: (userId: string) => ["loans", userId, "borrower-options"] as const,
  },
  rules: {
    all: (kind: string) => ["rules", kind] as const,
    versions: (kind: string) => ["rules", kind, "versions"] as const,
    byVersion: (kind: string, version: string) => ["rules", kind, version] as const,
  },
  admin: {
    // `null` is the signed-out slot, so an anonymous "no access" answer can
    // never shadow a user's real one after sign-in.
    me: (userId: string | null) => ["admin", "me", userId] as const,
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
    // Not nested under `cards`: invalidating a card's detail on every
    // citation write would refetch the whole candidate review payload.
    printingCitations: (printingId: string) =>
      ["admin", "printings", printingId, "citations"] as const,
    marketplaceGroups: ["admin", "marketplace-groups"] as const,
    featureFlags: ["admin", "feature-flags"] as const,
    featureFlagOverrides: ["admin", "feature-flag-overrides"] as const,
    grants: ["admin", "grants"] as const,
    siteSettings: ["admin", "site-settings"] as const,
    status: ["admin", "status"] as const,
    jobRuns: ["admin", "job-runs"] as const,
    jobRunsList: (params: { page: number; kind?: string; trigger?: string; status?: string }) =>
      ["admin", "job-runs", "list", params] as const,
    jobRunsByKind: (kind: string) => ["admin", "job-runs", "by-kind", kind] as const,
    jobSchedules: ["admin", "job-schedules"] as const,
    cacheStatus: ["admin", "cache-status"] as const,
    apiKeys: ["admin", "api-keys"] as const,
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
    meta: {
      // Prefix every event read sits under, so a write that moves an event's
      // counts refetches whichever page is on screen, plus any open detail.
      events: ["admin", "meta", "events"] as const,
      eventList: (params: {
        page: number;
        search?: string;
        format?: string;
        dateFrom?: string;
        dateTo?: string;
        incompleteStandings?: boolean;
        noDecks?: boolean;
        sort?: string;
        direction?: string;
      }) => ["admin", "meta", "events", "list", params] as const,
      eventSearch: (search: string) => ["admin", "meta", "events", "search", search] as const,
      event: (eventId: string) => ["admin", "meta", "events", eventId] as const,
      eventPlayers: (eventId: string) => ["admin", "meta", "events", eventId, "players"] as const,
      eventSources: (eventId: string) => ["admin", "meta", "events", eventId, "sources"] as const,
      eventUploads: (eventId: string) => ["admin", "meta", "events", eventId, "uploads"] as const,
      crossSource: (eventId: string) =>
        ["admin", "meta", "events", eventId, "cross-source"] as const,
      // Suggestion keys nest under it on purpose, so settling an overlay also
      // refetches the ranked targets that settling invalidates.
      overlays: ["admin", "meta", "overlays"] as const,
      eventSuggestions: (overlayId: string) =>
        ["admin", "meta", "overlays", overlayId, "event-suggestions"] as const,
      playerSuggestions: (overlayId: string) =>
        ["admin", "meta", "overlays", overlayId, "player-suggestions"] as const,
      // Null for a provider's overlay, which is an answer and gets cached as one.
      submissionForPlayerOverlay: (overlayId: string) =>
        ["admin", "meta", "overlays", overlayId, "submission"] as const,
      eventCorrections: ["admin", "meta", "event-corrections"] as const,
      ignoredSources: ["admin", "meta", "ignored-sources"] as const,
      // Prefix every filtered page sits under, so accepting or dismissing one
      // row refetches whichever page is on screen.
      catalogue: ["admin", "meta", "catalogue"] as const,
      catalogueList: (params: {
        page: number;
        search?: string;
        triage?: string;
        displayStatus?: string;
        minPlayers?: number;
        decklistPublished?: boolean;
        missing?: boolean;
        dateFrom?: string;
        dateTo?: string;
        sort?: string;
        direction?: string;
      }) => ["admin", "meta", "catalogue", "list", params] as const,
      // playloltcg mirrors the catalogue above under its own prefix: a write
      // to one source must not drop the other's pages.
      playloltcgCatalogue: ["admin", "meta", "playloltcg", "catalogue"] as const,
      playloltcgCatalogueList: (params: { page?: number; search?: string; triage?: string }) =>
        ["admin", "meta", "playloltcg", "catalogue", "list", params] as const,
      topdeckCatalogue: ["admin", "meta", "topdeck", "catalogue"] as const,
      topdeckCatalogueList: (params: { page?: number; search?: string; triage?: string }) =>
        ["admin", "meta", "topdeck", "catalogue", "list", params] as const,
      syncSettings: ["admin", "meta", "sync", "settings"] as const,
      archiveJobs: ["admin", "meta", "archive", "jobs"] as const,
      syncStatus: Object.assign(
        (source: string) => ["admin", "meta", "sync", "status", source] as const,
        { prefix: ["admin", "meta", "sync", "status"] as const },
      ),
      sourceTemplates: ["admin", "meta", "source", "templates"] as const,
      sourceFormats: ["admin", "meta", "source", "formats"] as const,
    },
    customTags: ["admin", "custom-tags"] as const,
    customTagCategories: ["admin", "custom-tag-categories"] as const,
    cardTags: ["admin", "card-tags"] as const,
    tagCategories: ["admin", "tag-categories"] as const,
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
