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

/** Dev-only: never use this to gate production origin checks. */
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
