import { z } from "zod";

// Re-exported so contracts can import the card-filter predicate schema from the
// conventional `@openrift/shared/schemas` entry point. Defined in types/search.ts
// alongside the `CardFilters` type it backs (ADR-034).
export { cardFiltersSchema } from "./types/search.js";
// List-rule schema (ADR-034), defined alongside its inferred type.
export { listRuleSchema, listRulesSchema } from "./types/list-rule.js";

export const listEntryFieldRules = {
  quantity: z.number().int().positive(),
};

// Trade preferences (ADR-017) -------------------------------------------------

const tradePricePrefSchema = z.enum(["cm_lowest", "tcg_lowest", "ct_zero", "absolute"]);
const tradeTypeSchema = z.enum(["cards", "money", "both"]);
export const currencySchema = z.enum(["EUR", "USD"]);

/**
 * Triple stored on either a list (defaults) or an entry (override). All fields
 * are independently nullable; the DB enforces `(pricePref = 'absolute') ↔
 * (priceAbsoluteCents IS NOT NULL)`.
 */
export const tradePreferenceInputSchema = z
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

// ---------------------------------------------------------------------------
// Shared serialization primitives
// ---------------------------------------------------------------------------

/**
 * A PostgreSQL `timestamptz` value serialized to an ISO 8601 date-time string
 * (e.g. `"2026-06-26T12:00:00.000Z"`), the shape produced by `Date.toISOString()`.
 *
 * JSON has no `Date` type, so in OpenAPI mode timestamps cross the wire as
 * strings. Using this instead of bare `z.string()` makes the generated OpenAPI
 * spec carry `format: date-time` (so Swagger documents it and Schemathesis fuzzes
 * it as a date), while the inferred TypeScript type stays `string`. Revive to a
 * `Date` at the client boundary (a TanStack Query `select`), not in the schema —
 * an output `.transform()` would run server-side and re-serialize to a string.
 */
export const isoDateTime = z.iso.datetime();

/**
 * A PostgreSQL `date` value serialized as a date-only string (`"2026-06-26"`),
 * the shape the postgres driver returns for `date` columns (OID 1082, see
 * `apps/api/src/db/connect.ts`). The OpenAPI counterpart to {@link isoDateTime}
 * for date-only fields; emits `format: date` in the spec.
 */
export const isoDate = z.iso.date();

// ---------------------------------------------------------------------------
// Common param & query schemas (used by zValidator("param"//"query"))
// ---------------------------------------------------------------------------

/**
 * Merge a base param schema (e.g. {@link idParamSchema}) with a route's body or
 * query fields into a single object schema. The extra fields may be given as
 * another object schema or as a raw shape.
 *
 * @returns An object schema combining the base params and the extra fields.
 */
export function withParams<Base extends z.ZodRawShape, Extra extends z.ZodRawShape>(
  base: z.ZodObject<Base>,
  extra: z.ZodObject<Extra> | Extra,
) {
  const extraShape = extra instanceof z.ZodObject ? extra.shape : extra;
  return base.extend(extraShape);
}

export const idParamSchema = z.object({ id: z.uuid() });

export const keyParamSchema = z.object({ key: z.string().min(1) });

export const providerParamSchema = z.object({ provider: z.string().min(1) });

export const marketplaceGroupParamSchema = z.object({
  marketplace: z.string().min(1),
  id: z.coerce.number().int(),
});

export const copiesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  // Hard cap matches the server-side clamp (COPIES_PAGE_MAX = 1000 in
  // repositories/copies.ts). PAG-1 dropped the 10k soft-cap in the route; the
  // schema/OpenAPI doc must advertise the limit the server actually honors.
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Collection tracking schemas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Deck plan schema (ADR-029)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Deck import/export schemas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// List schemas (unified wishlist / tradelist / organize lists)
// ---------------------------------------------------------------------------

/**
 * Exactly one of cardId / printingId / copyId must be set. The parent list's
 * kind determines which one is required — the route handler validates the
 * match.
 * @returns True when exactly one target is provided.
 */
export const oneListEntryTarget = (data: {
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

// Exported so the oRPC lists contract can merge it with the `{id}` path param
// (createListEntrySchema is `.refine()`d at the top level, so it has no
// `.shape` to extend). The route handler re-validates the one-target rule.
export { listEntryInputShape };

export const createListEntrySchema = z.object(listEntryInputShape).refine(oneListEntryTarget, {
  message: "Exactly one of cardId, printingId, or copyId must be provided",
});

/**
 * The set of supported price marketplaces, as a Zod enum. Canonical home —
 * shared by the write-side preference schema below and the admin
 * price/operations contracts
 * (`contracts/admin/{operations,staging-card-overrides,unified-mappings,ignored-products}.ts`),
 * so the enum is defined once. (`ALL_MARKETPLACES` in `types/pricing.ts` is the
 * plain-array counterpart for non-Zod consumers.)
 */
export const marketplaceEnum = z.enum(["tcgplayer", "cardmarket", "cardtrader"]);

// ---------------------------------------------------------------------------
// Friend groups (ADR-013)
// ---------------------------------------------------------------------------

export const friendGroupSlugSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9-]+$/u, "Slug must be lowercase letters, digits, or dashes");

export const friendGroupSlugParamSchema = z.object({ slug: friendGroupSlugSchema });

// ─── Card trades (ADR-019) ───────────────────────────────────────────────────

// ─── Pod tournaments (ADR-022) ───────────────────────────────────────────────
// Tournaments are identified by their uuidv7 `id`; there are no user-defined slugs.

/**
 * One pod's result: the raw game points each member ended on (a Riftbound game
 * is won at 8 points, but overshooting past 8 is allowed). The server derives
 * each player's placement and scheme points from these, so neither is sent. The
 * server validates the player set against the pod.
 */
export const podResultSchema = z.object({
  results: z
    .array(
      z.object({
        playerId: z.uuid(),
        gamePoints: z.number().int().min(0).max(99),
      }),
    )
    .min(3)
    .max(4),
});

export const podReportTokenParamSchema = z.object({
  token: z.string().min(1).max(64),
});

// ─── Deck check (ADR-025) ─────────────────────────────────────────────────────

export const DECK_CHECK_MAX_CARD_LINES_PER_ENTRY = 200;

export const addDeckCheckCardSchema = z.object({
  name: z.string().min(1).max(300),
  quantity: z.number().int().min(1).max(99),
  section: z.string().min(1).max(50),
});

// ─── Deck check player self-service (ADR-026) ────────────────────────────────

export const deckCheckClaimTokenParamSchema = z.object({
  token: z.string().min(1).max(64),
});

/**
 * A player submission or list edit: exactly one of an own deck's id, a pasted
 * deck code, or pre-parsed card lines from a pasted text list (the same shape
 * the manual judge entry sends). `dryRun` previews the resolved lines and
 * advisory legality findings without writing anything.
 */
export const playerDeckCheckSubmissionShape = {
  deckId: z.uuid().optional(),
  deckCode: z.string().min(1).max(4000).optional(),
  cards: z.array(addDeckCheckCardSchema).min(1).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY).optional(),
  /** Consent for the organizer to publish the deck list publicly; omitted = keep stored (true on first submit). */
  allowDeckPublishing: z.boolean().optional(),
  /** Consent to show the player's name on public platforms; omitted = keep stored (true on first submit). */
  allowNameSharing: z.boolean().optional(),
  /** Consent to show the player's Riot ID on public platforms; omitted = keep stored (true on first submit). */
  allowRiotIdSharing: z.boolean().optional(),
  dryRun: z.boolean().optional(),
};

/**
 * Exactly one deck source must be provided.
 * @returns True when exactly one of deckId / deckCode / cards is set.
 */
export const exactlyOneDeckCheckSubmissionSource = (value: {
  deckId?: string | undefined;
  deckCode?: string | undefined;
  cards?: unknown;
}): boolean =>
  [value.deckId, value.deckCode, value.cards].filter((source) => source !== undefined).length === 1;

export const playerDeckCheckSubmissionSchema = z
  .object(playerDeckCheckSubmissionShape)
  .refine(exactlyOneDeckCheckSubmissionSource, {
    message: "Provide exactly one of deckId, deckCode, or cards",
  });
