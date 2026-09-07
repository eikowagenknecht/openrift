// Cacheable responses can outlive a deploy in the browser HTTP cache, so a client
// may parse a body shaped by a different release than the one it was built against.
// Bump this (+1) in the same commit as any cacheable-contract response shape change
// that old and new parsing code cannot both handle. Purely additive fields don't need a bump.
export const API_FORMAT_VERSION = 1;

/** Response header carrying {@link API_FORMAT_VERSION} on cacheable API responses. */
export const API_FORMAT_HEADER = "X-Api-Format";
