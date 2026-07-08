/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../errors.js";
import { requireAdmin } from "./require-admin.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockIsAdmin = vi.fn<(userId: string) => Promise<boolean>>();
const mockSectionsForUser = vi.fn<(userId: string) => Promise<string[]>>();

function createMockContext(options: { user?: { id: string } | null; path?: string }) {
  const session = options.user ? { user: options.user, session: { id: "s-1" } } : null;
  const vars: Record<string, unknown> = {
    auth: {
      api: {
        getSession: () => Promise.resolve(session),
      },
    },
    repos: {
      admins: { isAdmin: mockIsAdmin },
      adminGrants: { sectionsForUser: mockSectionsForUser },
    },
  };

  return {
    get: (key: string) => vars[key],
    set: (key: string, value: unknown) => {
      vars[key] = value;
    },
    req: { raw: { headers: new Headers() }, path: options.path ?? "/api/admin/v1/sets" },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
//
// getAdminAccess caches positive results (any access) per user id for 30s at
// module level, so every test uses a distinct user id.
// ---------------------------------------------------------------------------

describe("require-admin middleware", () => {
  beforeEach(() => {
    mockIsAdmin.mockReset();
    mockSectionsForUser.mockReset();
    mockSectionsForUser.mockResolvedValue([]);
  });

  describe("requireAdmin middleware", () => {
    it("throws 401 if no user in session", async () => {
      const ctx = createMockContext({ user: null });
      const next = vi.fn(() => Promise.resolve());

      try {
        await requireAdmin(ctx, next);
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
        await requireAdmin(ctx, next);
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

      await requireAdmin(ctx, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("uses cache on second call for same admin user", async () => {
      mockIsAdmin.mockResolvedValue(true);
      const ctx = createMockContext({ user: { id: "cached-admin" } });
      const next = vi.fn(() => Promise.resolve());

      // First call — hits repo
      await requireAdmin(ctx, next);
      expect(mockIsAdmin).toHaveBeenCalledTimes(1);

      // Second call — should use cache (no additional repo query)
      await requireAdmin(ctx, next);
      expect(mockIsAdmin).toHaveBeenCalledTimes(1);
    });
  });

  describe("per-section grants", () => {
    it("lets a grant holder through to a path of their section", async () => {
      mockIsAdmin.mockResolvedValue(false);
      mockSectionsForUser.mockResolvedValue(["custom-tags"]);
      const ctx = createMockContext({
        user: { id: "grant-user-1" },
        path: "/api/admin/v1/custom-tags",
      });
      const next = vi.fn(() => Promise.resolve());

      await requireAdmin(ctx, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("lets a grant holder through to the me probe", async () => {
      mockIsAdmin.mockResolvedValue(false);
      mockSectionsForUser.mockResolvedValue(["custom-tags"]);
      const ctx = createMockContext({
        user: { id: "grant-user-2" },
        path: "/api/admin/v1/me",
      });
      const next = vi.fn(() => Promise.resolve());

      await requireAdmin(ctx, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("throws 403 for a grant holder on a path outside their section", async () => {
      mockIsAdmin.mockResolvedValue(false);
      mockSectionsForUser.mockResolvedValue(["custom-tags"]);
      const ctx = createMockContext({
        user: { id: "grant-user-3" },
        path: "/api/admin/v1/site-settings",
      });
      const next = vi.fn(() => Promise.resolve());

      try {
        await requireAdmin(ctx, next);
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(AppError);
        expect(error.status).toBe(403);
        expect(error.code).toBe("FORBIDDEN");
      }
      expect(next).not.toHaveBeenCalled();
    });

    it("ignores grants for sections no longer in the registry", async () => {
      mockIsAdmin.mockResolvedValue(false);
      mockSectionsForUser.mockResolvedValue(["removed-section"]);
      const ctx = createMockContext({
        user: { id: "grant-user-4" },
        path: "/api/admin/v1/me",
      });
      const next = vi.fn(() => Promise.resolve());

      try {
        await requireAdmin(ctx, next);
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(AppError);
        expect(error.status).toBe(403);
      }
    });

    it("caches grant-holder access on second call", async () => {
      mockIsAdmin.mockResolvedValue(false);
      mockSectionsForUser.mockResolvedValue(["custom-tags"]);
      const ctx = createMockContext({
        user: { id: "grant-user-5" },
        path: "/api/admin/v1/custom-tags",
      });
      const next = vi.fn(() => Promise.resolve());

      await requireAdmin(ctx, next);
      await requireAdmin(ctx, next);
      expect(mockIsAdmin).toHaveBeenCalledTimes(1);
      expect(mockSectionsForUser).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(2);
    });
  });
});
