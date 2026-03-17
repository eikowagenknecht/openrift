/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined,
   import/first
   -- test file: mocks require empty fns, explicit undefined, and ordering */
import { beforeEach, describe, expect, it, vi } from "vitest";
// ---------------------------------------------------------------------------
// We need to re-import the module for each group to reset the module-level
// adminCache. Use mock.module to intercept the errors import.
// ---------------------------------------------------------------------------

import { AppError } from "../errors.js";

// Since adminCache is module-scoped, we import directly and rely on
// cache expiry via time manipulation.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb(isAdminUser: boolean) {
  const chain: any = {};
  chain.select = () => chain;
  chain.where = () => chain;
  chain.executeTakeFirst = () => Promise.resolve(isAdminUser ? { userId: "user-1" } : undefined);

  return {
    selectFrom: () => chain,
  };
}

function createMockContext(options: { user?: { id: string } | null; db?: any }) {
  const vars: Record<string, any> = {
    db: options.db ?? createMockDb(false),
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
  // We dynamically import to get a fresh module with a fresh cache
  let requireAdminMiddleware: any;

  beforeEach(async () => {
    // Clear module cache to get fresh adminCache each time
    // We can't easily bust the cache with bun, so we'll import once
    // and use time-based cache expiry tests instead
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
      const db = createMockDb(false);
      const ctx = createMockContext({ user: { id: "user-non-admin" }, db });
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
      const db = createMockDb(true);
      const ctx = createMockContext({ user: { id: "admin-user" }, db });
      const next = vi.fn(() => Promise.resolve());

      await requireAdminMiddleware(ctx, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("uses cache on second call for same admin user", async () => {
      let queryCount = 0;
      const chain: any = {};
      chain.select = () => chain;
      chain.where = () => chain;
      chain.executeTakeFirst = () => {
        queryCount++;
        return Promise.resolve({ userId: "cached-admin" });
      };
      const db = { selectFrom: () => chain };

      const ctx = createMockContext({ user: { id: "cached-admin" }, db });
      const next = vi.fn(() => Promise.resolve());

      // First call — hits DB
      await requireAdminMiddleware(ctx, next);
      expect(queryCount).toBe(1);

      // Second call — should use cache (no additional DB query)
      await requireAdminMiddleware(ctx, next);
      expect(queryCount).toBe(1);
    });
  });
});
