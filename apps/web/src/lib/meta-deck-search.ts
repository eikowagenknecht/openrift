/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

/**
 * Search-param schema for the meta deck browser (ADR-014). Mirrors the deck
 * list's conventions: every field is optional and `.catch`es to undefined, so a
 * stale bookmark loses the bad value instead of crashing the route.
 */
export const metaDeckSearchSchema = z.object({
  /** Deck-format slugs, matched as a union. Absent or empty means every format. */
  formats: z.array(z.string()).optional().catch(undefined),
  /** Event slugs, matched as a union. */
  events: z.array(z.string()).optional().catch(undefined),
  /** Legend card ids, matched as a union. */
  legends: z.array(z.string()).optional().catch(undefined),
  /** The worst finish still shown, as a rank bound (1, 4, 8, 16). */
  finish: z.number().int().positive().optional().catch(undefined),
  /** Inclusive event-date bounds, as date-only strings. */
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
});

export type MetaDeckSearch = z.infer<typeof metaDeckSearchSchema>;

/**
 * Search-param schema for the `/meta` overview. The stats endpoint scopes its
 * aggregates server-side, so these three drive the request rather than a
 * client-side narrowing.
 */
export const metaOverviewSearchSchema = z.object({
  format: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
});
