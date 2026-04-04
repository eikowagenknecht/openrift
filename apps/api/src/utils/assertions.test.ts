import { describe, expect, it } from "vitest";

import { AppError, ERROR_CODES } from "../errors.js";
import { assertDeleted, assertFound, assertUpdated } from "./assertions.js";

// ---------------------------------------------------------------------------
// assertFound
// ---------------------------------------------------------------------------

describe("assertFound", () => {
  it("does nothing when the value is defined", () => {
    expect(() => assertFound({ id: "1" }, "Not found")).not.toThrow();
  });

  it("does nothing for falsy-but-defined values like 0 and empty string", () => {
    expect(() => assertFound(0, "Not found")).not.toThrow();
    expect(() => assertFound("", "Not found")).not.toThrow();
    expect(() => assertFound(false, "Not found")).not.toThrow();
  });

  it("throws a 404 AppError when the value is null", () => {
    expect(() => assertFound(null, "Card not found")).toThrow(AppError);
    try {
      assertFound(null, "Card not found");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(404);
      expect((error as AppError).code).toBe(ERROR_CODES.NOT_FOUND);
      expect((error as AppError).message).toBe("Card not found");
    }
  });

  it("throws a 404 AppError when the value is undefined", () => {
    expect(() => assertFound(undefined, "Printing not found")).toThrow(AppError);
  });

  it("narrows the type after the call", () => {
    const value: string | null = "hello";
    assertFound(value, "Not found");
    // TypeScript should narrow value to string here
    expect(value.toUpperCase()).toBe("HELLO");
  });
});

// ---------------------------------------------------------------------------
// assertUpdated
// ---------------------------------------------------------------------------

describe("assertUpdated", () => {
  it("does nothing when rows were updated", () => {
    expect(() => assertUpdated({ numUpdatedRows: 1n }, "Not found")).not.toThrow();
  });

  it("throws a 404 when numUpdatedRows is 0n", () => {
    expect(() => assertUpdated({ numUpdatedRows: 0n }, "Card not found")).toThrow(AppError);
    try {
      assertUpdated({ numUpdatedRows: 0n }, "Card not found");
    } catch (error) {
      expect((error as AppError).status).toBe(404);
      expect((error as AppError).code).toBe(ERROR_CODES.NOT_FOUND);
    }
  });

  it("throws a 404 when result is null", () => {
    expect(() => assertUpdated(null, "Not found")).toThrow(AppError);
  });

  it("throws a 404 when result is undefined", () => {
    expect(() => assertUpdated(undefined, "Not found")).toThrow(AppError);
  });
});

// ---------------------------------------------------------------------------
// assertDeleted
// ---------------------------------------------------------------------------

describe("assertDeleted", () => {
  it("does nothing when rows were deleted", () => {
    expect(() => assertDeleted({ numDeletedRows: 1n }, "Not found")).not.toThrow();
  });

  it("throws a 404 when numDeletedRows is 0n", () => {
    expect(() => assertDeleted({ numDeletedRows: 0n }, "Flag not found")).toThrow(AppError);
    try {
      assertDeleted({ numDeletedRows: 0n }, "Flag not found");
    } catch (error) {
      expect((error as AppError).status).toBe(404);
      expect((error as AppError).code).toBe(ERROR_CODES.NOT_FOUND);
    }
  });

  it("throws a 404 when result is null", () => {
    expect(() => assertDeleted(null, "Not found")).toThrow(AppError);
  });

  it("throws a 404 when result is undefined", () => {
    expect(() => assertDeleted(undefined, "Not found")).toThrow(AppError);
  });
});
