/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { metaScopeSearchSchema } from "@/lib/meta-scope";

// Schema only, no logic: a route's non-lazy `*.tsx` runs on every page load, so
// anything this module pulls in lands in the startup bundle of every route.
// `meta-legend-page` reaches `lib/country`, which builds an `Intl.DisplayNames`
// at module scope.

/** The columns the legend index can be ordered by. */
const META_LEGEND_INDEX_SORTS = ["name", "best", "decklists", "finishes"] as const;

export type MetaLegendIndexSort = (typeof META_LEGEND_INDEX_SORTS)[number];

export type MetaLegendIndexSortDirection = "asc" | "desc";

export const DEFAULT_LEGEND_SORT: MetaLegendIndexSort = "name";
export const DEFAULT_LEGEND_DIRECTION: MetaLegendIndexSortDirection = "asc";

/**
 * The index's own params on top of the shared scope. The sort column is `by`
 * rather than `sort` for the same reason as the tournament index: the router
 * unions every route's search schema, and a second set of values under the
 * catalog's `sort` key widens that union and breaks the search reducers of
 * every route that narrows it back.
 */
export const metaLegendsSearchSchema = metaScopeSearchSchema.extend({
  /** Free text, matched against the legend's champion-led name. */
  q: z.string().optional().catch(undefined),
  by: z.enum(META_LEGEND_INDEX_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
});

/**
 * One legend's page carries the archive-wide scope and nothing of its own: which
 * slice of its record to show is a scope question, and the Best/All toggle is a
 * view of whatever that scope left rather than a second address.
 */
export { metaScopeSearchSchema as metaLegendSearchSchema } from "@/lib/meta-scope";
