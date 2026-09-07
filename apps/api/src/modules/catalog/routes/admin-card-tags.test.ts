import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminCardTagsRouter } from "./admin-card-tags";

const mockCatRepo = {
  listAll: vi.fn(),
  getBySlug: vi.fn(),
  getById: vi.fn(),
  getMaxSortOrder: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
  isInUse: vi.fn(),
};

const mockDefRepo = {
  listAll: vi.fn(),
  setCategory: vi.fn(),
  classifyMissing: vi.fn(),
  distinctCardTags: vi.fn(),
};

const mockCatalog = {
  championIdentifierTags: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    tagCategories: mockCatRepo,
    tagDefinitions: mockDefRepo,
    catalog: mockCatalog,
  } as never);
  await next();
});
registerRouterForTest(app, adminCardTagsRouter);

const now = new Date("2026-03-17T00:00:00.000Z");
const CAT_ID = "019d4999-4219-72f6-b7bb-64004e1b1b01";

const catRow = {
  id: CAT_ID,
  slug: "region",
  label: "Region",
  description: null,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
};

describe("GET /tag-categories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with categories and tag counts", async () => {
    mockCatRepo.listAll.mockResolvedValue([catRow]);
    mockDefRepo.listAll.mockResolvedValue([
      { tag: "Ionia", categoryId: CAT_ID, category: "region" },
      { tag: "Noxus", categoryId: CAT_ID, category: "region" },
    ]);
    const res = await app.request("/api/admin/v1/tag-categories");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.categories).toHaveLength(1);
    expect(json.categories[0].tagCount).toBe(2);
    expect(json.categories[0].createdAt).toBe(now.toISOString());
  });
});

describe("POST /tag-categories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 and creates the category", async () => {
    mockCatRepo.getBySlug.mockResolvedValue(undefined);
    mockCatRepo.getMaxSortOrder.mockResolvedValue(2);
    mockCatRepo.create.mockResolvedValue({ ...catRow, sortOrder: 3 });
    const res = await app.request("/api/admin/v1/tag-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "region", label: "Region" }),
    });
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.category.tagCount).toBe(0);
    expect(mockCatRepo.create).toHaveBeenCalledWith({
      slug: "region",
      label: "Region",
      description: undefined,
      sortOrder: 3,
    });
  });

  it("returns 409 when the slug already exists", async () => {
    mockCatRepo.getBySlug.mockResolvedValue(catRow);
    const res = await app.request("/api/admin/v1/tag-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "region", label: "Region" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects a non-kebab-case slug", async () => {
    const res = await app.request("/api/admin/v1/tag-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "Not A Slug", label: "Nope" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /tag-categories/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on update", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    const res = await app.request(`/api/admin/v1/tag-categories/${CAT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Regions" }),
    });
    expect(res.status).toBe(204);
    expect(mockCatRepo.update).toHaveBeenCalledWith(CAT_ID, { label: "Regions" });
  });

  it("returns 404 for an unknown category", async () => {
    mockCatRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/tag-categories/${CAT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Regions" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when renaming to an existing slug", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockCatRepo.getBySlug.mockResolvedValue({ ...catRow, id: "other" });
    const res = await app.request(`/api/admin/v1/tag-categories/${CAT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "species" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /tag-categories/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and deletes an unused category", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockCatRepo.isInUse.mockResolvedValue(false);
    const res = await app.request(`/api/admin/v1/tag-categories/${CAT_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockCatRepo.deleteById).toHaveBeenCalledWith(CAT_ID);
  });

  it("returns 409 when the category still has tags", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockCatRepo.isInUse.mockResolvedValue(true);
    const res = await app.request(`/api/admin/v1/tag-categories/${CAT_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect(mockCatRepo.deleteById).not.toHaveBeenCalled();
  });
});

describe("GET /card-tags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the distinct tags with counts and classification", async () => {
    mockDefRepo.distinctCardTags.mockResolvedValue([
      { tag: "Ionia", cardCount: 56, categoryId: CAT_ID },
      { tag: "Poro", cardCount: 10, categoryId: null },
    ]);
    const res = await app.request("/api/admin/v1/card-tags");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.tags).toEqual([
      { tag: "Ionia", cardCount: 56, categoryId: CAT_ID },
      { tag: "Poro", cardCount: 10, categoryId: null },
    ]);
  });
});

describe("PUT /card-tags/classification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and classifies the tag", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    const res = await app.request("/api/admin/v1/card-tags/classification", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "Kha’Zix", categoryId: CAT_ID }),
    });
    expect(res.status).toBe(204);
    expect(mockDefRepo.setCategory).toHaveBeenCalledWith("Kha’Zix", CAT_ID);
  });

  it("returns 204 and unclassifies with a null category", async () => {
    const res = await app.request("/api/admin/v1/card-tags/classification", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "Poro", categoryId: null }),
    });
    expect(res.status).toBe(204);
    expect(mockCatRepo.getById).not.toHaveBeenCalled();
    expect(mockDefRepo.setCategory).toHaveBeenCalledWith("Poro", null);
  });

  it("returns 400 for an unknown category", async () => {
    mockCatRepo.getById.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/card-tags/classification", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "Poro", categoryId: CAT_ID }),
    });
    expect(res.status).toBe(400);
    expect(mockDefRepo.setCategory).not.toHaveBeenCalled();
  });

  it("rejects a tag with surrounding whitespace", async () => {
    const res = await app.request("/api/admin/v1/card-tags/classification", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: " Poro", categoryId: null }),
    });
    expect(res.status).toBe(400);
    expect(mockDefRepo.setCategory).not.toHaveBeenCalled();
  });
});

describe("POST /card-tags/detect-legends", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("classifies unclassified Legend tags into the given category", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockCatalog.championIdentifierTags.mockResolvedValue(["Darius", "Kha’Zix", "Master Yi"]);
    mockDefRepo.classifyMissing.mockResolvedValue(2);
    const res = await app.request("/api/admin/v1/card-tags/detect-legends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: CAT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ found: 3, assigned: 2 });
    expect(mockDefRepo.classifyMissing).toHaveBeenCalledWith(
      ["Darius", "Kha’Zix", "Master Yi"],
      CAT_ID,
    );
  });

  it("drops empty or untrimmed tags before classifying", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockCatalog.championIdentifierTags.mockResolvedValue(["", " Darius", "Poppy"]);
    mockDefRepo.classifyMissing.mockResolvedValue(1);
    const res = await app.request("/api/admin/v1/card-tags/detect-legends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: CAT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ found: 1, assigned: 1 });
    expect(mockDefRepo.classifyMissing).toHaveBeenCalledWith(["Poppy"], CAT_ID);
  });

  it("returns 400 for an unknown category", async () => {
    mockCatRepo.getById.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/card-tags/detect-legends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: CAT_ID }),
    });
    expect(res.status).toBe(400);
    expect(mockDefRepo.classifyMissing).not.toHaveBeenCalled();
  });
});
