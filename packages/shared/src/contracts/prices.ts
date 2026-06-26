import { oc } from "@orpc/contract";
import { z } from "zod";

import { TIME_RANGE_DAYS } from "../index.js";
import type { TimeRange } from "../index.js";
import {
  marketplaceInfoResponseSchema,
  priceHistoryResponseSchema,
  pricesResponseSchema,
} from "../response-schemas.js";

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
    const uuid = z.string().uuid();
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
 * oRPC contract for the public price reads. All three are public GETs with a
 * short-TTL edge cache (the mount keeps the Hono `etag()` middleware). The
 * history endpoint reports an unknown printing as `available: false` (200), not
 * a 404, so the frontend renders an empty state without error handling.
 */
export const pricesContract = {
  prices: oc
    .route({ method: "GET", path: "/api/v1/prices", tags: [TAG] })
    .meta({ auth: "public" })
    .output(pricesResponseSchema),

  // The static `marketplace-info` is declared before `:printingId/history` so
  // the oRPC router resolves it ahead of the param route.
  marketplaceInfo: oc
    .route({ method: "GET", path: "/api/v1/prices/marketplace-info", tags: [TAG] })
    .meta({ auth: "public" })
    .input(marketplaceInfoQuerySchema)
    .output(marketplaceInfoResponseSchema),

  history: oc
    .route({ method: "GET", path: "/api/v1/prices/{printingId}/history", tags: [TAG] })
    .meta({ auth: "public" })
    .input(rangeQuerySchema.extend({ printingId: z.uuid() }))
    .output(priceHistoryResponseSchema),
};

export type PricesContract = typeof pricesContract;
