import type { AppType } from "api/rpc";
import { hc } from "hono/client";

import { ApiError } from "./api-client";

function getBaseUrl() {
  if (!("location" in globalThis)) {
    if (!process.env.API_INTERNAL_URL) {
      throw new Error("API_INTERNAL_URL must be set on the server");
    }
    return process.env.API_INTERNAL_URL;
  }
  return "/";
}

function createRpcClient(baseUrl: string) {
  return hc<AppType>(baseUrl, { init: { credentials: "include" } });
}

let _client: ReturnType<typeof createRpcClient> | null = null;

export function getClient() {
  if (!_client) {
    _client = createRpcClient(getBaseUrl());
  }
  return _client;
}

// Re-export as `client` for backward compatibility. Uses a getter so the
// singleton is created lazily (avoids crashing when imported during SSR).
export const client = new Proxy({} as ReturnType<typeof createRpcClient>, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

/** Throw an ApiError if the response is not ok. */
export function assertOk(res: { ok: boolean; status: number }) {
  if (!res.ok) {
    throw new ApiError(`Request failed: ${res.status}`, res.status);
  }
}
