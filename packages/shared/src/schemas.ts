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
  role: z.enum(["admin", "member"]),
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
});
