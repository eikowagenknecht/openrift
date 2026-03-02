/**
 * Match a request Origin against the allowed origins string.
 * Supports comma-separated origins and wildcard subdomains
 * (e.g. "https://openrift.app,https://*.workers.dev").
 *
 * Returns the origin if allowed, undefined otherwise.
 */
export function matchOrigin(origin: string, allowed: string | undefined): string | undefined {
  if (!allowed || allowed === "*") return origin;
  const patterns = allowed.split(",").map((s) => s.trim());
  for (const pattern of patterns) {
    if (pattern === origin) return origin;
    if (pattern.includes("*")) {
      const regex = new RegExp(`^${pattern.replace(/\./g, "\\.").replace("*", "[^.]+")}$`);
      if (regex.test(origin)) return origin;
    }
  }
  return undefined;
}
