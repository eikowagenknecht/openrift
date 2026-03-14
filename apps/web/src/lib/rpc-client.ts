import type { AppType } from "api/rpc";
import { hc } from "hono/client";

import { ApiError } from "./api-client";

export const client = hc<AppType>("/", {
  init: {
    credentials: "include",
  },
});

/**
 * Unwrap an RPC response — handles errors identically to api-client.ts.
 * Usage: `queryFn: () => rpc(client.api.copies.$get())`
 * @returns The parsed response body as type T
 */
export async function rpc<T>(response: Promise<Response>): Promise<T> {
  const res = await response;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      code?: string;
      details?: unknown;
    } | null;
    throw new ApiError(
      body?.error ?? `Request failed: ${res.status}`,
      res.status,
      body?.code ?? "UNKNOWN",
      body?.details,
    );
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
