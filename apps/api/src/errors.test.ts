import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { ErrorCode } from "@openrift/shared/error-codes";
import { describe, expect, it } from "vitest";

import { AppError, codeForStatus } from "./errors.js";

describe("AppError", () => {
  it("carries status, code, message, and details", () => {
    const err = new AppError(409, ERROR_CODES.CONFLICT, "Already exists", { field: "name" });
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Already exists");
    expect(err.details).toEqual({ field: "name" });
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });

  it("leaves details undefined when omitted", () => {
    const err = new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    expect(err.details).toBeUndefined();
  });
});

describe("ERROR_CODES", () => {
  it("is its own source of truth: every value equals its key", () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });

  it("includes the codes the global handler depends on", () => {
    expect(ERROR_CODES.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ERROR_CODES.SERVICE_UNAVAILABLE).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("codeForStatus", () => {
  it.each([
    [400, ERROR_CODES.BAD_REQUEST],
    [401, ERROR_CODES.UNAUTHORIZED],
    [403, ERROR_CODES.FORBIDDEN],
    [404, ERROR_CODES.NOT_FOUND],
    [409, ERROR_CODES.CONFLICT],
    [413, ERROR_CODES.PAYLOAD_TOO_LARGE],
    [429, ERROR_CODES.RATE_LIMITED],
    [503, ERROR_CODES.SERVICE_UNAVAILABLE],
  ])("maps %i to its canonical code", (status, expected) => {
    expect(codeForStatus(status)).toBe(expected);
  });

  it("maps unrecognized 4xx statuses to BAD_REQUEST", () => {
    expect(codeForStatus(418)).toBe(ERROR_CODES.BAD_REQUEST);
    expect(codeForStatus(422)).toBe(ERROR_CODES.BAD_REQUEST);
  });

  it("maps any 5xx status to INTERNAL_ERROR", () => {
    expect(codeForStatus(500)).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(codeForStatus(502)).toBe(ERROR_CODES.INTERNAL_ERROR);
  });

  it("returns a value assignable to ErrorCode", () => {
    const code: ErrorCode = codeForStatus(404);
    expect(code).toBe("NOT_FOUND");
  });
});
