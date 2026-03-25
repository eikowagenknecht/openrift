import type { AppType } from "api/rpc";
import { hc } from "hono/client";

import { ApiError } from "./api-client";

function createRpcClient(baseUrl: string) {
  return hc<AppType>(baseUrl, { init: { credentials: "include" } });
}

export const client = createRpcClient("/");

/** Throw an ApiError if the response is not ok. */
export function assertOk(res: { ok: boolean; status: number }) {
  if (!res.ok) {
    throw new ApiError(`Request failed: ${res.status}`, res.status);
  }
}
