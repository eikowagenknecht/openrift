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
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
