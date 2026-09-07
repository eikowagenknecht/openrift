import { describe, expect, it, vi } from "vitest";

import { AppError } from "../errors.js";
import { requireAuth } from "./require-auth.js";

function createMockContext(session: { user: { id: string } } | null) {
  const vars: Record<string, unknown> = {
    auth: {
      api: {
        getSession: () => Promise.resolve(session),
      },
    },
  };
  return {
    get: (key: string) => vars[key],
    set: (key: string, value: unknown) => {
      vars[key] = value;
    },
    req: { raw: { headers: new Headers() } },
  } as any;
}

describe("requireAuth", () => {
  it("throws 401 AppError when no session", async () => {
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

  it("calls next() and populates context when session has user", async () => {
    const ctx = createMockContext({ user: { id: "user-123" } });
    const next = vi.fn(() => Promise.resolve());

    await requireAuth(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.get("user")).toEqual({ id: "user-123" });
  });
});
