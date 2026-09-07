import { z } from "zod";

// Re-exported so contracts can import the card-filter predicate schema from the
// conventional `@openrift/shared/schemas` entry point.
export { cardFiltersSchema } from "./types/search.js";
export {
  defaultRuleCombine,
  listRuleCombineSchema,
  listRuleSchema,
  listRulesSchema,
  ruleCombineMatchesKind,
  ruleKindForListKind,
} from "./types/list-rule.js";

export const listEntryFieldRules = {
  quantity: z.number().int().positive(),
};

const tradePricePrefSchema = z.enum(["cm_lowest", "tcg_lowest", "ct_zero", "absolute"]);
const tradeTypeSchema = z.enum(["cards", "money", "both"]);
export const currencySchema = z.enum(["EUR", "USD"]);

/** The DB enforces `(pricePref = 'absolute') ↔ (priceAbsoluteCents IS NOT NULL)`. */
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

/**
 * Revive to `Date` at the client boundary (a TanStack Query `select`), not via
 * an output `.transform()`, which would run server-side and re-serialize to a string.
 */
export const isoDateTime = z.iso.datetime();

export const isoDate = z.iso.date();

/**
 * Merge a base param schema (e.g. {@link idParamSchema}) with a route's body or
 * query fields into a single object schema.
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

/**
 * Either a bare ISO 8601 timestamp (legacy form) or `"<ISO timestamp>_<id>"`,
 * as produced by `buildKeysetCursor`.
 */
export const keysetCursorSchema = z
  .string()
  .min(1)
  .refine(
    (cursor) => {
      const separatorIndex = cursor.indexOf("_");
      const timePart = separatorIndex === -1 ? cursor : cursor.slice(0, separatorIndex);
      const idPart = separatorIndex === -1 ? null : cursor.slice(separatorIndex + 1);
      return isoDateTime.safeParse(timePart).success && idPart !== "";
    },
    { message: 'cursor must be an ISO 8601 timestamp, optionally suffixed with "_<id>"' },
  );

export const copiesQuerySchema = z.object({
  cursor: keysetCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/**
 * Exactly one of cardId / printingId / copyId must be set. The parent list's
 * kind determines which one is required; the route handler validates the match.
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

// Exported so the oRPC lists contract can merge it with the `{id}` path param;
// createListEntrySchema is `.refine()`d at the top level, so it has no `.shape`.
export { listEntryInputShape };

export const createListEntrySchema = z.object(listEntryInputShape).refine(oneListEntryTarget, {
  message: "Exactly one of cardId, printingId, or copyId must be provided",
});

// Defined in types/pricing.ts so the list-rule schema can use it without an
// import cycle.
export { marketplaceEnum } from "./types/pricing.js";

export const friendGroupSlugSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9-]+$/u, "Slug must be lowercase letters, digits, or dashes");

export const friendGroupSlugParamSchema = z.object({ slug: friendGroupSlugSchema });

/** A Riftbound game is won at 8 points, but overshooting is allowed. */
export const podResultSchema = z.object({
  results: z
    .array(
      z.object({
        playerId: z.uuid(),
        gamePoints: z.number().int().min(0).max(99),
      }),
    )
    .min(2)
    .max(4),
});

export const podReportTokenParamSchema = z.object({
  token: z.string().min(1).max(64),
});

export const DECK_CHECK_MAX_CARD_LINES_PER_ENTRY = 200;

export const addDeckCheckCardSchema = z.object({
  name: z.string().min(1).max(300),
  quantity: z.number().int().min(1).max(99),
  section: z.string().min(1).max(50),
});

export const deckCheckClaimTokenParamSchema = z.object({
  token: z.string().min(1).max(64),
});

export const playerDeckCheckSubmissionShape = {
  deckId: z.uuid().optional(),
  deckCode: z.string().min(1).max(4000).optional(),
  cards: z.array(addDeckCheckCardSchema).min(1).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY).optional(),
  allowDeckPublishing: z.boolean().optional(),
  allowNameSharing: z.boolean().optional(),
  allowRiotIdSharing: z.boolean().optional(),
  dryRun: z.boolean().optional(),
};

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
