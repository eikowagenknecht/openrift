/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { metaScopeSearchSchema } from "@/features/meta/lib/meta-scope";

const META_DECK_SORTS = ["date", "finish", "value", "cost"] as const;

export type MetaDeckSort = (typeof META_DECK_SORTS)[number];

export type MetaDeckSortDirection = "asc" | "desc";

export const DEFAULT_DECK_SORT: MetaDeckSort = "date";
export const DEFAULT_DECK_DIRECTION: MetaDeckSortDirection = "desc";

export const metaDeckSearchSchema = metaScopeSearchSchema.extend({
  by: z.enum(META_DECK_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  events: z.array(z.string()).optional().catch(undefined),
  legends: z.array(z.string()).optional().catch(undefined),
  /** Rank bound: 1, 4, 8, or 16. */
  finish: z.number().int().positive().optional().catch(undefined),
  /** Absent means the curated view: one tile per legend per event. */
  all: z.boolean().optional().catch(undefined),
  /** Currency major units. */
  cost: z.number().nonnegative().optional().catch(undefined),
  side: z.boolean().optional().catch(undefined),
  /** Currency major units. */
  valueMin: z.number().nonnegative().optional().catch(undefined),
  valueMax: z.number().nonnegative().optional().catch(undefined),
});

export type MetaDeckSearch = z.infer<typeof metaDeckSearchSchema>;

export const metaOverviewSearchSchema = metaScopeSearchSchema.extend({
  q: z.string().optional().catch(undefined),
});
