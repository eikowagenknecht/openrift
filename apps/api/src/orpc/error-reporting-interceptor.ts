import type { Logger } from "@openrift/shared/logger";
import { ORPCError, ValidationError } from "@orpc/server";
import * as Sentry from "@sentry/bun";

import { AppError } from "../errors.js";
import { appErrorInterceptor } from "./app-error-interceptor.js";

/**
 * Whether a thrown error is a server fault worth reporting to Sentry. Expected
 * client outcomes are NOT faults: a sub-500 error (404/409/422) — whether a raw
 * {@link AppError} or the {@link ORPCError} it is converted into inside the
 * procedure pipeline (`errors.NOT_FOUND()`, an input-validation `BAD_REQUEST`,
 * `UNAUTHORIZED`, …) — is routine. Everything else — a 5xx error (e.g. the
 * `INTERNAL_ERROR` / `MISSING_ALIAS` AppErrors, which now reach here already
 * mapped to a 500 `ORPCError`), a raw DB/runtime error, an output-validation
 * failure — is a genuine fault. The status check is the same for both error
 * types because the base auth middleware converts AppError → ORPCError before
 * this interceptor runs (see `convertingAppErrors` in `base.ts`); keying off
 * status (not the class) keeps capture identical across that boundary.
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
 * oRPC wraps a failed output validation in an `INTERNAL_SERVER_ERROR` whose
 * message is the bare "Output validation failed" and whose `cause` holds the
 * per-issue detail. Without this, both the Sentry event and the log line say
 * only "Output validation failed" — enough to know an endpoint 500s, not enough
 * to know which field did it, which is how an output-validation 500 once sat
 * undiagnosable for a month. Only the path and the schema's own message are
 * lifted out;
 * `cause.data` (the whole rejected payload, i.e. the caller's data) is
 * deliberately left behind.
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
