import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { TIME_RANGE_DAYS } from "../index.js";
import type { TimeRange } from "../index.js";

extendZodWithOpenApi(z);

// Integer cents in each marketplace's own currency (tcgplayer=USD, cardmarket/cardtrader=EUR, see MARKETPLACE_CURRENCY).
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

const staleAgeMapSchema = z.object({
  tcgplayer: z.number().int().optional().openapi({ example: 29, description: "Days since seen" }),
  cardmarket: z.number().int().optional().openapi({ example: 29, description: "Days since seen" }),
  cardtrader: z.number().int().optional().openapi({ example: 29, description: "Days since seen" }),
});

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
    currencies: marketplaceCurrenciesSchema,
    stale: z.record(z.string(), staleAgeMapSchema).openapi({
      example: { "019cfc3b-03d3-7dac-86c9-27900cd43727": { cardtrader: 29 } },
    }),
  })
  .openapi("PricesResponse");

export const tcgplayerSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), USD" }),
  market: z.number().int().openapi({ example: 452, description: "Integer cents (USD)" }),
  low: z.number().int().nullable().openapi({ example: 325, description: "Integer cents (USD)" }),
});

export const cardmarketSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), EUR" }),
  market: z.number().int().openapi({ example: 380, description: "Integer cents (EUR)" }),
  low: z.number().int().nullable().openapi({ example: 250, description: "Integer cents (EUR)" }),
});

export const cardtraderSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), EUR" }),
  zeroLow: z
    .number()
    .int()
    .nullable()
    .openapi({ example: 420, description: "Integer cents (EUR)" }),
  low: z.number().int().nullable().openapi({ example: 390, description: "Integer cents (EUR)" }),
});

export const marketplaceInfoSchema = z.object({
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

// Mirrors the API-side `marketplaceInfoQuerySchema`; keep the two in sync.
const marketplaceInfoQuerySchema = z.object({
  printings: z.string().transform((value, ctx) => {
    const ids = value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      ctx.addIssue({ code: "custom", message: "printings must not be empty" });
      return z.NEVER;
    }
    if (ids.length > MARKETPLACE_INFO_MAX_PRINTINGS) {
      ctx.addIssue({
        code: "custom",
        message: `printings must be at most ${MARKETPLACE_INFO_MAX_PRINTINGS} ids`,
      });
      return z.NEVER;
    }
    const uuid = z.uuid();
    for (const id of ids) {
      const parsed = uuid.safeParse(id);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: `invalid uuid: ${id}` });
        return z.NEVER;
      }
    }
    return [...new Set(ids)];
  }),
});

/** `history` reports an unknown printing as `available: false` (200), not a 404. */
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
