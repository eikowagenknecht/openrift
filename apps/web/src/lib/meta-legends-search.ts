/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

// Schema only, no logic: a route's non-lazy `*.tsx` runs on every page load, so
// anything this module pulls in lands in the startup bundle of every route.
// `meta-legend-page` reaches `lib/country`, which builds an `Intl.DisplayNames`
// at module scope.

export const metaLegendsSearchSchema = z.object({
  /** Free text, matched against the legend's champion-led name. */
  q: z.string().optional().catch(undefined),
});

/**
 * One legend's page carries the archive-wide scope and nothing of its own: which
 * slice of its record to show is a scope question, and the Best/All toggle is a
 * view of whatever that scope left rather than a second address.
 */
export { metaScopeSearchSchema as metaLegendSearchSchema } from "@/lib/meta-scope";
