import type { Logger } from "@openrift/shared/logger";
import { ORPCError, ValidationError } from "@orpc/server";
import * as Sentry from "@sentry/bun";

import { AppError } from "../errors.js";
import { appErrorInterceptor } from "./app-error-interceptor.js";

/**
 * A sub-500 status (404/409/422/...) is routine, not a fault.
 * Checked by status, not error class: base middleware converts `AppError` to `ORPCError` before this runs.
 */
function isServerFault(error: unknown): boolean {
  if (error instanceof AppError || error instanceof ORPCError) {
    return error.status >= 500;
  }
  return true;
}

/**
 * The field paths a schema rejected, as `path: message` strings.
 *
 * `cause.data` (the whole rejected payload) is deliberately left out of the result.
 */
function validationIssueSummary(error: unknown): string[] | undefined {
  if (!(error instanceof ORPCError) || !(error.cause instanceof ValidationError)) {
    return undefined;
  }
  return error.cause.issues.map((issue) => {
    const path = (issue.path ?? [])
      .map((segment) => String(typeof segment === "object" ? segment.key : segment))
      .join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });
}

/**
 * Production error interceptor for the single oRPC handler. oRPC catches every
 * handler throw and encodes it into a `Response`, so it never reaches Hono's
 * `app.onError` — which means the Sentry capture + structured error log that
 * `onError` provides would be lost for the whole migrated API. This interceptor
 * restores it: it captures the raw error (before oRPC swallows it) when it is a
 * server fault, then delegates the `AppError → ORPCError` mapping to
 * {@link appErrorInterceptor} (the same mapping the route unit tests use).
 *
 * Bound to `log` so it reports through the same logger as `onError`.
 */
export function makeReportingErrorInterceptor(log: Logger) {
  return function reportingErrorInterceptor<TOutput>(options: {
    next: () => Promise<TOutput>;
  }): Promise<TOutput> {
    return appErrorInterceptor({
      next: async () => {
        try {
          return await options.next();
        } catch (error) {
          if (isServerFault(error)) {
            const validationIssues = validationIssueSummary(error);
            Sentry.captureException(error, {
              tags: { source: "orpc" },
              extra: validationIssues ? { validationIssues } : undefined,
            });
            log.error({ err: error, validationIssues }, "oRPC handler error");
          }
          throw error;
        }
      },
    });
  };
}
