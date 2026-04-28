// oxlint-disable-next-line import/no-unassigned-import -- registers z.openapi() extension before schemas.ts evaluates
import "@hono/zod-openapi";
import { describe, expect, it } from "vitest";

import { userKeyParamSchema } from "./schemas.js";

describe("user feature flag param schemas", () => {
  // Regression: Better Auth user IDs are nanoid-style text, not UUIDs.
  // A UUID-only validator rejected every real user ID with 400.
  const betterAuthId = "V07rIX7hwiXgRxHwxo1HtV1ybv8Z7iyK";

  it("userKeyParamSchema accepts non-UUID Better Auth user IDs", () => {
    const result = userKeyParamSchema.safeParse({ id: betterAuthId, key: "my-flag" });
    expect(result.success).toBe(true);
  });

  it("userKeyParamSchema rejects empty id or key", () => {
    expect(userKeyParamSchema.safeParse({ id: "", key: "my-flag" }).success).toBe(false);
    expect(userKeyParamSchema.safeParse({ id: betterAuthId, key: "" }).success).toBe(false);
  });
});
