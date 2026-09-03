// Schema only, no logic: a route's non-lazy `*.tsx` runs on every page load, so
// anything this module pulls in lands in the startup bundle of every route.

/**
 * One player's page carries the archive-wide scope and nothing of its own: which
 * slice of their record to show is a scope question, and the Best/All toggle is a
 * view of whatever that scope left rather than a second address.
 */
export { metaScopeSearchSchema as metaPlayerSearchSchema } from "@/lib/meta-scope";
