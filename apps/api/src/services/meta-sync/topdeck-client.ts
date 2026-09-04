import type { Fetch } from "../../io.js";
import { metaSyncUserAgent } from "./user-agent.js";

/**
 * One authenticated POST per format, one request at a time, spaced. The source
 * states 100 requests a minute but throttles bulk queries far earlier (six
 * searches in twenty seconds drew a 429 asking for 33), and it names the wait,
 * so a throttle is honoured rather than retried blind. Nothing latches: unlike
 * playloltcg's WAF the limit lifts on the timer the source gives.
 */

/** Minimum spacing between two request starts. */
const REQUEST_SPACING_MS = 2000;
const REQUEST_JITTER_MS = 500;

/** A transient error (5xx, dropped connection) is worth a short ladder. */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

/** The ceiling on a throttle wait, so one absurd hint cannot hang a job. */
const MAX_THROTTLE_WAIT_MS = 120_000;
const DEFAULT_THROTTLE_WAIT_MS = 30_000;

/** A whole-format search returns megabytes, so this is generous on purpose. */
const REQUEST_TIMEOUT_MS = 120_000;

/** A 4xx that is not a throttle, or a body that is not the array the search promises. Asking again cannot change it. */
export class TopdeckRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopdeckRefusedError";
  }
}

/** Thrown when the run exhausted its throttle patience for one call. */
export class TopdeckThrottledError extends Error {
  constructor(url: string) {
    super(`topdeck kept throttling: ${url}`);
    this.name = "TopdeckThrottledError";
  }
}

/** The search body, as the source's `POST /v2/tournaments` takes it. */
export interface TopdeckSearchBody {
  game: string;
  format: string;
  /** Unix seconds, inclusive bounds on the tournament start. */
  start?: number;
  end?: number;
  columns?: string[];
}

export interface TopdeckClientOptions {
  fetch: Fetch;
  baseUrl: string;
  apiKey: string;
  /** Overridden only by tests; production uses {@link metaSyncUserAgent}. */
  userAgent?: string;
  /** Injected so tests neither wait nor jitter. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface TopdeckClient {
  /** POST the tournament search and return the array the source answers with. */
  searchTournaments: (body: TopdeckSearchBody) => Promise<unknown[]>;
  /** Every request this client has made, for the job summary's honesty. */
  readonly requests: number;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

/** The source names its own cool-down; anything unusable falls back to a fixed wait. */
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

/** Sequential by construction: every call awaits the previous one's spacing. */
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
        // A throttle is not a failed attempt: the source told us when to come
        // back, so waiting it out is the call, not backing off a fixed ladder.
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
