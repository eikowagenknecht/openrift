// Electric shape-proxy forwarding core (ADR-027). Electric serves "shapes" —
// filtered single-table replication streams — over plain HTTP. This helper is
// the shared transport: it constructs the upstream Electric request from a
// pinned {table, columns, where?} definition, forwards only the sync-protocol
// position params the client legitimately controls, and streams the response
// back with the appropriate cache headers.
//
// Two callers use it:
//   - the authenticated proxy (routes/authenticated/shapes.ts): per-user shapes
//     with a viewer-scoped `where` + `params[1]`, marked `private, no-store`;
//   - the public catalog proxy (routes/public/public-shapes.ts): whole-table
//     read-only catalog shapes (no `where`), marked publicly cacheable.
//
// A client can never widen its shape, because the table/columns/where never
// leave the server.

import { ERROR_CODES } from "@openrift/shared";
import type { Context } from "hono";

import { AppError } from "../errors.js";
import type { Variables } from "../types.js";

export interface ElectricShapeDefinition {
  table: string;
  columns: string;
  /**
   * Optional where clause. When set, `$1` is bound to `userParam` below.
   * Omitted for public whole-table shapes.
   */
  where?: string;
  /** Value bound to `$1` (`params[1]`) when `where` references it. */
  userParam?: string;
}

// Sync-protocol position params the client legitimately controls. Everything
// else (table, columns, where, params, secret) is pinned server-side.
const FORWARDED_SHAPE_PARAMS = ["offset", "handle", "live", "cursor"] as const;

// Hop-specific headers that must not be copied onto our response: fetch has
// already decompressed the body, so the upstream encoding/length are wrong.
const STRIPPED_RESPONSE_HEADERS = ["content-encoding", "content-length"];

/**
 * Forward a pinned shape definition to Electric and stream the response back.
 *
 * @param c — the Hono request context (reads `config.electric`, the client's
 *   abort signal, and the forwarded position params).
 * @param shape — the server-pinned table/columns/where definition.
 * @param cacheControl — the `cache-control` value to set on the response.
 *   Per-user proxies pass `"private, no-store"`; public catalog proxies pass a
 *   shared-cacheable value.
 * @returns The proxied Electric response (or a quiet 204 on client abort).
 */
export async function forwardElectricShape(
  c: Context<{ Variables: Variables }>,
  shape: ElectricShapeDefinition,
  cacheControl: string,
): Promise<Response> {
  const { url, secret } = c.get("config").electric;
  if (!url) {
    throw new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, "Sync is not configured");
  }

  const upstream = new URL("/v1/shape", url);
  for (const name of FORWARDED_SHAPE_PARAMS) {
    const value = c.req.query(name);
    if (value !== undefined) {
      upstream.searchParams.set(name, value);
    }
  }
  upstream.searchParams.set("table", shape.table);
  upstream.searchParams.set("columns", shape.columns);
  if (shape.where !== undefined) {
    upstream.searchParams.set("where", shape.where);
  }
  if (shape.userParam !== undefined) {
    upstream.searchParams.set("params[1]", shape.userParam);
  }
  if (secret) {
    upstream.searchParams.set("secret", secret);
  }

  // Propagate the client's abort so a dropped live long-poll releases the
  // upstream request instead of holding it for the full Electric timeout.
  let response: Response;
  try {
    response = await fetch(upstream, { signal: c.req.raw.signal });
  } catch (error) {
    // The client dropped the request (live long-poll rotation, tab closed,
    // page navigated) and the abort propagated upstream. Routine stream
    // lifecycle, not a failure — answer quietly; nobody is listening.
    if (error instanceof DOMException && error.name === "AbortError") {
      return c.body(null, 204);
    }
    throw error;
  }

  const headers = new Headers(response.headers);
  for (const name of STRIPPED_RESPONSE_HEADERS) {
    headers.delete(name);
  }
  headers.set("cache-control", cacheControl);

  // Status and remaining headers pass through untouched: the Electric client
  // drives its protocol off them (electric-handle, electric-offset,
  // electric-schema, 204 for live timeouts, 409 for must-refetch).
  return c.newResponse(response.body, response.status as 200, Object.fromEntries(headers));
}
