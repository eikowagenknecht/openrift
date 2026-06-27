import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { TIME_RANGE_DAYS } from "../index.js";
import type { TimeRange } from "../index.js";

extendZodWithOpenApi(z);

// Latest market price per marketplace, as integer cents in that marketplace's
// own currency (tcgplayer=USD, cardmarket=EUR, cardtrader=EUR — see
// MARKETPLACE_CURRENCY). SCH-2: money on the wire is integer cents.
const marketplacePriceMapSchema = z.object({
  tcgplayer: z
    .number()
    .int()
    .optional()
    .openapi({ example: 452, description: "Integer cents (USD)" }),
  cardmarket: z
    .number()
    .int()
    .optional()
    .openapi({ example: 380, description: "Integer cents (EUR)" }),
  cardtrader: z
    .number()
    .int()
    .optional()
    .openapi({ example: 390, description: "Integer cents (EUR)" }),
});

const marketplaceCurrenciesSchema = z
  .object({
    tcgplayer: z.enum(["EUR", "USD"]),
    cardmarket: z.enum(["EUR", "USD"]),
    cardtrader: z.enum(["EUR", "USD"]),
  })
  .openapi({ example: { tcgplayer: "USD", cardmarket: "EUR", cardtrader: "EUR" } });

export const pricesResponseSchema = z
  .object({
    prices: z.record(z.string(), marketplacePriceMapSchema).openapi({
      example: {
        "019cfc3b-03d3-7dac-86c9-27900cd43727": {
          tcgplayer: 452,
          cardmarket: 380,
          cardtrader: 390,
        },
      },
    }),
    // SCH-2: the cents amounts above are explicit about their currency here.
    currencies: marketplaceCurrenciesSchema,
  })
  .openapi("PricesResponse");

// Snapshot money fields are integer cents (SCH-2). `date` is a date-only string
// (YYYY-MM-DD), not an ISO datetime.
const tcgplayerSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), USD" }),
  market: z.number().int().openapi({ example: 452, description: "Integer cents (USD)" }),
  low: z.number().int().nullable().openapi({ example: 325, description: "Integer cents (USD)" }),
});

const cardmarketSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), EUR" }),
  market: z.number().int().openapi({ example: 380, description: "Integer cents (EUR)" }),
  low: z.number().int().nullable().openapi({ example: 250, description: "Integer cents (EUR)" }),
});

const cardtraderSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), EUR" }),
  zeroLow: z
    .number()
    .int()
    .nullable()
    .openapi({ example: 420, description: "Integer cents (EUR)" }),
  low: z.number().int().nullable().openapi({ example: 390, description: "Integer cents (EUR)" }),
});

const marketplaceInfoSchema = z.object({
  available: z.boolean().openapi({ example: true }),
  productId: z.number().nullable().openapi({ example: 582_391 }),
});

const currencyFieldSchema = z.enum(["EUR", "USD"]);

export const priceHistoryResponseSchema = z
  .object({
    tcgplayer: marketplaceInfoSchema.extend({
      currency: currencyFieldSchema,
      snapshots: z.array(tcgplayerSnapshotSchema),
    }),
    cardmarket: marketplaceInfoSchema.extend({
      currency: currencyFieldSchema,
      snapshots: z.array(cardmarketSnapshotSchema),
    }),
    cardtrader: marketplaceInfoSchema.extend({
      currency: currencyFieldSchema,
      snapshots: z.array(cardtraderSnapshotSchema),
    }),
  })
  .openapi("PriceHistoryResponse");

export const marketplaceInfoResponseSchema = z
  .object({
    infos: z
      .record(
        z.string(),
        z.object({
          tcgplayer: marketplaceInfoSchema,
          cardmarket: marketplaceInfoSchema,
          cardtrader: marketplaceInfoSchema,
        }),
      )
      .openapi({
        example: {
          "019cfc3b-03d3-7dac-86c9-27900cd43727": {
            tcgplayer: { available: true, productId: 582_391 },
            cardmarket: { available: true, productId: 748_215 },
            cardtrader: { available: false, productId: null },
          },
        },
      }),
  })
  .openapi("MarketplaceInfoResponse");

const TAG = "Prices";

const MARKETPLACE_INFO_MAX_PRINTINGS = 200;

const rangeQuerySchema = z.object({
  range: z.enum(Object.keys(TIME_RANGE_DAYS) as [TimeRange, ...TimeRange[]]).default("30d"),
});

// Mirrors the API-side `marketplaceInfoQuerySchema`: a comma-separated list of
// printing UUIDs, trimmed + deduped, bounded to a max batch size. Kept in the
// contract so the wire shape is shared by both ends.
const marketplaceInfoQuerySchema = z.object({
  printings: z.string().transform((value, ctx) => {
    const ids = value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "printings must not be empty" });
      return z.NEVER;
    }
    if (ids.length > MARKETPLACE_INFO_MAX_PRINTINGS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `printings must be at most ${MARKETPLACE_INFO_MAX_PRINTINGS} ids`,
      });
      return z.NEVER;
    }
    const uuid = z.uuid();
    for (const id of ids) {
      const parsed = uuid.safeParse(id);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid uuid: ${id}` });
        return z.NEVER;
      }
    }
    return [...new Set(ids)];
  }),
});

/**
 * oRPC contract for the public price reads. All three are public GETs with the
 * long-lived catalog cache + conditional GETs (`cache: "long", etag: true`,
 * applied centrally from this meta). The history endpoint reports an unknown
 * printing as `available: false` (200), not a 404, so the frontend renders an
 * empty state without error handling.
 */
export const pricesContract = {
  prices: oc
    .route({ method: "GET", path: "/api/v1/prices", tags: [TAG] })
    .meta({ auth: "public", cache: "long", etag: true })
    .output(pricesResponseSchema),

  // The static `marketplace-info` is declared before `:printingId/history` so
  // the oRPC router resolves it ahead of the param route.
  marketplaceInfo: oc
    .route({ method: "GET", path: "/api/v1/prices/marketplace-info", tags: [TAG] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(marketplaceInfoQuerySchema)
    .output(marketplaceInfoResponseSchema),

  history: oc
    .route({ method: "GET", path: "/api/v1/prices/{printingId}/history", tags: [TAG] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(rangeQuerySchema.extend({ printingId: z.uuid() }))
    .output(priceHistoryResponseSchema),
};

export type PricesContract = typeof pricesContract;
