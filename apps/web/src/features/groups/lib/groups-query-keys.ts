export const userShareKeys = {
  state: (userId: string) => ["user-share", userId] as const,
  publicByToken: (token: string) => ["user-share", "public", token] as const,
  publicListByToken: (token: string, listId: string) =>
    ["user-share", "public", token, "lists", listId] as const,
} as const;

export const friendGroupsKeys = {
  all: (userId: string) => ["friend-groups", userId] as const,
  detail: (userId: string, slug: string) => ["friend-groups", userId, slug] as const,
  matches: (userId: string, slug: string) => ["friend-groups", userId, slug, "matches"] as const,
  boxWants: (userId: string, slug: string) => ["friend-groups", userId, slug, "box-wants"] as const,
  checks: (userId: string, slug: string) => ["friend-groups", userId, slug, "checks"] as const,
  checkEvent: (userId: string, slug: string, eventId: string) =>
    ["friend-groups", userId, slug, "checks", eventId] as const,
  checkEntry: (userId: string, slug: string, eventId: string, entryId: string) =>
    ["friend-groups", userId, slug, "checks", eventId, entryId] as const,
  checkKeys: (userId: string, slug: string) =>
    ["friend-groups", userId, slug, "check-keys"] as const,
  activity: (userId: string, slug: string) => ["friend-groups", userId, slug, "activity"] as const,
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
  shops: (userId: string, slug: string) => ["friend-groups", userId, slug, "shops"] as const,
  shopSearch: (userId: string, slug: string, term: string) =>
    ["friend-groups", userId, slug, "shop-search", term] as const,
  shopEvents: (userId: string, slug: string) =>
    ["friend-groups", userId, slug, "shop-events"] as const,
} as const;

export const tradesKeys = {
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
} as const;

export const loansKeys = {
  // Same prefix-invalidation shape as trades: invalidating `all` also
  // clears actionCounts and borrowerOptions.
  all: (userId: string) => ["loans", userId] as const,
  actionCounts: (userId: string) => ["loans", userId, "action-counts"] as const,
  borrowerOptions: (userId: string) => ["loans", userId, "borrower-options"] as const,
} as const;
