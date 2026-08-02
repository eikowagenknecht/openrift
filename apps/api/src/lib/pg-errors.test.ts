import { describe, expect, it } from "vitest";

import { isUniqueViolation, isUniqueViolationOn } from "./pg-errors.js";

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

describe("isUniqueViolationOn", () => {
  it("is true only when the 23505 names the given constraint", () => {
    const error = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint_name: "uq_pod_rounds_number",
    });
    expect(isUniqueViolationOn(error, "uq_pod_rounds_number")).toBe(true);
  });

  it("is false for a 23505 from a different constraint", () => {
    const error = { code: "23505", constraint_name: "some_other_unique" };
    expect(isUniqueViolationOn(error, "uq_pod_rounds_number")).toBe(false);
  });

  it("is false for a 23505 with no constraint name", () => {
    expect(isUniqueViolationOn({ code: "23505" }, "uq_pod_rounds_number")).toBe(false);
  });

  it("is false for a non-unique error", () => {
    expect(isUniqueViolationOn({ code: "23503", constraint_name: "x" }, "x")).toBe(false);
  });
});
