import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminGrantsRouter } from "./admin-grants";

const mockGrantsRepo = {
  listAllWithUsers: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
};
const mockUsersRepo = {
  existsById: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const TARGET_ID = "a0000000-0001-4000-a000-000000000002";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx responses carry `{ message }`.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { adminGrants: mockGrantsRepo, users: mockUsersRepo } as never);
  await next();
});
registerRouterForTest(app, adminGrantsRouter);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /admin-grants", () => {
  it("returns 200 with the grants", async () => {
    mockGrantsRepo.listAllWithUsers.mockResolvedValue([
      { userId: TARGET_ID, userName: "Vi", userEmail: "vi@example.com", section: "custom-tags" },
    ]);

    const res = await app.request("/api/admin/v1/admin-grants");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.grants).toEqual([
      { userId: TARGET_ID, userName: "Vi", userEmail: "vi@example.com", section: "custom-tags" },
    ]);
  });

  it("filters out grants for sections no longer in the registry", async () => {
    mockGrantsRepo.listAllWithUsers.mockResolvedValue([
      { userId: TARGET_ID, userName: "Vi", userEmail: "vi@example.com", section: "custom-tags" },
      { userId: TARGET_ID, userName: "Vi", userEmail: "vi@example.com", section: "removed" },
    ]);

    const res = await app.request("/api/admin/v1/admin-grants");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.grants).toHaveLength(1);
    expect(json.grants[0].section).toBe("custom-tags");
  });
});

describe("PUT /users/{id}/admin-grants/{section}", () => {
  it("adds the grant and returns 204", async () => {
    mockUsersRepo.existsById.mockResolvedValue(true);
    mockGrantsRepo.add.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/users/${TARGET_ID}/admin-grants/custom-tags`, {
      method: "PUT",
    });
    expect(res.status).toBe(204);
    expect(mockGrantsRepo.add).toHaveBeenCalledWith(TARGET_ID, "custom-tags");
  });

  it("returns 404 for an unknown user", async () => {
    mockUsersRepo.existsById.mockResolvedValue(false);

    const res = await app.request(`/api/admin/v1/users/${TARGET_ID}/admin-grants/custom-tags`, {
      method: "PUT",
    });
    expect(res.status).toBe(404);
    expect(mockGrantsRepo.add).not.toHaveBeenCalled();
  });

  it("rejects an unknown section slug with a validation error", async () => {
    const res = await app.request(`/api/admin/v1/users/${TARGET_ID}/admin-grants/not-a-section`, {
      method: "PUT",
    });
    expect(res.status).toBe(400);
    expect(mockGrantsRepo.add).not.toHaveBeenCalled();
  });
});

describe("DELETE /users/{id}/admin-grants/{section}", () => {
  it("removes the grant and returns 204", async () => {
    mockGrantsRepo.remove.mockResolvedValue({ numDeletedRows: 1n });

    const res = await app.request(`/api/admin/v1/users/${TARGET_ID}/admin-grants/custom-tags`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockGrantsRepo.remove).toHaveBeenCalledWith(TARGET_ID, "custom-tags");
  });

  it("returns 404 when the grant does not exist", async () => {
    mockGrantsRepo.remove.mockResolvedValue({ numDeletedRows: 0n });

    const res = await app.request(`/api/admin/v1/users/${TARGET_ID}/admin-grants/custom-tags`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
