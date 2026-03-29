import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import { getUserId } from "./get-user-id.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(user: { id: string } | null) {
  const vars: Record<string, unknown> = { user };
  return { get: (key: string) => vars[key] } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getUserId", () => {
  it("returns the user ID when user is present in context", () => {
    const ctx = createMockContext({ id: "user-123" });
    expect(getUserId(ctx)).toBe("user-123");
  });

  it("throws 401 AppError when user is null", () => {
    const ctx = createMockContext(null);
    try {
      getUserId(ctx);
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(401);
      expect(error.code).toBe("UNAUTHORIZED");
      expect(error.message).toBe("Unauthorized");
    }
  });
});
