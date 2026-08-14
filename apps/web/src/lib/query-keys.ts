import type { TimeRange } from "@openrift/shared";

import type { SourceMappingConfig } from "@/components/admin/price-mappings-types";

// User-scoped keys take a `userId` first segment so user A's cache slot and
// user B's never collide. Public/global keys are plain string tuples.
//
// Convention: anything that fetches per-user data from the API (collections,
// copies, decks, preferences, collection events, value history) is keyed
// per-user. Catalog data, sets, prices, marketplace info, and admin queries
// are not — they're either public or admin-scoped. Exception: `admin.me` is
// the caller's own access level, so it is user-scoped like any other
// per-user query. A global key would survive sign-in/sign-out (login only
// invalidates the session query) and keep serving the previous identity's
// cached answer.

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
  products: {
    all: ["products"] as const,
    detail: (slug: string) => ["products", slug] as const,
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
    // The react-db copies store's own query (see copies-collection.ts). Its
    // queryFn re-reads `copies.all` via fetchQuery, so invalidate BOTH keys to
    // force a server round-trip that syncs fresh rows into the store (loan
    // mutations do this — the server picks which copies get pinned, so there
    // is nothing to write optimistically).
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
  overlay: {
    /** @returns Key for the signed-in creator's own channel, as the dashboard sees it. */
    channel: (userId: string) => ["overlay", userId] as const,
    /** @returns Key for the token-addressed state the OBS browser source polls. */
    stateByToken: (token: string) => ["overlay", "state", token] as const,
  },
  userShare: {
    state: (userId: string) => ["user-share", userId] as const,
    publicByToken: (token: string) => ["user-share", "public", token] as const,
    publicListByToken: (token: string, listId: string) =>
      ["user-share", "public", token, "lists", listId] as const,
  },
  tournamentDecks: {
    // The player's own deck, keyed by the tournament it belongs to — the deck
    // is a section of the tournament page, not a standalone surface (ADR-033).
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
    pendingInvitesCount: (userId: string) =>
      ["friend-groups", userId, "pending-invites-count"] as const,
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
  // Tournament-scoped judge deck-check (ADR-033): keyed by the tournament id,
  // which is the deck-check "event" id.
  tournamentDeckCheck: {
    entries: (userId: string, tournamentId: string) =>
      ["tournament-deck-check", userId, tournamentId] as const,
    entry: (userId: string, tournamentId: string, entryId: string) =>
      ["tournament-deck-check", userId, tournamentId, entryId] as const,
  },
  // Host-scoped deck-check integration keys (ADR-033): personal or org-owned.
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
    // Broad prefix mutations invalidate to refresh any open tab and the badge
    // counts (invalidation is prefix-based, so this also clears byGroup/actionCounts).
    all: (userId: string) => ["trades", userId] as const,
    byGroup: (userId: string, groupId: string) => ["trades", userId, "group", groupId] as const,
    actionCounts: (userId: string) => ["trades", userId, "action-counts"] as const,
    // Per-printing live-trade annotations for the card browsers. Under the
    // `all` prefix on purpose, so every trade mutation already refreshes it.
    liveByPrinting: (userId: string) => ["trades", userId, "live-by-printing"] as const,
    // The candidate copies behind one pending trade, for the giver's copy
    // picker. Fetched on demand only (the route re-reads the giver's supply),
    // and under the `all` prefix so an accept or a quantity change drops it
    // without its own invalidation entry.
    copyOptions: (userId: string, tradeId: string) =>
      ["trades", userId, "copy-options", tradeId] as const,
    // One counterparty's whole trade sheet (their profile, the shared groups,
    // and the match suggestions pooled across them). Deliberately under the
    // `["trades", userId]` prefix so every trade mutation's prefix
    // invalidation refreshes the open sheet — accepting a suggestion there has
    // to drop it from the list without its own invalidation entry.
    sheet: (userId: string, memberId: string) => ["trades", userId, "sheet", memberId] as const,
  },
  loans: {
    // Same prefix-invalidation shape as trades (ADR-039): mutations invalidate
    // `all`, which also clears actionCounts and borrowerOptions.
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
    // Per-user (see the exception note at the top): `null` is the signed-out
    // slot, so an anonymous "no access" answer can never shadow a user's real
    // one after sign-in.
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
    cronStatus: ["admin", "cron-status"] as const,
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
