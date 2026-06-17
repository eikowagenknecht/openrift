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
        "u",
      );
      if (regex.test(origin)) {
        return origin;
      }
    }
  }
  return undefined;
}

/**
 * True when the origin points at a loopback or private-LAN address (any scheme
 * or port). Used to trust local devices — a phone or tablet on the same Wi-Fi
 * hitting the dev server by its LAN IP — without listing their rotating
 * addresses. Dev-only: never use this to gate production origin checks.
 *
 * @returns Whether the origin's host is localhost or an RFC 1918 private IPv4.
 */
export function isLocalDevOrigin(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  // WHATWG URL keeps the brackets on an IPv6 host (e.g. "[::1]").
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return true;
  }
  // RFC 1918 private IPv4 ranges: 10/8, 172.16–31/12, 192.168/16.
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/u.test(host) ||
    /^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/u.test(host)
  );
}
