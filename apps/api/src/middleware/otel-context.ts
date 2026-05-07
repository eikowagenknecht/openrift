// oxlint-disable-next-line import/no-nodejs-modules -- API server runs on Bun, AsyncLocalStorage is required for per-request context
import { AsyncLocalStorage } from "node:async_hooks";

import * as Sentry from "@sentry/bun";
import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";

import type { Variables } from "../types.js";

export interface RequestCtx {
  /**
   * Low-cardinality tag identifying the origin of a query. Either a Hono
   * route template (e.g. "/api/v1/cards/:cardSlug") or a background-job tag
   * (e.g. "cron:tcgplayer.refresh"). Surfaces in pg_stat_statements via the
   * sqlcommenter wrapper in db/connect.ts.
   */
  route: string;
  /**
   * W3C traceparent value. Sourced from the active Sentry span when one
   * exists so SQL queries can be cross-referenced with a Sentry trace; falls
   * back to a freshly generated trace id otherwise so per-request grouping
   * still works.
   */
  traceparent: string;
}

export const requestCtx = new AsyncLocalStorage<RequestCtx>();

const HEX_CHARS = "0123456789abcdef";

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += HEX_CHARS[byte >> 4] + HEX_CHARS[byte & 0xf];
  }
  return out;
}

/**
 * Builds a W3C traceparent string. Prefers the active Sentry span so the
 * resulting trace id can be searched in Sentry; otherwise generates a fresh
 * id so per-request query grouping still works in pg_stat_statements.
 *
 * @returns A traceparent value of the form `00-<traceId>-<spanId>-01`.
 */
export function buildTraceparent(): string {
  const span = Sentry.getActiveSpan();
  if (span) {
    const ctx = span.spanContext();
    if (ctx.traceId && ctx.spanId) {
      return `00-${ctx.traceId}-${ctx.spanId}-01`;
    }
  }
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}

/**
 * Hono middleware that populates `requestCtx` for the request lifetime.
 * Reads the most-specific matched route via `routePath(c, -1)` so sub-app
 * mounts (e.g. `/api/v1` + `/cards/:cardSlug`) resolve to the full template.
 *
 * @returns A Hono middleware handler.
 */
export const otelContextMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (
  c,
  next,
) => {
  const matched = routePath(c, -1);
  const route = matched || "unmatched";
  const traceparent = buildTraceparent();
  await requestCtx.run({ route, traceparent }, next);
};
