import { ORPCError, ValidationError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../errors.js";
import { makeReportingErrorInterceptor } from "./error-reporting-interceptor.js";

const captureException = vi.fn();
vi.mock("@sentry/bun", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

const logError = vi.fn();
const log = { error: logError } as unknown as Parameters<typeof makeReportingErrorInterceptor>[0];

/** An output-validation failure in the exact shape oRPC throws it.
 * @returns The wrapping 500 whose `cause` carries the issues. */
function outputValidationError(
  issues: { message: string; path?: unknown[] }[],
): ORPCError<string, unknown> {
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Output validation failed",
    cause: new ValidationError({
      message: "Output validation failed",
      // oxlint-disable-next-line no-explicit-any -- StandardSchema issue paths accept both segment shapes
      issues: issues as any,
      data: { secret: "never logged" },
    }),
  });
}

async function runThrowing(toThrow: unknown): Promise<unknown> {
  const interceptor = makeReportingErrorInterceptor(log);
  try {
    await interceptor({
      next: () => {
        throw toThrow;
      },
    });
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("reporting error interceptor: server-fault classification", () => {
  beforeEach(() => {
    captureException.mockClear();
    logError.mockClear();
  });

  it("captures a 5xx ORPCError (a converted INTERNAL_ERROR / MISSING_ALIAS AppError)", async () => {
    await runThrowing(new ORPCError("MISSING_ALIAS", { status: 500, message: "no aliases" }));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("does not capture a sub-500 ORPCError (a typed NOT_FOUND / CONFLICT)", async () => {
    await runThrowing(new ORPCError("NOT_FOUND", { status: 404, message: "missing" }));
    await runThrowing(new ORPCError("CONFLICT", { status: 409, message: "conflict" }));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still captures a 5xx AppError that reaches the transport boundary unconverted", async () => {
    await runThrowing(new AppError(500, "INTERNAL_ERROR", "boom"));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("does not capture a sub-500 AppError", async () => {
    await runThrowing(new AppError(404, "NOT_FOUND", "missing"));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("captures a raw non-oRPC runtime error", async () => {
    await runThrowing(new Error("kaboom"));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("reports the offending field paths of an output-validation failure", async () => {
    // Regression for OPENRIFT-API-B: the wrapping ORPCError's message is the
    // bare "Output validation failed", so without lifting the cause's issues
    // neither Sentry nor the log says which field 500'd the endpoint.
    await runThrowing(
      outputValidationError([
        { message: "Invalid option", path: ["defaultCurrency"] },
        { message: "Invalid input", path: [{ key: "completionScope" }, { key: "promos" }] },
        { message: "Invalid input" },
      ]),
    );
    const expected = [
      "defaultCurrency: Invalid option",
      "completionScope.promos: Invalid input",
      "Invalid input",
    ];
    expect(captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extra: { validationIssues: expected } }),
    );
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ validationIssues: expected }),
      "oRPC handler error",
    );
  });

  it("does not report the rejected payload alongside the issues", async () => {
    // `cause.data` is the whole rejected output — caller data, not diagnostics.
    await runThrowing(outputValidationError([{ message: "Invalid option", path: ["theme"] }]));
    expect(JSON.stringify(captureException.mock.calls[0]?.[1])).not.toContain("never logged");
  });

  it("omits the issue list for a fault that carries no validation cause", async () => {
    await runThrowing(new Error("kaboom"));
    expect(captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extra: undefined }),
    );
  });

  it("maps a thrown AppError to an ORPCError at the boundary (safety net)", async () => {
    const rethrown = await runThrowing(new AppError(404, "NOT_FOUND", "missing"));
    expect(rethrown).toBeInstanceOf(ORPCError);
    expect((rethrown as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
  });
});
