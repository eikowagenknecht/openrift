import { describe, expect, it } from "vitest";

import { ApiError } from "./api-client";

describe("ApiError", () => {
  it("creates an instance with all parameters", () => {
    const err = new ApiError("not found", 404, "NOT_FOUND", { field: "id" });
    expect(err.message).toBe("not found");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.details).toEqual({ field: "id" });
  });

  it("creates an instance without optional details", () => {
    const err = new ApiError("bad request", 400, "BAD_REQUEST");
    expect(err.message).toBe("bad request");
    expect(err.status).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.details).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const err = new ApiError("error", 500, "INTERNAL");
    expect(err).toBeInstanceOf(Error);
  });
});
