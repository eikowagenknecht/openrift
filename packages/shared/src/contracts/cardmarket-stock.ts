import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import type { CardmarketStockRow } from "../cardmarket-stock.js";
import { CARDMARKET_UNRESOLVED_REASONS } from "../cardmarket-stock.js";
import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

/** A Cardmarket stock page shows at most 300 articles, so one pull is one page. */
export const CARDMARKET_STOCK_MAX_ROWS = 300;

const MAX_COMMENT_CHARS = 500;

// Annotated so a change to CardmarketStockRow that the schema does not follow
// fails to compile rather than silently dropping a scraped field.
export const cardmarketStockRowSchema: z.ZodType<CardmarketStockRow> = z.object({
  idProduct: z.number().int().positive(),
  isFoil: z.boolean(),
  idLanguage: z.number().int(),
  idCondition: z.number().int(),
  amount: z.number().int().min(0),
  priceCents: z.number().int().min(0),
  comment: z.string().max(MAX_COMMENT_CHARS),
  isSigned: z.boolean(),
  isAltered: z.boolean(),
});

export const cardmarketStockResolveInputSchema = z.object({
  rows: z.array(cardmarketStockRowSchema).min(1).max(CARDMARKET_STOCK_MAX_ROWS),
});

export const cardmarketStockResolveResponseSchema = z
  .object({
    resolved: z.array(
      z.object({
        idProduct: z.number().int(),
        isFoil: z.boolean(),
        amount: z.number().int(),
        priceCents: z.number().int(),
        comment: z.string(),
        isSigned: z.boolean(),
        isAltered: z.boolean(),
        printingId: z.uuid(),
        conditionSlug: z.string().openapi({ example: "near-mint" }),
        language: z.string().openapi({ example: "EN" }),
      }),
    ),
    unresolved: z.array(
      z.object({
        idProduct: z.number().int(),
        isFoil: z.boolean(),
        amount: z.number().int(),
        reason: z.enum(CARDMARKET_UNRESOLVED_REASONS),
        productName: z.string().nullable(),
        languageName: z.string().nullable().openapi({ example: "German" }),
      }),
    ),
  })
  .openapi("CardmarketStockResolution");

export const cardmarketStockContract = {
  resolve: authedRoute
    .route({
      method: "POST",
      path: "/api/v1/cardmarket/stock/resolve",
      tags: ["Cardmarket Stock"],
    })
    .input(cardmarketStockResolveInputSchema)
    .output(cardmarketStockResolveResponseSchema),
};

export type CardmarketStockContract = typeof cardmarketStockContract;
