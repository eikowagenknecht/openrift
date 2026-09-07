import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminCoreRouter } from "./core";

// getAdminAccess caches positive results per user id for 30s (module-level),
// so each test uses a distinct user id.
const mockAdminsRepo = { isAdmin: vi.fn() };
const mockAdminGrantsRepo = { sectionsForUser: vi.fn() };

let userId = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: userId } as never);
  c.set("repos", { admins: mockAdminsRepo, adminGrants: mockAdminGrantsRepo } as never);
  await next();
});
registerRouterForTest(app, adminCoreRouter);

describe("GET /api/admin/v1/me", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns isAdmin true with no sections for a full admin", async () => {
    userId = "a0000000-0001-4000-a000-000000000001";
    mockAdminsRepo.isAdmin.mockResolvedValue(true);

    const res = await app.request("/api/admin/v1/me");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ isAdmin: true, sections: [] });
    expect(mockAdminGrantsRepo.sectionsForUser).not.toHaveBeenCalled();
  });

  it("returns granted sections for a non-admin grant holder", async () => {
    userId = "a0000000-0001-4000-a000-000000000002";
    mockAdminsRepo.isAdmin.mockResolvedValue(false);
    mockAdminGrantsRepo.sectionsForUser.mockResolvedValue(["custom-tags"]);

    const res = await app.request("/api/admin/v1/me");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ isAdmin: false, sections: ["custom-tags"] });
  });

  it("drops grant slugs that are no longer in the section registry", async () => {
    userId = "a0000000-0001-4000-a000-000000000003";
    mockAdminsRepo.isAdmin.mockResolvedValue(false);
    mockAdminGrantsRepo.sectionsForUser.mockResolvedValue(["removed-section", "custom-tags"]);

    const res = await app.request("/api/admin/v1/me");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ isAdmin: false, sections: ["custom-tags"] });
  });
});
