import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminArtVariantsRouter } from "./art-variants";

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
  c.set("repos", { artVariants: mockRepo } as never);
  await next();
});
registerRouterForTest(app, adminArtVariantsRouter);

const baseRow = {
  slug: "full-art",
  label: "Full Art",
  sortOrder: 0,
  isWellKnown: false,
};

describe("GET /art-variants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the art variants", async () => {
    const other = { ...baseRow, slug: "borderless", label: "Borderless", sortOrder: 1 };
    mockRepo.listAll.mockResolvedValue([baseRow, other]);

    const res = await app.request("/api/admin/v1/art-variants");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.artVariants).toHaveLength(2);
    expect(json.artVariants[0].slug).toBe("full-art");
  });

  it("returns an empty array when none exist", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/art-variants");
    expect(res.status).toBe(200);
    const lintBody = await res.json();
    expect(lintBody.artVariants).toEqual([]);
  });
});

describe("PUT /art-variants/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on a valid reorder", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, { ...baseRow, slug: "borderless" }]);
    mockRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/art-variants/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["borderless", "full-art"] }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.reorder).toHaveBeenCalledWith(["borderless", "full-art"]);
  });

  it("returns 400 when slugs contain duplicates", async () => {
    const res = await app.request("/api/admin/v1/art-variants/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["full-art", "full-art"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Duplicate");
  });
});

describe("POST /art-variants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 when created", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue({ ...baseRow, slug: "etched", label: "Etched" });
    const res = await app.request("/api/admin/v1/art-variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "etched", label: "Etched" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.artVariant.slug).toBe("etched");
    expect(mockRepo.create).toHaveBeenCalledWith({ slug: "etched", label: "Etched" });
  });

  it("returns 409 when the slug already exists", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    const res = await app.request("/api/admin/v1/art-variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "full-art", label: "Full Art" }),
    });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("already exists");
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /art-variants/:slug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when updating the label", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/art-variants/full-art", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Renamed" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith("full-art", { label: "Renamed" });
  });

  it("returns 404 when the slug does not exist", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/art-variants/missing", {
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

describe("DELETE /art-variants/:slug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when not well-known and not in use", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.isInUse.mockResolvedValue(false);
    mockRepo.deleteBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/art-variants/full-art", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteBySlug).toHaveBeenCalledWith("full-art");
  });

  it("returns 404 when the slug does not exist", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/art-variants/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });

  it("returns 409 when the art variant is well-known", async () => {
    mockRepo.getBySlug.mockResolvedValue({ ...baseRow, isWellKnown: true });
    const res = await app.request("/api/admin/v1/art-variants/full-art", { method: "DELETE" });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("well-known");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });

  it("returns 409 when the art variant is in use", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.isInUse.mockResolvedValue(true);
    const res = await app.request("/api/admin/v1/art-variants/full-art", { method: "DELETE" });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("in use");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });
});
