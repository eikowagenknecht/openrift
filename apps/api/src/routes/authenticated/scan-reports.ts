import type { ScanReportResponse } from "@openrift/shared";
import { ERROR_CODES } from "@openrift/shared";
import { scanReportsContract } from "@openrift/shared/contracts/scan-reports";
import { implement } from "@orpc/server";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { orpcErrorResponse } from "../../orpc/error-body.js";
import type { Variables } from "../../types.js";

const MAX_BODY_BYTES = 256 * 1024;

const os = implement(scanReportsContract).$context<ApiContext>().use(requireAuthedUser);

export const scanReportsRouter = {
  create: os.create.handler(async ({ input, context, errors }): Promise<ScanReportResponse> => {
    const result = await context.services.createScanReport(context.transact, {
      userId: context.userId,
      note: input.note ?? null,
      userAgent: input.userAgent ?? null,
      journal: input.journal,
      now: new Date(),
    });

    if (result.status === "rate_limited") {
      throw errors.TOO_MANY_REQUESTS({
        message: `You can send up to ${result.limit} scan reports per hour. Please try again later.`,
      });
    }

    return { reference: result.reference };
  }),
};

/** The per-user rate limit is a DB-backed hourly cap enforced in the service, not here. */
export function mountScanReportsMiddleware(app: Hono<{ Variables: Variables }>): void {
  app.use(
    "/api/v1/scan-reports",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      // Rejects before the oRPC catch-all runs, so the body is built here rather
      // than thrown as an AppError, keeping the 413 envelope shape consistent.
      onError: (c) => orpcErrorResponse(c, ERROR_CODES.PAYLOAD_TOO_LARGE, "Report exceeds 256 KB"),
    }),
  );
}
