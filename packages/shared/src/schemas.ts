import { z } from "zod";

/**
 * Field rules inlined from api/db/schemas — mirrors DB CHECK constraints for
 * the subset needed by shared request-validation schemas.
 */
const collectionFieldRules = {
  name: z.string().min(1).max(200),
};
const deckFieldRules = {
  name: z.string().min(1).max(200),
  format: z.string().min(1),
};
const deckCardFieldRules = {
  zone: z.string().min(1),
  quantity: z.number().int().positive(),
};
const listEntryFieldRules = {
  quantity: z.number().int().positive(),
};

const listIntentSchema = z.enum(["wish", "trade", "organize"]);

const listKindSchema = z.enum(["card", "printing", "copy"]);

// Trade preferences (ADR-017) -------------------------------------------------

const tradePricePrefSchema = z.enum(["cm_lowest", "tcg_lowest", "ct_zero", "absolute"]);
const tradeTypeSchema = z.enum(["cards", "money", "both"]);
const currencySchema = z.enum(["EUR", "USD"]);

/**
 * Triple stored on either a list (defaults) or an entry (override). All fields
 * are independently nullable; the DB enforces `(pricePref = 'absolute') ↔
 * (priceAbsoluteCents IS NOT NULL)`.
 */
const tradePreferenceInputSchema = z
  .object({
    pricePref: tradePricePrefSchema.nullable(),
    priceAbsoluteCents: z.number().int().positive().max(10_000_000).nullable(),
    tradeType: tradeTypeSchema.nullable(),
  })
  .refine((data) => (data.pricePref === "absolute") === (data.priceAbsoluteCents !== null), {
    message: "priceAbsoluteCents must be set iff pricePref === 'absolute'",
  });

const emptyTradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
} as const;

/**
 * Allowed intent × kind combos. Mirrors the chk_lists_intent_kind DB
 * constraint (migration 133, renamed in 135).
 * @returns true if the combo is allowed.
 */
const isAllowedIntentKind = (
  intent: "wish" | "trade" | "organize",
  kind: "card" | "printing" | "copy",
): boolean => {
  if (intent === "wish") {
    return kind === "card" || kind === "printing";
  }
  if (intent === "trade") {
    return kind === "copy";
  }
  return true;
};

// ---------------------------------------------------------------------------
// Common param & query schemas (used by zValidator("param"//"query"))
// ---------------------------------------------------------------------------

export const idParamSchema = z.object({ id: z.uuid() });

export const idAndItemIdParamSchema = z.object({ id: z.uuid(), itemId: z.uuid() });

export const keyParamSchema = z.object({ key: z.string().min(1) });

export const providerParamSchema = z.object({ provider: z.string().min(1) });

export const marketplaceGroupParamSchema = z.object({
  marketplace: z.string().min(1),
  id: z.coerce.number().int(),
});

export const collectionEventsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const CSV_MAX_CHARS = 2000;
const CSV_MAX_ITEMS = 200;

// A comma-separated UUID list, validated + bounded at the edge. Without this a
// non-UUID element reaches the repo's `sql`${id}::uuid`` interpolation and
// Postgres throws → a 500 (and a dev-mode SQL leak) for what is client error.
const csvUuidList = z
  .string()
  .min(1)
  .max(CSV_MAX_CHARS)
  .refine(
    (value) => {
      const ids = value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      return (
        ids.length > 0 &&
        ids.length <= CSV_MAX_ITEMS &&
        ids.every((id) => z.uuid().safeParse(id).success)
      );
    },
    { message: `must be a comma-separated list of at most ${CSV_MAX_ITEMS} UUIDs` },
  );

// Slug-filter CSV: not interpolated as ::uuid, so it can't 500, but bound it
// anyway so a single request can't build a pathologically large IN-list.
const csvBounded = z.string().min(1).max(CSV_MAX_CHARS);

export const collectionValueHistoryQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]).default("tcgplayer"),
  collectionIds: csvUuidList.optional(),
  sets: csvBounded.optional(),
  languages: csvBounded.optional(),
  domains: csvBounded.optional(),
  types: csvBounded.optional(),
  rarities: csvBounded.optional(),
  finishes: csvBounded.optional(),
  artVariants: csvBounded.optional(),
  promos: z.enum(["only", "exclude"]).optional(),
  signed: z.enum(["true", "false"]).optional(),
  banned: z.enum(["true", "false"]).optional(),
  errata: z.enum(["true", "false"]).optional(),
});

export const copiesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  // Hard cap matches the server-side clamp (COPIES_PAGE_MAX = 1000 in
  // repositories/copies.ts). PAG-1 dropped the 10k soft-cap in the route; the
  // schema/OpenAPI doc must advertise the limit the server actually honors.
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export const decksQuerySchema = z.object({
  wanted: z.enum(["true", "false"]).optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
});

// ---------------------------------------------------------------------------
// Collection tracking schemas
// ---------------------------------------------------------------------------

export const createCollectionSchema = z.object({
  name: collectionFieldRules.name,
  description: z.string().max(1000).nullish(),
  availableForDeckbuilding: z.boolean().optional(),
  groupSlug: z.string().optional(),
});

export const updateCollectionSchema = z.object({
  name: collectionFieldRules.name.optional(),
  description: z.string().max(1000).nullish(),
  sortOrder: z.number().int().optional(),
});

/**
 * Sets the caller's own deck-building availability for a collection. This is a
 * per-viewer preference (not a property of the collection), so any member with
 * access can set it for themselves — including for shared group collections.
 */
export const setCollectionDeckbuildingSchema = z.object({
  available: z.boolean(),
});

/**
 * Bulk reorder for the user's personal collections. The server re-numbers
 * `sort_order` so that the rows appear in the order given here on the next
 * fetch. Group-owned collections are not reorderable and are ignored if
 * passed; the inbox is treated like any other row.
 */
export const reorderCollectionsSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1).max(500),
});

export const addCopiesSchema = z.object({
  copies: z
    .array(
      z.object({
        printingId: z.uuid(),
        collectionId: z.uuid().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const moveCopiesSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
  toCollectionId: z.uuid(),
});

export const disposeCopiesSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
});

export const copyListMembershipsSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
});

/**
 * Free-form per-deck format config. Each format owns its shape; the schema
 * stays loose because the column is jsonb and validation lives in the route
 * handler (which knows the format). Pass `null` to clear.
 */
const formatConfigSchema = z.record(z.string(), z.unknown()).nullable();

export const createDeckSchema = z.object({
  name: deckFieldRules.name,
  description: z.string().max(2000).nullish(),
  format: deckFieldRules.format,
  formatConfig: formatConfigSchema.optional(),
  isWanted: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

// isPublic is intentionally absent: a deck's public state is controlled only by
// the /decks/{id}/share sub-resource, not by PATCH, so the two can't desync.
export const updateDeckSchema = z.object({
  name: deckFieldRules.name.optional(),
  description: z.string().max(2000).nullish(),
  format: deckFieldRules.format.optional(),
  formatConfig: formatConfigSchema.optional(),
  isWanted: z.boolean().optional(),
});

export const updateDeckCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        cardId: z.uuid(),
        zone: deckCardFieldRules.zone,
        quantity: deckCardFieldRules.quantity,
        preferredPrintingId: z.uuid().nullish(),
      }),
    )
    .max(500),
});

// ---------------------------------------------------------------------------
// Deck plan schema (ADR-029)
// ---------------------------------------------------------------------------

const deckMatchupSwapSchema = z.object({
  cardId: z.uuid(),
  direction: z.enum(["in", "out"]),
  quantity: z.number().int().positive().max(99),
});

const deckMatchupPlanSchema = z.object({
  opponentLegendCardId: z.uuid(),
  subtitle: z.string().max(120).default(""),
  notes: z.string().max(4000).default(""),
  swaps: z.array(deckMatchupSwapSchema).max(40),
});

/** PUT /decks/{id}/plan body — the whole plan, saved as a unit. */
export const updateDeckPlanSchema = z.object({
  generalStrategy: z.string().max(8000).default(""),
  mulliganSplit: z.boolean().default(false),
  mulliganGeneral: z.string().max(4000).default(""),
  mulliganFirst: z.string().max(4000).default(""),
  mulliganSecond: z.string().max(4000).default(""),
  battlefieldGame1CardId: z.uuid().nullable().default(null),
  battlefieldFirstCardId: z.uuid().nullable().default(null),
  battlefieldSecondCardId: z.uuid().nullable().default(null),
  battlefieldCustom: z.boolean().default(false),
  battlefieldNote: z.string().max(4000).default(""),
  matchups: z.array(deckMatchupPlanSchema).max(40),
});

// ---------------------------------------------------------------------------
// Deck import/export schemas
// ---------------------------------------------------------------------------

export const deckExportQuerySchema = z.object({
  format: z.enum(["piltover", "text", "tts"]).default("piltover"),
});

// ---------------------------------------------------------------------------
// List schemas (unified wishlist / tradelist / organize lists)
// ---------------------------------------------------------------------------

export const listIntentQuerySchema = z.object({
  intent: listIntentSchema.optional(),
});

/**
 * `organize` lists never carry trade defaults. The route layer drops these
 * fields when intent === 'organize'; the schema lets clients pass them but the
 * CHECK constraint on the DB also rejects non-null values there.
 */
export const createListSchema = z
  .object({
    name: z.string().min(1).max(200),
    intent: listIntentSchema,
    kind: listKindSchema,
    tradeDefaults: tradePreferenceInputSchema.optional(),
    currency: currencySchema.nullable().optional(),
  })
  .refine((data) => isAllowedIntentKind(data.intent, data.kind), {
    message:
      "Disallowed intent/kind combo. Wish: card|printing. Trade: copy. Organize: card|printing|copy.",
  })
  .refine(
    (data) =>
      data.intent !== "organize" ||
      ((data.tradeDefaults === undefined ||
        (data.tradeDefaults.pricePref === null && data.tradeDefaults.tradeType === null)) &&
        (data.currency === undefined || data.currency === null)),
    { message: "organize lists cannot carry trade defaults or a currency" },
  );

export const updateListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tradeDefaults: tradePreferenceInputSchema.optional(),
  currency: currencySchema.nullable().optional(),
});

/**
 * Bulk reorder for the user's lists in a single intent bucket. The server
 * re-numbers `sort_order` so the rows appear in the order given on the next
 * fetch. Sidebar groups lists by intent, so reorder is bucket-scoped.
 */
export const reorderListsSchema = z.object({
  intent: listIntentSchema,
  orderedIds: z.array(z.uuid()).min(1).max(500),
});

/**
 * Exactly one of cardId / printingId / copyId must be set. The parent list's
 * kind determines which one is required — the route handler validates the
 * match.
 * @returns True when exactly one target is provided.
 */
const oneListEntryTarget = (data: {
  cardId?: string | undefined;
  printingId?: string | undefined;
  copyId?: string | undefined;
}) =>
  Number(Boolean(data.cardId)) + Number(Boolean(data.printingId)) + Number(Boolean(data.copyId)) ===
  1;

const listEntryInputShape = {
  cardId: z.uuid().optional(),
  printingId: z.uuid().optional(),
  copyId: z.uuid().optional(),
  quantity: listEntryFieldRules.quantity.default(1),
  tradeOverride: tradePreferenceInputSchema.default(emptyTradePreference),
};

export const createListEntrySchema = z.object(listEntryInputShape).refine(oneListEntryTarget, {
  message: "Exactly one of cardId, printingId, or copyId must be provided",
});

export const updateListEntrySchema = z.object({
  quantity: listEntryFieldRules.quantity.optional(),
  tradeOverride: tradePreferenceInputSchema.optional(),
});

export const bulkCreateListEntriesSchema = z.object({
  entries: z
    .array(
      z.object(listEntryInputShape).refine(oneListEntryTarget, {
        message: "Exactly one of cardId, printingId, or copyId must be provided",
      }),
    )
    .min(1)
    .max(500),
});

/**
 * Drag-from-collections sugar. The user picks copies and drops them on a list
 * in the sidebar; the server derives the right entry shape based on the
 * list's kind (card / printing / copy) and bulk-inserts the deduped result.
 */
export const bulkAddCopiesToListSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
});

/**
 * Move entries from one list to another. The destination must have the same
 * `kind` and `intent` as the source — different `kind` would reshape every
 * entry, different `intent` would silently re-purpose them.
 */
export const moveListEntriesSchema = z.object({
  toListId: z.uuid(),
  entryIds: z.array(z.uuid()).min(1).max(500),
});

/** Bulk-remove entries from a list. Scoped to the list + owner server-side. */
export const bulkDeleteListEntriesSchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(500),
});

const marketplaceEnum = z.enum(["tcgplayer", "cardmarket", "cardtrader"]);

const themeEnum = z.enum(["light", "dark", "auto"]);

const paletteEnum = z.enum(["default", "minimal"]);

const defaultCardViewEnum = z.enum(["cards", "printings"]);

// ---------------------------------------------------------------------------
// Friend groups (ADR-013)
// ---------------------------------------------------------------------------

const friendGroupSlugSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9-]+$/u, "Slug must be lowercase letters, digits, or dashes");

/**
 * Slugs that collide with app-level routes or obvious squat targets. Mirrored
 * in the route layer for a clean 400 before the DB rejects.
 */
export const RESERVED_FRIEND_GROUP_SLUGS = new Set(["new", "join", "create", "settings", "admin"]);

export const createFriendGroupSchema = z
  .object({
    slug: friendGroupSlugSchema,
    name: z.string().min(1).max(60),
    description: z.string().max(500).nullable().optional(),
    /** `true` (default) generates a join code; `false` creates an invite-only group. */
    generateCode: z.boolean().default(true),
  })
  .refine((data) => !RESERVED_FRIEND_GROUP_SLUGS.has(data.slug), {
    message: "Slug is reserved",
    path: ["slug"],
  });

export const updateFriendGroupSchema = z
  .object({
    slug: friendGroupSlugSchema.optional(),
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine((data) => data.slug === undefined || !RESERVED_FRIEND_GROUP_SLUGS.has(data.slug), {
    message: "Slug is reserved",
    path: ["slug"],
  });

export const friendGroupSlugParamSchema = z.object({ slug: friendGroupSlugSchema });

export const friendGroupCodeQuerySchema = z.object({
  code: z.string().min(8).max(64),
});

export const friendGroupJoinByCodeSchema = z.object({
  code: z.string().min(8).max(64),
});

export const friendGroupInviteByEmailSchema = z.object({
  email: z.email().max(320),
});

export const friendGroupUpdateRoleSchema = z.object({
  role: z.enum(["admin", "judge", "member"]),
});

export const friendGroupUpdateNicknameSchema = z.object({
  nickname: z.string().max(80).nullable(),
});

export const friendGroupTransferOwnershipSchema = z.object({
  userId: z.string().min(1),
});

export const friendGroupShareListSchema = z.object({
  listId: z.uuid(),
});

export const friendGroupShareCollectionSchema = z.object({
  collectionId: z.uuid(),
});

export const friendGroupSlugAndUserParamSchema = z.object({
  slug: friendGroupSlugSchema,
  userId: z.string().min(1),
});

export const friendGroupSlugAndListIdParamSchema = z.object({
  slug: friendGroupSlugSchema,
  listId: z.uuid(),
});

export const friendGroupSlugAndCollectionIdParamSchema = z.object({
  slug: friendGroupSlugSchema,
  collectionId: z.uuid(),
});

// Mirrors CompletionScopePreference (types/api/preferences.ts) and the read-side
// completionScopePreferenceSchema in response-schemas.ts. Previously absent here,
// so the web's completionScope PATCH was silently stripped and never persisted.
const completionScopeWriteSchema = z.object({
  sets: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  rarities: z.array(z.string()).optional(),
  finishes: z.array(z.string()).optional(),
  artVariants: z.array(z.string()).optional(),
  promos: z.enum(["only", "exclude"]).optional(),
  signed: z.boolean().optional(),
  banned: z.boolean().optional(),
  errata: z.boolean().optional(),
});

// ─── Card trades (ADR-019) ───────────────────────────────────────────────────

export const CARD_TRADE_STATUSES = [
  "pending",
  "reserved",
  "completed",
  "declined",
  "cancelled",
  "expired",
] as const;

const cardTradeStatusSchema = z.enum(CARD_TRADE_STATUSES);

/**
 * Create a trade from a match row. `role` is the *caller's* side: `receiver`
 * is the "I want this card" request (giver = counterparty), `giver` is the
 * "I have this, want it?" offer (receiver = counterparty).
 */
export const createCardTradeSchema = z.object({
  groupSlug: friendGroupSlugSchema,
  counterpartyUserId: z.string().min(1),
  role: z.enum(["giver", "receiver"]),
  printingId: z.uuid(),
  quantity: z.number().int().min(1),
});

export const cardTradesQuerySchema = z.object({
  groupId: z.uuid().optional(),
  status: cardTradeStatusSchema.optional(),
});

/** Receiver-sync target collection; omitted defaults to the receiver's inbox. */
export const cardTradeSyncSchema = z.object({
  targetCollectionId: z.uuid().optional(),
});

export const updatePreferencesSchema = z.object({
  showImages: z.boolean().nullable().optional(),
  fancyFan: z.boolean().nullable().optional(),
  foilEffect: z.boolean().nullable().optional(),
  cardTilt: z.boolean().nullable().optional(),
  theme: themeEnum.nullable().optional(),
  palette: paletteEnum.nullable().optional(),
  marketplaceOrder: z
    .array(marketplaceEnum)
    .max(3)
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate marketplaces" })
    .nullable()
    .optional(),
  languages: z
    .array(z.string().min(1).max(5))
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate languages" })
    .nullable()
    .optional(),
  completionScope: completionScopeWriteSchema.nullable().optional(),
  defaultCardView: defaultCardViewEnum.nullable().optional(),
  defaultCurrency: currencySchema.nullable().optional(),
  hiddenFilterSections: z
    .array(z.string().min(1).max(40))
    .max(40)
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate filter sections" })
    .nullable()
    .optional(),
});

// ─── Pod tournaments (ADR-022) ───────────────────────────────────────────────
// Tournaments are identified by their uuidv7 `id`; there are no user-defined slugs.

export const createPodTournamentSchema = z.object({
  name: z.string().min(1).max(120),
});

export const updatePodTournamentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(["running", "completed"]).optional(),
  scoringScheme: z.enum(["standard", "three_pod_reduced"]).optional(),
});

export const podTournamentIdParamSchema = z.object({ id: z.uuid() });

export const podRoundNumberParamSchema = z.object({
  id: z.uuid(),
  roundNumber: z.coerce.number().int().positive(),
});

/**
 * Pair the next round. `byes` lists active players the organizer is sitting out
 * this round (manual byes); the rest are paired. Used to resolve an otherwise
 * unrepresentable field (1, 2, or 5 active players) or to sit a leaver out.
 */
export const generatePodRoundSchema = z.object({
  byes: z.array(z.uuid()).default([]),
});

/**
 * A manual whole-round pairing edit: the new pods plus the players sitting out.
 * The server validates pod sizes (3 or 4), full coverage of the round's players,
 * and that byes are active, then recomputes the penalty.
 */
export const replacePodPairingSchema = z.object({
  pods: z
    .array(
      z.object({
        size: z.union([z.literal(3), z.literal(4)]),
        playerIds: z.array(z.uuid()),
      }),
    )
    .min(0),
  byes: z.array(z.uuid()),
});

export const addPodPlayerSchema = z.object({
  displayName: z.string().min(1).max(80),
});

export const updatePodPlayerSchema = z.object({
  displayName: z.string().min(1).max(80),
});

/**
 * One pod's result: a placement per member. Each `placement` is a 1-based slot
 * within the pod size (ties share a value); points are derived by the server, so
 * they are never sent. The server validates the player set and the 1..podSize
 * range against the pod.
 */
export const podResultSchema = z.object({
  placements: z
    .array(
      z.object({
        playerId: z.uuid(),
        placement: z.number().int().min(1).max(4),
      }),
    )
    .min(3)
    .max(4),
});

export const podReportTokenParamSchema = z.object({
  token: z.string().min(1).max(64),
});

// ─── Deck check (ADR-025) ─────────────────────────────────────────────────────

export const DECK_CHECK_MAX_ENTRIES_PER_PUSH = 500;
export const DECK_CHECK_MAX_CARD_LINES_PER_ENTRY = 200;

const deckCheckIngestCardSchema = z.object({
  name: z.string().min(1).max(300),
  quantity: z.number().int().min(1).max(99),
  section: z.string().min(1).max(50),
});

const deckCheckIngestEntrySchema = z.object({
  externalId: z.string().min(1).max(200),
  playerName: z.string().min(1).max(120),
  playerEmail: z.string().max(254).nullish(),
  riotId: z.string().max(120).nullish(),
  submittedAt: z.iso.datetime({ offset: true }).nullish(),
  /** Consent for the organizer to publish the deck list publicly; omitted = keep stored (true on first insert). */
  allowDeckPublishing: z.boolean().optional(),
  /** Consent to show the player's name on public platforms; omitted = keep stored (true on first insert). */
  allowNameSharing: z.boolean().optional(),
  /** Consent to show the player's Riot ID on public platforms; omitted = keep stored (true on first insert). */
  allowRiotIdSharing: z.boolean().optional(),
  /** Soft-withdraws the entry; a later push without the flag restores it. */
  withdrawn: z.boolean().optional(),
  cards: z.array(deckCheckIngestCardSchema).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY).default([]),
});

/**
 * The provider push payload. Pushes never create events: `eventId` must be an
 * existing event (created in OpenRift) inside the key's group. Partial
 * semantics: entries absent from a push are untouched; withdrawal is the
 * explicit per-entry flag, never an omission.
 */
export const deckCheckIngestSchema = z.object({
  eventId: z.uuid(),
  entries: z.array(deckCheckIngestEntrySchema).max(DECK_CHECK_MAX_ENTRIES_PER_PUSH).default([]),
});

export const createDeckCheckEventSchema = z.object({
  name: z.string().min(1).max(120),
  eventDate: z.iso.date().nullish(),
  format: z.string().min(1).max(60).nullish(),
  allowedSets: z.array(z.string().min(1).max(20)).max(50).nullish(),
});

export const updateDeckCheckEventSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  eventDate: z.iso.date().nullish(),
  format: z.string().min(1).max(60).nullish(),
  allowedSets: z.array(z.string().min(1).max(20)).max(50).nullish(),
  status: z.enum(["active", "archived"]).optional(),
  /** When a submitted list locks against player changes (TR 401.3, ADR-027). */
  listLockMode: z.enum(["on_submit", "at_deadline"]).optional(),
  /** Player self-submission opt-in (ADR-026); enabling mints a token server-side. */
  allowSelfSubmission: z.boolean().optional(),
  submissionsCloseAt: z.iso.datetime({ offset: true }).nullish(),
});

/**
 * A judge moving an entry through the lifecycle (ADR-027). The service
 * validates the transition matrix; `reviewOutcome` is required when targeting
 * `checked`, marks a rejection when targeting `editable`, and records an
 * in-place issue when "targeting" `submitted` from `submitted` (for unclaimed
 * entries). `withdrawn` pulls the entry from the event (mirroring the
 * provider's withdrawal flag); targeting `submitted` from `withdrawn`
 * restores it.
 */
export const deckCheckEntryStateChangeSchema = z.object({
  state: z.enum(["editable", "submitted", "approved", "checked", "withdrawn"]),
  reviewOutcome: z.enum(["ok", "issue"]).nullish(),
  notes: z.string().max(4000).nullish(),
  /** Optional player-facing message stored alongside the transition. */
  playerMessage: z.string().max(2000).nullish(),
});

export const updateDeckCheckEntrySchema = z.object({
  playerName: z.string().min(1).max(120).optional(),
  playerEmail: z.string().max(254).nullish(),
  riotId: z.string().max(120).nullish(),
  /** Judge-authored message shown to the linked player (ADR-026). */
  playerMessage: z.string().max(2000).nullish(),
  /** Consent for the organizer to publish the deck list publicly. */
  allowDeckPublishing: z.boolean().optional(),
  /** Consent to show the player's name on public platforms. */
  allowNameSharing: z.boolean().optional(),
  /** Consent to show the player's Riot ID on public platforms. */
  allowRiotIdSharing: z.boolean().optional(),
});

export const updateDeckCheckCardSchema = z.object({
  name: z.string().min(1).max(300),
  /**
   * Optional zone correction. A provider's free-text section string, mapped to a
   * deck zone server-side exactly like an added card; omitted leaves the zone as-is.
   */
  section: z.string().min(1).max(50).optional(),
  /**
   * How many copies to move when `section` changes the zone. Omitted (or >= the
   * line's quantity) moves the whole line; fewer splits it, leaving the rest in
   * place. Ignored without a zone change.
   */
  copies: z.number().int().min(1).max(99).optional(),
});

export const addDeckCheckCardSchema = z.object({
  name: z.string().min(1).max(300),
  quantity: z.number().int().min(1).max(99),
  section: z.string().min(1).max(50),
});

/**
 * A judge confirming which of the suggested zone corrections to apply. The
 * server re-derives the target zone for each id, so the body only names the
 * cards to move, never the destination — a deliberately mis-zoned card simply
 * gets left out of the list.
 */
export const applyDeckCheckZoneFixesSchema = z.object({
  cardIds: z.array(z.string()).min(1).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY),
});

/**
 * A judge hand-creating an entrant when the organizer push isn't available.
 * The server stamps a `manual:`-prefixed external id and resolves the cards the
 * same way a push would.
 */
export const createDeckCheckEntrySchema = z.object({
  playerName: z.string().min(1).max(120),
  playerEmail: z.string().max(254).nullish(),
  riotId: z.string().max(120).nullish(),
  cards: z.array(addDeckCheckCardSchema).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY).default([]),
});

export const deckCheckTickSchema = z.object({
  /** 0-based physical copy within the card line. */
  copyIndex: z.number().int().min(0).max(98),
  found: z.boolean(),
});

export const mintDeckCheckKeySchema = z.object({
  label: z.string().min(1).max(120),
});

export const updateDeckCheckKeySchema = z.object({
  label: z.string().min(1).max(120),
});

export const deckCheckEventParamSchema = z.object({
  slug: friendGroupSlugSchema,
  eventId: z.uuid(),
});

export const deckCheckEntryParamSchema = z.object({
  slug: friendGroupSlugSchema,
  eventId: z.uuid(),
  entryId: z.uuid(),
});

export const deckCheckEntryCardParamSchema = z.object({
  slug: friendGroupSlugSchema,
  eventId: z.uuid(),
  entryId: z.uuid(),
  cardId: z.uuid(),
});

export const deckCheckCardCopyParamSchema = z.object({
  slug: friendGroupSlugSchema,
  eventId: z.uuid(),
  entryId: z.uuid(),
  cardId: z.uuid(),
  copyIndex: z.coerce.number().int().min(0).max(98),
});

export const deckCheckKeyParamSchema = z.object({
  slug: friendGroupSlugSchema,
  keyId: z.uuid(),
});

// ─── Deck check player self-service (ADR-026) ────────────────────────────────

/** Judge linking an entry to an OpenRift account. */
export const deckCheckLinkSchema = z.object({
  userId: z.string().min(1).max(64),
});

/** Judge account search for the manual link; exact email or name prefix. */
export const deckCheckAccountSearchSchema = z.object({
  q: z.string().min(2).max(254),
});

export const deckCheckSubmissionTokenParamSchema = z.object({
  token: z.string().min(1).max(64),
});

export const deckCheckClaimTokenParamSchema = z.object({
  token: z.string().min(1).max(64),
});

export const playerDeckCheckEntryParamSchema = z.object({
  entryId: z.uuid(),
});

/**
 * A player submission or list edit: exactly one of an own deck's id, a pasted
 * deck code, or pre-parsed card lines from a pasted text list (the same shape
 * the manual judge entry sends). `dryRun` previews the resolved lines and
 * advisory legality findings without writing anything.
 */
export const playerDeckCheckSubmissionSchema = z
  .object({
    deckId: z.uuid().optional(),
    deckCode: z.string().min(1).max(4000).optional(),
    cards: z
      .array(addDeckCheckCardSchema)
      .min(1)
      .max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY)
      .optional(),
    /** Consent for the organizer to publish the deck list publicly; omitted = keep stored (true on first submit). */
    allowDeckPublishing: z.boolean().optional(),
    /** Consent to show the player's name on public platforms; omitted = keep stored (true on first submit). */
    allowNameSharing: z.boolean().optional(),
    /** Consent to show the player's Riot ID on public platforms; omitted = keep stored (true on first submit). */
    allowRiotIdSharing: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .refine(
    (value) =>
      [value.deckId, value.deckCode, value.cards].filter((source) => source !== undefined)
        .length === 1,
    { message: "Provide exactly one of deckId, deckCode, or cards" },
  );
