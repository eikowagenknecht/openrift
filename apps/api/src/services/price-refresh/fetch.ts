import type { Fetch } from "../../io.js";

const TIMEOUT_MS = 10_000;

/**
 * Fetch JSON from a URL and return the parsed body along with the `Last-Modified`
 * header (used as `recorded_at` for price snapshots). Throws on non-2xx responses.
 * @returns The parsed JSON body and the `Last-Modified` date (if present).
 */
export async function fetchJson<T>(
  fetchFn: Fetch,
  url: string,
  headers?: Record<string, string>,
): Promise<{ data: T; lastModified: Date | null }> {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  const lm = res.headers.get("last-modified");
  const lastModified = lm ? new Date(lm) : null;
  return { data: await (res.json() as Promise<T>), lastModified };
}
