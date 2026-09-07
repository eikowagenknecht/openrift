import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminDomainsRouter } from "./admin-domains";

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

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { domains: mockRepo } as never);
  await next();
});
registerRouterForTest(app, adminDomainsRouter);

const baseRow = {
  slug: "primary",
  label: "Primary",
  sortOrder: 0,
  isWellKnown: false,
  color: "#aabbcc",
};

describe("GET /domains", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the rows", async () => {
    const other = { ...baseRow, slug: "secondary", label: "Secondary", sortOrder: 1 };
    mockRepo.listAll.mockResolvedValue([baseRow, other]);

    const res = await app.request("/api/admin/v1/domains");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.domains).toHaveLength(2);
    expect(json.domains[0].slug).toBe("primary");
  });

  it("returns an empty array when none exist", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/domains");
    expect(res.status).toBe(200);
    const lintBody = await readJson(res);
    expect(lintBody.domains).toEqual([]);
  });
});

describe("PUT /domains/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on a valid reorder", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, { ...baseRow, slug: "secondary" }]);
    mockRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/domains/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["secondary", "primary"] }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.reorder).toHaveBeenCalledWith(["secondary", "primary"]);
  });

  it("returns 400 when slugs contain duplicates", async () => {
    const res = await app.request("/api/admin/v1/domains/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["primary", "primary"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("Duplicate");
  });

  it("returns 400 when the slug count does not match", async () => {
    mockRepo.listAll.mockResolvedValue([baseRow, { ...baseRow, slug: "secondary" }]);
    const res = await app.request("/api/admin/v1/domains/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["primary"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("Expected");
  });
});

describe("POST /domains", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 when created", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue({
      ...baseRow,
      slug: "secondary",
      label: "Secondary",
      color: "#112233",
    });
    const res = await app.request("/api/admin/v1/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "secondary", label: "Secondary", color: "#112233" }),
    });
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.domain.slug).toBe("secondary");
    expect(mockRepo.create).toHaveBeenCalledWith({
      slug: "secondary",
      label: "Secondary",
      color: "#112233",
    });
  });

  it("returns 409 when the slug already exists", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    const res = await app.request("/api/admin/v1/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "secondary", label: "Secondary", color: "#112233" }),
    });
    expect(res.status).toBe(409);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("already exists");
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /domains/:slug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when updating the label", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/domains/primary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Renamed" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith("primary", { label: "Renamed" });
  });

  it("returns 404 when the slug does not exist", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/domains/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Renamed" }),
    });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /domains/:slug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when not well-known and not in use", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.isInUse.mockResolvedValue(false);
    mockRepo.deleteBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/domains/primary", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteBySlug).toHaveBeenCalledWith("primary");
  });

  it("returns 404 when the slug does not exist", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/domains/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });

  it("returns 409 when the row is well-known", async () => {
    mockRepo.getBySlug.mockResolvedValue({ ...baseRow, isWellKnown: true });
    const res = await app.request("/api/admin/v1/domains/primary", { method: "DELETE" });
    expect(res.status).toBe(409);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("well-known");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });

  it("returns 409 when the row is in use", async () => {
    mockRepo.getBySlug.mockResolvedValue(baseRow);
    mockRepo.isInUse.mockResolvedValue(true);
    const res = await app.request("/api/admin/v1/domains/primary", { method: "DELETE" });
    expect(res.status).toBe(409);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("in use");
    expect(mockRepo.deleteBySlug).not.toHaveBeenCalled();
  });
});
