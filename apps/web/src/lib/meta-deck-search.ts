/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { metaScopeSearchSchema } from "@/lib/meta-scope";

/**
 * Search-param schema for the meta deck browser (ADR-014): the archive-wide
 * scope every page shares, plus the browser's own axes. Every field is optional
 * and `.catch`es to undefined, so a stale bookmark loses the bad value instead
 * of crashing the route.
 */
export const metaDeckSearchSchema = metaScopeSearchSchema.extend({
  /** Event slugs, matched as a union. */
  events: z.array(z.string()).optional().catch(undefined),
  /** Legend card ids, matched as a union. */
  legends: z.array(z.string()).optional().catch(undefined),
  /** The worst finish still shown, as a rank bound (1, 4, 8, 16). */
  finish: z.number().int().positive().optional().catch(undefined),
  /**
   * Opens every archived list. Absent is the curated view — one tile per legend
   * per event — which is what the browser opens on.
   */
  all: z.boolean().optional().catch(undefined),
  /** Currency major units. */
  cost: z.number().nonnegative().optional().catch(undefined),
  side: z.boolean().optional().catch(undefined),
  /** Currency major units. */
  valueMin: z.number().nonnegative().optional().catch(undefined),
  valueMax: z.number().nonnegative().optional().catch(undefined),
});

export type MetaDeckSearch = z.infer<typeof metaDeckSearchSchema>;

/**
 * Search-param schema for the `/meta` front page: the archive-wide scope every
 * page shares, plus the front page's own text search.
 */
export const metaOverviewSearchSchema = metaScopeSearchSchema.extend({
  /** Free text matched against event names, organizers and venues. */
  q: z.string().optional().catch(undefined),
});
