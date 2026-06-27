import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../errors.js";
import { makeReportingErrorInterceptor } from "./error-reporting-interceptor.js";

const captureException = vi.fn();
vi.mock("@sentry/bun", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

const log = { error: vi.fn() } as unknown as Parameters<typeof makeReportingErrorInterceptor>[0];

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

  it("maps a thrown AppError to an ORPCError at the boundary (safety net)", async () => {
    const rethrown = await runThrowing(new AppError(404, "NOT_FOUND", "missing"));
    expect(rethrown).toBeInstanceOf(ORPCError);
    expect((rethrown as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
  });
});
