/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined,
   import/first
   -- test file: mocks require empty fns, explicit undefined, and ordering */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../errors.js";

// ---------------------------------------------------------------------------
// Mock adminsRepo — controls what isAdmin returns per test
// ---------------------------------------------------------------------------

const mockIsAdmin = vi.fn<(userId: string) => Promise<boolean>>();

vi.mock("../repositories/admins.js", () => ({
  adminsRepo: () => ({ isAdmin: mockIsAdmin }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(options: { user?: { id: string } | null; db?: unknown }) {
  const vars: Record<string, unknown> = {
    db: options.db ?? {},
    user: options.user === undefined ? null : options.user,
  };

  return {
    get: (key: string) => vars[key],
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("require-admin middleware", () => {
  let requireAdminMiddleware: any;

  beforeEach(async () => {
    mockIsAdmin.mockReset();
    const mod = await import("./require-admin.js");
    requireAdminMiddleware = mod.requireAdmin;
  });

  describe("requireAdmin middleware", () => {
    it("throws 401 if no user in context", async () => {
      const ctx = createMockContext({ user: null });
      const next = vi.fn(() => Promise.resolve());

      try {
        await requireAdminMiddleware(ctx, next);
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(AppError);
        expect(error.status).toBe(401);
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("throws 403 if user is not an admin", async () => {
      mockIsAdmin.mockResolvedValue(false);
      const ctx = createMockContext({ user: { id: "user-non-admin" } });
      const next = vi.fn(() => Promise.resolve());

      try {
        await requireAdminMiddleware(ctx, next);
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(AppError);
        expect(error.status).toBe(403);
        expect(error.code).toBe("FORBIDDEN");
      }
    });

    it("calls next() if user is admin", async () => {
      mockIsAdmin.mockResolvedValue(true);
      const ctx = createMockContext({ user: { id: "admin-user" } });
      const next = vi.fn(() => Promise.resolve());

      await requireAdminMiddleware(ctx, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("uses cache on second call for same admin user", async () => {
      mockIsAdmin.mockResolvedValue(true);
      const ctx = createMockContext({ user: { id: "cached-admin" } });
      const next = vi.fn(() => Promise.resolve());

      // First call — hits repo
      await requireAdminMiddleware(ctx, next);
      expect(mockIsAdmin).toHaveBeenCalledTimes(1);

      // Second call — should use cache (no additional repo query)
      await requireAdminMiddleware(ctx, next);
      expect(mockIsAdmin).toHaveBeenCalledTimes(1);
    });
  });
});
