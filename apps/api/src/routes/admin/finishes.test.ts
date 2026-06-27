import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminFinishesRouter } from "./finishes";

const mockRepo = {
  listAll: vi.fn(),
  reorder: vi.fn(),
  getBySlug: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  isInUse: vi.fn(),
  deleteBySlug: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx responses carry `{ message }`.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { finishes: mockRepo, catalog: { recomputeCanonicalRanks: vi.fn() } } as never);
  await next();
});
registerRouterForTest(app, adminFinishesRouter);

const baseRow = {
  slug: "primary",
  label: "Primary",
  sortOrder: 0,
  isWellKnown: false,
};

describe("GET /finishes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the rows", async () => {
    const other = { ...baseRow, slug: "secondary", label: "Secondary", sortOrder: 1 };
    mockRepo.listAll.mockResolvedValue([baseRow, other]);

    const res = await app.request("/api/admin/v1/finishes");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.finishes).toHaveLength(2);
    expect(json.finishes[0].slug).toBe("primary");
  });

  it("returns an empty array when none exist", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/finishes");
    expect(res.status).toBe(200);
    const lintBody = await res.json();
    expect(lintBody.finishes).toEqual([]);
  });
});

describe("PUT /finishes/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on a valid reorder", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, { ...baseRow, slug: "secondary" }]);
    mockRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/finishes/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["secondary", "primary"] }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.reorder).toHaveBeenCalledWith(["secondary", "primary"]);
  });

  it("returns 400 when slugs contain duplicates", async () => {
    const res = await app.request("/api/admin/v1/finishes/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["primary", "primary"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Duplicate");
  });

  it("returns 400 when the slug count does not match", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, { ...baseRow, slug: "secondary" }]);
    const res = await app.request("/api/admin/v1/finishes/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["primary"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Expected");
  });
});

describe("POST /finishes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 when created", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue({ ...baseRow, slug: "secondary", label: "Secondary" });
    const res = await app.request("/api/admin/v1/finishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "secondary", label: "Secondary" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.finish.slug).toBe("secondary");
    expect(mockRepo.create).toHaveBeenCalledWith({ slug: "secondary", label: "Secondary" });
  });

  it("returns 409 when the slug already exists", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    const res = await app.request("/api/admin/v1/finishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "secondary", label: "Secondary" }),
    });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("already exists");
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /finishes/:slug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when updating the label", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/finishes/primary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Renamed" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith("primary", { label: "Renamed" });
  });

  it("returns 404 when the slug does not exist", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/finishes/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Renamed" }),
    });
    expect(res.status).toBe(404);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /finishes/:slug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when not well-known and not in use", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.isInUse.mockResolvedValue(false);
    mockRepo.deleteBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/finishes/primary", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteBySlug).toHaveBeenCalledWith("primary");
  });

  it("returns 404 when the slug does not exist", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/finishes/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });

  it("returns 409 when the row is well-known", async () => {
    mockRepo.getBySlug.mockResolvedValue({ ...baseRow, isWellKnown: true });
    const res = await app.request("/api/admin/v1/finishes/primary", { method: "DELETE" });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("well-known");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });

  it("returns 409 when the row is in use", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.isInUse.mockResolvedValue(true);
    const res = await app.request("/api/admin/v1/finishes/primary", { method: "DELETE" });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("in use");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });
});
