// Schema only, no logic: a route's non-lazy `*.tsx` runs on every page load, so
// anything this module pulls in lands in the startup bundle of every route.

export { metaScopeSearchSchema as metaPlayerSearchSchema } from "@/lib/meta-scope";
