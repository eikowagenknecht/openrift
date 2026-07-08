// Global format version for the publicly cacheable API payloads.
//
// Cacheable responses (any contract with `cache` in its meta: catalog, prices,
// marketplace-info, price history, landing-summary, cards, sets, rules, init)
// can be replayed from the browser HTTP cache for up to their max-age, and no
// deploy-time purge can reach that copy. When a release changes one of these
// payload shapes, a client built after the change can receive a body cached
// before it, and the other way around for tabs still running the old bundle.
//
// The API stamps every cacheable response with this number (the
// `API_FORMAT_HEADER` response header, apps/api/src/middleware/version-headers.ts)
// and the web client compares it against the value baked into its bundle
// (apps/web/src/lib/stale-bundle.ts):
//
//   - response older than the client: the body predates the client's parsing
//     code, so the fetch is transparently retried once with `cache: "no-store"`.
//   - response newer than the client: the running bundle is stale, so the
//     regular new-version prompt fires instead of a parse error.
//
// Unlike a build id, this value describes the BODY, not the server that sent
// it, so a cached copy stays truthful and matching versions never false-trip
// across deploys (see ADR-016).
//
// BUMP THIS (+1) in the same commit as any change to the response shape of a
// cacheable contract that old and new parsing code cannot both handle. Purely
// additive fields don't need a bump.
export const API_FORMAT_VERSION = 1;

/** Response header carrying {@link API_FORMAT_VERSION} on cacheable API responses. */
export const API_FORMAT_HEADER = "X-Api-Format";
