import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./pg-errors.js";

describe("isUniqueViolation", () => {
  it("is true for a Postgres 23505 error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("is true for a driver error object carrying extra fields", () => {
    const error = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "uq_x" });
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("is false for a different SQLSTATE (foreign-key violation)", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });

  it("is false for errors without a code", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation({ message: "no code here" })).toBe(false);
  });

  it("is false for null and non-object values", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
