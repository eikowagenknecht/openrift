/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { metaScopeSearchSchema } from "@/lib/meta-scope";

// Schema only, no logic: a route's non-lazy `*.tsx` runs on every page load, so
// anything this module pulls in lands in the startup bundle of every route.
// `meta-events-index` reaches `lib/country`, which builds an `Intl.DisplayNames`
// at module scope.

const META_EVENT_INDEX_SORTS = ["date", "name", "tier", "country", "players", "decks"] as const;

export type MetaEventIndexSort = (typeof META_EVENT_INDEX_SORTS)[number];

export type MetaEventIndexSortDirection = "asc" | "desc";

export const META_EVENT_HOLDINGS = ["decks", "standings", "upcoming"] as const;

export type MetaEventHoldings = (typeof META_EVENT_HOLDINGS)[number];

export const DEFAULT_EVENT_SORT: MetaEventIndexSort = "date";
export const DEFAULT_EVENT_DIRECTION: MetaEventIndexSortDirection = "desc";

/**
 * Every field `.catch`es to undefined, so a stale bookmark drops the bad value and the route doesn't crash.
 * Named `by`, not `sort`: the router unions every route's search schema, and a `sort` key here would break other routes' search reducers.
 */
export const metaEventsSearchSchema = metaScopeSearchSchema.extend({
  q: z.string().optional().catch(undefined),
  holds: z.enum(META_EVENT_HOLDINGS).optional().catch(undefined),
  by: z.enum(META_EVENT_INDEX_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
});
