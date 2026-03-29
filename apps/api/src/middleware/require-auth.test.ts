import { describe, expect, it, vi } from "vitest";

import { AppError } from "../errors.js";
import { requireAuth } from "./require-auth.js";

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

describe("requireAuth", () => {
  it("throws 401 AppError when user is null", async () => {
    const ctx = createMockContext(null);
    const next = vi.fn(() => Promise.resolve());

    try {
      await requireAuth(ctx, next);
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(401);
      expect(error.code).toBe("UNAUTHORIZED");
      expect(error.message).toBe("Unauthorized");
    }

    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when user is present", async () => {
    const ctx = createMockContext({ id: "user-123" });
    const next = vi.fn(() => Promise.resolve());

    await requireAuth(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
