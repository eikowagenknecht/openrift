import { describe, expect, it } from "vitest";

import { ApiError } from "./api-client";

describe("ApiError", () => {
  it("creates an instance with message and status", () => {
    const err = new ApiError("not found", 404);
    expect(err.message).toBe("not found");
    expect(err.status).toBe(404);
  });

  it("is an instance of Error", () => {
    const err = new ApiError("error", 500);
    expect(err).toBeInstanceOf(Error);
  });
});
