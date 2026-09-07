import type { Fetch } from "../../../../io.js";
import { metaSyncUserAgent } from "./user-agent.js";

// Only v2 endpoints are reachable through this client: the legacy endpoints
// hand back players' real names and email addresses. The event detail still
// carries the store's contact address, which the deep fetch strips before
// anything is stored.
export const MAX_PAGE_SIZE = 250;

const REQUEST_SPACING_MS = 600;

const REQUEST_JITTER_MS = 200;

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

/** DRF's page-number envelope. */
export interface UvsPage<T> {
  results: T[];
  count: number;
  nextPage: number | null;
}

export type UvsQuery = Record<string, string | number | boolean | undefined>;

export class UvsHttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string, body: string) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
    this.name = "UvsHttpError";
    this.status = status;
  }
}

export interface UvsClientOptions {
  fetch: Fetch;
  baseUrl: string;
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface UvsClient {
  get: <T>(path: string, query?: UvsQuery) => Promise<T>;
  page: <T>(path: string, query: UvsQuery, page: number, pageSize?: number) => Promise<UvsPage<T>>;
  readonly requests: number;
}

function buildUrl(baseUrl: string, path: string, query: UvsQuery | undefined): string {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// A 5xx or a 429 is the source having a moment; a 404 means the event no
// longer exists, so repeating the request cannot change the answer.
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

async function settled(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // Reported to whoever made that call.
  }
}

function readPage<T>(body: unknown): UvsPage<T> {
  const row = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const results = Array.isArray(row.results) ? (row.results as T[]) : [];
  const count = row.count;
  return {
    results,
    count: typeof count === "number" && Number.isFinite(count) ? count : results.length,
    nextPage: typeof row.next_page_number === "number" ? row.next_page_number : null,
  };
}

// Sequential by construction: every call awaits the previous one's spacing,
// so two concurrent callers still produce one request at a time.
export function createUvsClient(options: UvsClientOptions): UvsClient {
  const baseUrl = options.baseUrl;
  const userAgent = options.userAgent ?? metaSyncUserAgent();
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;

  let requests = 0;
  let lastStartedAt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function pace(): Promise<void> {
    const wait = lastStartedAt + REQUEST_SPACING_MS + random() * REQUEST_JITTER_MS - now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastStartedAt = now();
  }

  async function attempt(url: string): Promise<unknown> {
    for (let tries = 0; ; tries++) {
      if (tries > 0) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (tries - 1) + random() * REQUEST_JITTER_MS);
      }
      await pace();
      requests++;
      const outcome = await attemptOnce(url);
      if ("body" in outcome) {
        return outcome.body;
      }
      if (!outcome.retryable || tries === MAX_ATTEMPTS - 1) {
        throw outcome.error;
      }
    }
  }

  async function attemptOnce(
    url: string,
  ): Promise<{ body: unknown } | { error: Error; retryable: boolean }> {
    try {
      const response = await options.fetch(url, {
        headers: { accept: "application/json", "user-agent": userAgent },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = await response.text();
        return {
          error: new UvsHttpError(response.status, url, body),
          retryable: isRetryableStatus(response.status),
        };
      }
      return { body: await response.json() };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)), retryable: true };
    }
  }

  async function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const previous = queue;
    const current = (async () => {
      await settled(previous);
      return await work();
    })();
    queue = settled(current);
    return await current;
  }

  return {
    get: <T>(path: string, query?: UvsQuery): Promise<T> =>
      enqueue(async () => (await attempt(buildUrl(baseUrl, path, query))) as T),

    page: <T>(path: string, query: UvsQuery, page: number, pageSize = MAX_PAGE_SIZE) =>
      enqueue(async () => {
        const body = await attempt(
          buildUrl(baseUrl, path, { ...query, page, page_size: pageSize }),
        );
        return readPage<T>(body);
      }),

    get requests() {
      return requests;
    },
  };
}
