import { describe, expect, it } from "vitest";

import { ApiError } from "./api-client";
import { assertOk } from "./rpc-client";

describe("assertOk", () => {
  it("does not throw for ok responses", () => {
    expect(() => assertOk({ ok: true, status: 200 })).not.toThrow();
  });

  it("throws ApiError for non-ok responses", () => {
    expect(() => assertOk({ ok: false, status: 500 })).toThrow(ApiError);
  });

  it("includes status code in error message", () => {
    try {
      assertOk({ ok: false, status: 403 });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toBe("Request failed: 403");
      expect((error as ApiError).status).toBe(403);
    }
  });
});
