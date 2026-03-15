/**
 * Match a request Origin against the allowed origins string.
 * Supports comma-separated origins and wildcard subdomains
 * (e.g. "https://openrift.app,https://*.workers.dev").
 *
 * @returns The origin if allowed, undefined otherwise.
 */
export function matchOrigin(origin: string, allowed?: string): string | undefined {
  if (!allowed || allowed === "*") {
    return origin;
  }
  const patterns = allowed.split(",").map((s) => s.trim());
  for (const pattern of patterns) {
    if (pattern === origin) {
      return origin;
    }
    if (pattern.includes("*")) {
      const regex = new RegExp(
        `^${pattern.replaceAll(".", String.raw`\.`).replaceAll("*", "[^.]+")}$`,
      );
      if (regex.test(origin)) {
        return origin;
      }
    }
  }
  return undefined;
}
