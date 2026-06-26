import { ERROR_CODES } from "@openrift/shared";
import { adminCacheContract } from "@openrift/shared/contracts";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const log = createLogger("admin-cache");

const os = implement(adminCacheContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the admin Cloudflare cache controls. Logic unchanged
 * from the previous `@hono/zod-openapi` handlers; not-configured (503) /
 * upstream-failure (502) states are thrown as `AppError` and mapped by the
 * handler's appErrorInterceptor.
 */
export const adminCacheRouter = {
  status: os.status.handler(({ context }) => {
    const config = context.config;
    return { configured: config.cloudflare !== undefined };
  }),

  purge: os.purge.handler(async ({ context }): Promise<void> => {
    const config = context.config;
    const { fetch } = context.io;

    if (!config.cloudflare) {
      throw new AppError(
        503,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        "Cloudflare credentials not configured (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID)",
      );
    }

    const { apiToken, zoneId } = config.cloudflare;
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purge_everything: true }),
      },
    );

    if (!res.ok) {
      // Log the upstream body server-side for diagnostics; don't splice it into
      // the client-facing error (it can carry upstream-controlled content).
      const body = await res.text();
      log.error({ status: res.status, body: body.slice(0, 1000) }, "Cloudflare cache purge failed");
      throw new AppError(
        502,
        ERROR_CODES.INTERNAL_ERROR,
        `Cloudflare purge failed (${res.status})`,
      );
    }
  }),
};
