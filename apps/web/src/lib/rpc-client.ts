import type { AppType } from "api/rpc";
import type { ClientResponse } from "hono/client";
import { hc } from "hono/client";

import { ApiError } from "./api-client";

/**
 * Factory for the Hono RPC client. On the server, pass an absolute URL
 * (e.g. "http://localhost:3000"); on the client, "/" is fine since the
 * dev proxy / Cloudflare Worker forwards /api/* to the backend.
 * @returns A typed Hono RPC client instance.
 */
function createRpcClient(baseUrl: string) {
  return hc<AppType>(baseUrl, { init: { credentials: "include" } });
}

export const client = createRpcClient("/");

/** Extract the data type from a Hono ClientResponse (distributes over status code unions). */
type ExtractData<T> = T extends ClientResponse<infer D, number, string> ? D : never;

/**
 * Unwrap an RPC response — handles errors identically to api-client.ts.
 * The return type is inferred from the Hono route chain, so callers no longer
 * need to pass an explicit `<T>` type parameter.
 *
 * Usage: `queryFn: () => rpc(client.api.v1.copies.$get())`
 * @returns The parsed response body, typed via the Hono route chain.
 */
export async function rpc<R extends ClientResponse<unknown, number, string>>(
  response: Promise<R>,
): Promise<ExtractData<R>> {
  const res = await response;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    let message = `Request failed: ${res.status}`;
    let details: unknown = body?.details;

    if (typeof body?.error === "string") {
      message = body.error;
    } else if (body?.error !== undefined && body.error !== null) {
      // Zod validation errors: { name: "ZodError", message: "<json>" }
      const err = body.error as Record<string, unknown>;
      if (typeof err.message === "string") {
        try {
          details = JSON.parse(err.message);
        } catch {
          details = err.message;
        }
      } else {
        details = err;
      }
    }

    if (details) {
      console.error("[rpc]", res.url, message, details);
    }
    throw new ApiError(message, res.status, (body?.code as string) ?? "UNKNOWN", details);
  }
  const text = await res.text();
  if (!text) {
    return undefined as ExtractData<R>;
  }
  return JSON.parse(text) as ExtractData<R>;
}
