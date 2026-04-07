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

export const client = createRpcClient(getBaseUrl());

/** Throw an ApiError if the response is not ok. */
export function assertOk(res: { ok: boolean; status: number }) {
  if (!res.ok) {
    throw new ApiError(`Request failed: ${res.status}`, res.status);
  }
}
