import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminCustomTagsRouter } from "./custom-tags";

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

const mockTagRepo = {
  listAll: vi.fn(),
  assignmentsByCard: vi.fn(),
  getBySlug: vi.fn(),
  getById: vi.fn(),
  getMaxSortOrder: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
  addToCards: vi.fn(),
  clearAssignments: vi.fn(),
  tagIdsForCard: vi.fn(),
  setForCard: vi.fn(),
};

const mockCatalog = {
  cardById: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    customTagCategories: mockCatRepo,
    customTags: mockTagRepo,
    catalog: mockCatalog,
  } as never);
  await next();
});
registerRouterForTest(app, adminCustomTagsRouter);

const now = new Date("2026-03-17T00:00:00.000Z");
const CAT_ID = "019d4999-4219-72f6-b7bb-64004e1b1b01";
const TAG_ID = "019d4999-4219-72f6-b7bb-64004e1b1b02";
const CARD_ID = "019d4999-4219-72f6-b7bb-64004e1b1b03";

const catRow = {
  id: CAT_ID,
  slug: "region",
  label: "Region",
  description: null,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
};

const tagRow = {
  id: TAG_ID,
  slug: "bandle-city",
  label: "Bandle City",
  category: "region",
  categoryLabel: "Region",
  categoryId: CAT_ID,
  description: null,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
};

describe("GET /custom-tag-categories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with categories and tag counts", async () => {
    mockCatRepo.listAll.mockResolvedValue([catRow]);
    mockTagRepo.listAll.mockResolvedValue([tagRow, { ...tagRow, id: "x", slug: "demacia" }]);
    const res = await app.request("/api/admin/v1/custom-tag-categories");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.categories).toHaveLength(1);
    expect(json.categories[0].tagCount).toBe(2);
    expect(json.categories[0].createdAt).toBe(now.toISOString());
  });
});

describe("POST /custom-tag-categories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 and creates the category", async () => {
    mockCatRepo.getBySlug.mockResolvedValue(undefined);
    mockCatRepo.getMaxSortOrder.mockResolvedValue(2);
    mockCatRepo.create.mockResolvedValue({ ...catRow, sortOrder: 3 });
    const res = await app.request("/api/admin/v1/custom-tag-categories", {
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
    const res = await app.request("/api/admin/v1/custom-tag-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "region", label: "Region" }),
    });
    expect(res.status).toBe(409);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("already exists");
    expect(mockCatRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /custom-tag-categories/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and updates", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockCatRepo.update.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/custom-tag-categories/${CAT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Regions" }),
    });
    expect(res.status).toBe(204);
    expect(mockCatRepo.update).toHaveBeenCalledWith(CAT_ID, { label: "Regions" });
  });

  it("returns 404 when the category does not exist", async () => {
    mockCatRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/custom-tag-categories/${CAT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("not found");
    expect(mockCatRepo.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /custom-tag-categories/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when not in use", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockCatRepo.isInUse.mockResolvedValue(false);
    mockCatRepo.deleteById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/custom-tag-categories/${CAT_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockCatRepo.deleteById).toHaveBeenCalledWith(CAT_ID);
  });

  it("returns 409 when the category is in use", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockCatRepo.isInUse.mockResolvedValue(true);
    const res = await app.request(`/api/admin/v1/custom-tag-categories/${CAT_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("in use");
    expect(mockCatRepo.deleteById).not.toHaveBeenCalled();
  });
});

describe("GET /custom-tags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with tags and card counts from assignments", async () => {
    mockTagRepo.listAll.mockResolvedValue([tagRow]);
    mockTagRepo.assignmentsByCard.mockResolvedValue(
      new Map([
        ["card-1", ["bandle-city"]],
        ["card-2", ["bandle-city"]],
      ]),
    );
    const res = await app.request("/api/admin/v1/custom-tags");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.tags).toHaveLength(1);
    expect(json.tags[0].cardCount).toBe(2);
    expect(json.tags[0].createdAt).toBe(now.toISOString());
  });
});

describe("GET /custom-tags/assignments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the assignment map as an object", async () => {
    mockTagRepo.assignmentsByCard.mockResolvedValue(new Map([["card-1", ["bandle-city"]]]));
    const res = await app.request("/api/admin/v1/custom-tags/assignments");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.assignments).toEqual({ "card-1": ["bandle-city"] });
  });
});

describe("POST /custom-tags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 and creates the tag", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockTagRepo.getBySlug.mockResolvedValue(undefined);
    mockTagRepo.getMaxSortOrder.mockResolvedValue(0);
    mockTagRepo.create.mockResolvedValue({ ...tagRow, sortOrder: 1 });
    const res = await app.request("/api/admin/v1/custom-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "bandle-city", label: "Bandle City", categoryId: CAT_ID }),
    });
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.tag.cardCount).toBe(0);
    expect(mockTagRepo.create).toHaveBeenCalledWith({
      slug: "bandle-city",
      label: "Bandle City",
      categoryId: CAT_ID,
      description: undefined,
      sortOrder: 1,
    });
  });

  it("returns 409 when the slug already exists", async () => {
    mockCatRepo.getById.mockResolvedValue(catRow);
    mockTagRepo.getBySlug.mockResolvedValue(tagRow);
    const res = await app.request("/api/admin/v1/custom-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "bandle-city", label: "Bandle City", categoryId: CAT_ID }),
    });
    expect(res.status).toBe(409);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("already exists");
    expect(mockTagRepo.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown category", async () => {
    mockCatRepo.getById.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/custom-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "bandle-city", label: "Bandle City", categoryId: CAT_ID }),
    });
    expect(res.status).toBe(400);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("Unknown category id");
    expect(mockTagRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /custom-tags/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and updates", async () => {
    mockTagRepo.getById.mockResolvedValue(tagRow);
    mockTagRepo.update.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/custom-tags/${TAG_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Bandle" }),
    });
    expect(res.status).toBe(204);
    expect(mockTagRepo.update).toHaveBeenCalledWith(TAG_ID, { label: "Bandle" });
  });

  it("returns 404 when the tag does not exist", async () => {
    mockTagRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/custom-tags/${TAG_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("not found");
    expect(mockTagRepo.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /custom-tags/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and deletes", async () => {
    mockTagRepo.getById.mockResolvedValue(tagRow);
    mockTagRepo.deleteById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/custom-tags/${TAG_ID}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockTagRepo.deleteById).toHaveBeenCalledWith(TAG_ID);
  });

  it("returns 404 when the tag does not exist", async () => {
    mockTagRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/custom-tags/${TAG_ID}`, { method: "DELETE" });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("not found");
    expect(mockTagRepo.deleteById).not.toHaveBeenCalled();
  });
});

describe("POST /custom-tags/:id/cards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the counts", async () => {
    mockTagRepo.getById.mockResolvedValue(tagRow);
    mockTagRepo.addToCards.mockResolvedValue(2);
    const res = await app.request(`/api/admin/v1/custom-tags/${TAG_ID}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardIds: [CARD_ID, "019d4999-4219-72f6-b7bb-64004e1b1b04"] }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ added: 2, requested: 2 });
    expect(mockTagRepo.addToCards).toHaveBeenCalledWith(TAG_ID, [
      CARD_ID,
      "019d4999-4219-72f6-b7bb-64004e1b1b04",
    ]);
  });
});

describe("DELETE /custom-tags/:id/cards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the removed count and keeps the tag", async () => {
    mockTagRepo.getById.mockResolvedValue(tagRow);
    mockTagRepo.clearAssignments.mockResolvedValue(3);
    const res = await app.request(`/api/admin/v1/custom-tags/${TAG_ID}/cards`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ removed: 3 });
    expect(mockTagRepo.clearAssignments).toHaveBeenCalledWith(TAG_ID);
    expect(mockTagRepo.deleteById).not.toHaveBeenCalled();
  });

  it("returns 404 when the tag does not exist", async () => {
    mockTagRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/custom-tags/${TAG_ID}/cards`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toContain("not found");
    expect(mockTagRepo.clearAssignments).not.toHaveBeenCalled();
  });
});

describe("GET /cards/:id/custom-tags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the card's tag ids", async () => {
    mockCatalog.cardById.mockResolvedValue({ id: CARD_ID });
    mockTagRepo.tagIdsForCard.mockResolvedValue([TAG_ID]);
    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/custom-tags`);
    expect(res.status).toBe(200);
    const lintBody = await readJson(res);
    expect(lintBody.customTagIds).toEqual([TAG_ID]);
  });

  it("returns 404 when the card does not exist", async () => {
    mockCatalog.cardById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/custom-tags`);
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("Card not found");
    expect(mockTagRepo.tagIdsForCard).not.toHaveBeenCalled();
  });
});

describe("PUT /cards/:id/custom-tags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and sets the tags", async () => {
    mockCatalog.cardById.mockResolvedValue({ id: CARD_ID });
    mockTagRepo.getById.mockResolvedValue(tagRow);
    mockTagRepo.setForCard.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/custom-tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customTagIds: [TAG_ID] }),
    });
    expect(res.status).toBe(204);
    expect(mockTagRepo.setForCard).toHaveBeenCalledWith(CARD_ID, [TAG_ID]);
  });

  it("returns 404 when the card does not exist", async () => {
    mockCatalog.cardById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/custom-tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customTagIds: [] }),
    });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toContain("Card not found");
    expect(mockTagRepo.setForCard).not.toHaveBeenCalled();
  });
});
