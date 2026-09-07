import type { SourceMappingConfig } from "@/features/admin/lib/price-mappings-types";

export const adminKeys = {
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
    crossSource: (eventId: string) => ["admin", "meta", "events", eventId, "cross-source"] as const,
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
} as const;
