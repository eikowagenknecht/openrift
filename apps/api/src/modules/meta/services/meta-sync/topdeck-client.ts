import type { Fetch } from "../../../../io.js";
import { metaSyncUserAgent } from "./user-agent.js";

// The source claims 100 requests/minute but throttles bulk queries far
// earlier (six searches in twenty seconds drew a 429), and it names its own
// cool-down in the response body.
const REQUEST_SPACING_MS = 2000;
const REQUEST_JITTER_MS = 500;

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

const MAX_THROTTLE_WAIT_MS = 120_000;
const DEFAULT_THROTTLE_WAIT_MS = 30_000;

const REQUEST_TIMEOUT_MS = 120_000;

/** A 4xx that isn't a throttle; retrying cannot help. */
export class TopdeckRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopdeckRefusedError";
  }
}

export class TopdeckThrottledError extends Error {
  constructor(url: string) {
    super(`topdeck kept throttling: ${url}`);
    this.name = "TopdeckThrottledError";
  }
}

export interface TopdeckSearchBody {
  game: string;
  format: string;
  /** Unix seconds. */
  start?: number;
  end?: number;
  columns?: string[];
}

export interface TopdeckClientOptions {
  fetch: Fetch;
  baseUrl: string;
  apiKey: string;
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface TopdeckClient {
  searchTournaments: (body: TopdeckSearchBody) => Promise<unknown[]>;
  readonly requests: number;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

function throttleWaitMs(text: string): number {
  try {
    const body: unknown = JSON.parse(text);
    const seconds = (body as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_THROTTLE_WAIT_MS);
    }
  } catch {
    // Not JSON; the fixed wait below.
  }
  return DEFAULT_THROTTLE_WAIT_MS;
}

async function settled(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // Reported to whoever made that call.
  }
}

// Sequential by construction: every call awaits the previous one's spacing.
export function createTopdeckClient(options: TopdeckClientOptions): TopdeckClient {
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

  async function attemptOnce(
    url: string,
    body: TopdeckSearchBody,
  ): Promise<{ body: unknown } | { error: Error; retryable: boolean; throttleMs: number | null }> {
    try {
      const response = await options.fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: options.apiKey,
          "user-agent": userAgent,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      if (response.status === 429) {
        return {
          error: new Error(`HTTP 429 for ${url}`),
          retryable: false,
          throttleMs: throttleWaitMs(text),
        };
      }
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const message = `HTTP ${response.status} for ${url}: ${text.slice(0, 200)}`;
        return {
          error: retryable ? new Error(message) : new TopdeckRefusedError(message),
          retryable,
          throttleMs: null,
        };
      }
      return { body: JSON.parse(text) };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error(String(error)),
        retryable: true,
        throttleMs: null,
      };
    }
  }

  async function attempt(url: string, body: TopdeckSearchBody): Promise<unknown> {
    let lastError: Error | null = null;
    let failures = 0;
    let throttles = 0;
    while (failures < MAX_ATTEMPTS) {
      await pace();
      requests++;
      const outcome = await attemptOnce(url, body);
      if ("body" in outcome) {
        return outcome.body;
      }
      lastError = outcome.error;
      if (outcome.throttleMs !== null) {
        // Throttles don't count against MAX_ATTEMPTS; they wait out the given delay.
        if (throttles > 0) {
          throw new TopdeckThrottledError(url);
        }
        throttles++;
        await sleep(outcome.throttleMs);
        continue;
      }
      if (!outcome.retryable) {
        throw lastError;
      }
      failures++;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (failures - 1) + random() * REQUEST_JITTER_MS);
    }
    throw lastError ?? new Error(`Request failed: ${url}`);
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
    searchTournaments: (body: TopdeckSearchBody): Promise<unknown[]> =>
      enqueue(async () => {
        const url = new URL("v2/tournaments", options.baseUrl).toString();
        const result = await attempt(url, body);
        if (!Array.isArray(result)) {
          throw new TopdeckRefusedError(
            `topdeck answered ${url} with ${typeof result}, not a tournament list`,
          );
        }
        return result;
      }),

    get requests() {
      return requests;
    },
  };
}
