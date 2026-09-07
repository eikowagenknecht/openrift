/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { metaScopeSearchSchema } from "@/lib/meta-scope";

// Schema only, no logic: a route's non-lazy `*.tsx` runs on every page load, so
// anything this module pulls in lands in the startup bundle of every route.
// `meta-legend-page` reaches `lib/country`, which builds an `Intl.DisplayNames`
// at module scope.

const META_LEGEND_INDEX_SORTS = ["name", "best", "decklists", "finishes"] as const;

export type MetaLegendIndexSort = (typeof META_LEGEND_INDEX_SORTS)[number];

export type MetaLegendIndexSortDirection = "asc" | "desc";

export const DEFAULT_LEGEND_SORT: MetaLegendIndexSort = "name";
export const DEFAULT_LEGEND_DIRECTION: MetaLegendIndexSortDirection = "asc";

/** Named `by`, not `sort`: the router unions every route's search schema, and a `sort` key here breaks other routes' search reducers. */
export const metaLegendsSearchSchema = metaScopeSearchSchema.extend({
  q: z.string().optional().catch(undefined),
  by: z.enum(META_LEGEND_INDEX_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
});

/** The legend page adds no params of its own; the Best/All toggle is a view of the scope, not a second address. */
export { metaScopeSearchSchema as metaLegendSearchSchema } from "@/lib/meta-scope";
