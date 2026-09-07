import type { Fetch } from "../../../../io.js";
import { metaSyncUserAgent } from "./user-agent.js";

/**
 * The source's WAF answers a burst with an HTML 403 for hours afterwards, so
 * after one patient retry the client latches `blocked` and fails fast.
 */

/**
 * The list endpoints' safe page ceiling: bigger pages return empty. A full
 * page on the event listing means the window was cut short, not exhausted.
 */
export const MAX_PAGE_SIZE = 10_000;

const REQUEST_SPACING_MS = 400;
const REQUEST_JITTER_MS = 200;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const WAF_RETRY_DELAY_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;

export class PlayloltcgBlockedError extends Error {
  constructor(url: string) {
    super(`playloltcg WAF blocked the request: ${url}`);
    this.name = "PlayloltcgBlockedError";
  }
}

/**
 * A 4xx, or a non-zero envelope code: the source answered and said no. Asking
 * again cannot change the answer.
 */
export class PlayloltcgRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayloltcgRefusedError";
  }
}

type PlayloltcgBody = Record<string, unknown>;

/** A list response, normalized across the source's two shapes. */
export interface PlayloltcgList<T> {
  items: T[];
  /** Null when the source answered with a bare array; not the page's own length. */
  total: number | null;
}

export interface PlayloltcgClientOptions {
  fetch: Fetch;
  baseUrl: string;
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

type PlayloltcgQuery = Record<string, string | number>;

export interface PlayloltcgClient {
  /** Returns the unwrapped `result`, whatever its shape. */
  post: <T>(path: string, body: PlayloltcgBody) => Promise<T>;
  /** Normalizes `result` (array or `{list,total}`) into a PlayloltcgList. */
  postList: <T>(path: string, body: PlayloltcgBody) => Promise<PlayloltcgList<T>>;
  get: <T>(path: string, query?: PlayloltcgQuery) => Promise<T>;
  readonly requests: number;
  readonly blocked: boolean;
}

/** The WAF answers a burst with a 403 or an HTML interstitial, never JSON. */
function isWafBlock(status: number, text: string): boolean {
  return status === 403 || text.trimStart().startsWith("<") || text.includes("WAF");
}

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

/** The source's envelope. `code === 0` is success; `result` shape varies by endpoint. */
function unwrap(body: unknown, url: string): unknown {
  const row = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof row.code === "number" && row.code !== 0) {
    const detail =
      typeof row.message === "string" ? row.message : JSON.stringify(row.message ?? "");
    throw new PlayloltcgRefusedError(`playloltcg code ${row.code} for ${url}: ${detail}`);
  }
  return row.result;
}

function asList<T>(result: unknown): PlayloltcgList<T> {
  if (Array.isArray(result)) {
    return { items: result as T[], total: null };
  }
  const row = (typeof result === "object" && result !== null ? result : {}) as Record<
    string,
    unknown
  >;
  const items = Array.isArray(row.list) ? (row.list as T[]) : [];
  const total = typeof row.total === "number" ? row.total : null;
  return { items, total };
}

/** Sequential by construction: every call awaits the previous one's spacing. */
export function createPlayloltcgClient(options: PlayloltcgClientOptions): PlayloltcgClient {
  const baseUrl = options.baseUrl;
  const userAgent = options.userAgent ?? metaSyncUserAgent();
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;

  let requests = 0;
  let blocked = false;
  let lastStartedAt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function pace(): Promise<void> {
    const wait = lastStartedAt + REQUEST_SPACING_MS + random() * REQUEST_JITTER_MS - now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastStartedAt = now();
  }

  async function attempt(url: string, body: PlayloltcgBody | null): Promise<unknown> {
    if (blocked) {
      throw new PlayloltcgBlockedError(url);
    }
    let lastError: Error | null = null;
    let wafTries = 0;
    for (let tries = 0; tries < MAX_ATTEMPTS; tries++) {
      if (tries > 0) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (tries - 1) + random() * REQUEST_JITTER_MS);
      }
      await pace();
      requests++;
      const outcome = await attemptOnce(url, body);
      if ("body" in outcome) {
        return outcome.body;
      }
      lastError = outcome.error;
      if (outcome.waf) {
        // One patient retry, then latch: the refusal holds for hours, so
        // further attempts in this run cannot succeed.
        if (wafTries === 0) {
          wafTries++;
          await sleep(WAF_RETRY_DELAY_MS);
          continue;
        }
        blocked = true;
        throw new PlayloltcgBlockedError(url);
      }
      if (!outcome.retryable) {
        throw lastError;
      }
    }
    throw lastError ?? new Error(`Request failed: ${url}`);
  }

  async function attemptOnce(
    url: string,
    body: PlayloltcgBody | null,
  ): Promise<{ body: unknown } | { error: Error; retryable: boolean; waf: boolean }> {
    try {
      const response = await options.fetch(url, {
        method: body === null ? "GET" : "POST",
        headers: {
          ...(body === null ? {} : { "content-type": "application/json" }),
          accept: "application/json",
          "user-agent": userAgent,
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      if (isWafBlock(response.status, text)) {
        return { error: new Error(`WAF block for ${url}`), retryable: false, waf: true };
      }
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const message = `HTTP ${response.status} for ${url}: ${text.slice(0, 200)}`;
        return {
          error: retryable ? new Error(message) : new PlayloltcgRefusedError(message),
          retryable,
          waf: false,
        };
      }
      return { body: JSON.parse(text) };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error(String(error)),
        retryable: true,
        waf: false,
      };
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

  function buildUrl(path: string, query?: PlayloltcgQuery): string {
    const u = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      u.searchParams.set(key, String(value));
    }
    return u.toString();
  }

  return {
    post: <T>(path: string, body: PlayloltcgBody): Promise<T> =>
      enqueue(async () => {
        const url = buildUrl(path);
        return unwrap(await attempt(url, body), url) as T;
      }),

    postList: <T>(path: string, body: PlayloltcgBody): Promise<PlayloltcgList<T>> =>
      enqueue(async () => {
        const url = buildUrl(path);
        return asList<T>(unwrap(await attempt(url, body), url));
      }),

    get: <T>(path: string, query?: PlayloltcgQuery): Promise<T> =>
      enqueue(async () => {
        const url = buildUrl(path, query);
        return unwrap(await attempt(url, null), url) as T;
      }),

    get requests() {
      return requests;
    },
    get blocked() {
      return blocked;
    },
  };
}
