/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { metaScopeSearchSchema } from "@/lib/meta-scope";

// Schema only, no logic: a route's non-lazy `*.tsx` runs on every page load, so
// anything this module pulls in lands in the startup bundle of every route.
// `meta-events-index` reaches `lib/country`, which builds an `Intl.DisplayNames`
// at module scope.

/** The columns the tournament index can be ordered by. */
export const META_EVENT_INDEX_SORTS = [
  "date",
  "name",
  "tier",
  "country",
  "players",
  "decks",
] as const;

export type MetaEventIndexSort = (typeof META_EVENT_INDEX_SORTS)[number];

export type MetaEventIndexSortDirection = "asc" | "desc";

export const DEFAULT_EVENT_SORT: MetaEventIndexSort = "date";
export const DEFAULT_EVENT_DIRECTION: MetaEventIndexSortDirection = "desc";

/**
 * The index's own params on top of the shared scope. Every field `.catch`es to
 * undefined, so a stale bookmark loses the bad value rather than crashing the
 * route.
 *
 * The sort column is `by` rather than `sort`: the router unions every route's
 * search schema, and a second set of values under the catalog's `sort` key
 * widens that union and breaks the search reducers of every route that narrows
 * it back.
 */
export const metaEventsSearchSchema = metaScopeSearchSchema.extend({
  /** Free text, matched against the event name, its organizer and its venue. */
  q: z.string().optional().catch(undefined),
  by: z.enum(META_EVENT_INDEX_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
});

export type MetaEventsSearch = z.infer<typeof metaEventsSearchSchema>;
