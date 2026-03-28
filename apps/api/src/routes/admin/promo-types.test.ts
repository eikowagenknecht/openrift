import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { adminPromoTypesRoute } from "./promo-types";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  listAll: vi.fn(),
  getBySlug: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reorder: vi.fn(),
  deleteById: vi.fn(),
  isInUse: vi.fn(),
  renamePrintingSlugs: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { promoTypes: mockRepo } as never);
    await next();
  })
  .route("/api/v1", adminPromoTypesRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const now = new Date("2026-03-17T00:00:00Z");

const dbPromoType = {
  id: "a0000000-0001-4000-a000-000000000010",
  slug: "nexus-night",
  label: "Nexus Night",
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
};

const dbPromoType2 = {
  id: "a0000000-0001-4000-a000-000000000020",
  slug: "shadow-promo",
  label: "Shadow Promo",
  sortOrder: 1,
  createdAt: now,
  updatedAt: now,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/promo-types", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with serialized promo types", async () => {
    mockRepo.listAll.mockResolvedValue([dbPromoType, dbPromoType2]);
    const res = await app.request("/api/v1/promo-types");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.promoTypes).toHaveLength(2);
    expect(json.promoTypes[0]).toEqual({
      id: dbPromoType.id,
      slug: "nexus-night",
      label: "Nexus Night",
      sortOrder: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("returns empty array when no promo types exist", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/v1/promo-types");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.promoTypes).toEqual([]);
  });
});

describe("PUT /api/v1/promo-types/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful reorder", async () => {
    mockRepo.listAll.mockResolvedValue([dbPromoType, dbPromoType2]);
    mockRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/promo-types/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [dbPromoType2.id, dbPromoType.id] }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.reorder).toHaveBeenCalledWith([dbPromoType2.id, dbPromoType.id]);
  });

  it("returns 400 when ids contain duplicates", async () => {
    const res = await app.request("/api/v1/promo-types/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [dbPromoType.id, dbPromoType.id] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Duplicate");
  });

  it("returns 400 when ids count does not match existing promo types", async () => {
    mockRepo.listAll.mockResolvedValue([dbPromoType, dbPromoType2]);
    const res = await app.request("/api/v1/promo-types/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [dbPromoType.id] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Expected 2");
  });

  it("returns 400 when ids contain unknown IDs", async () => {
    const unknownId = "a0000000-0001-4000-a000-000000000099";
    mockRepo.listAll.mockResolvedValue([dbPromoType, dbPromoType2]);
    const res = await app.request("/api/v1/promo-types/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [dbPromoType.id, unknownId] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Unknown promo type IDs");
  });
});

describe("POST /api/v1/promo-types", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 with created promo type", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    const created = {
      id: dbPromoType.id,
      slug: "nexus-night",
      label: "Nexus Night",
      sortOrder: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    mockRepo.create.mockResolvedValue(created);
    const res = await app.request("/api/v1/promo-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "nexus-night", label: "Nexus Night" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.promoType.slug).toBe("nexus-night");
    expect(mockRepo.create).toHaveBeenCalledWith({
      slug: "nexus-night",
      label: "Nexus Night",
      sortOrder: undefined,
    });
  });

  it("passes sortOrder when provided", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue({ ...dbPromoType, sortOrder: 5 });
    const res = await app.request("/api/v1/promo-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "nexus-night", label: "Nexus Night", sortOrder: 5 }),
    });
    expect(res.status).toBe(201);
    expect(mockRepo.create).toHaveBeenCalledWith({
      slug: "nexus-night",
      label: "Nexus Night",
      sortOrder: 5,
    });
  });

  it("returns 409 when slug already exists", async () => {
    mockRepo.getBySlug.mockResolvedValue(dbPromoType);
    const res = await app.request("/api/v1/promo-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "nexus-night", label: "Nexus Night" }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("already exists");
  });
});

describe("PATCH /api/v1/promo-types/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when updating label only", async () => {
    mockRepo.getById.mockResolvedValue(dbPromoType);
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/promo-types/${dbPromoType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Updated Label" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith(dbPromoType.id, { label: "Updated Label" });
    expect(mockRepo.renamePrintingSlugs).not.toHaveBeenCalled();
  });

  it("returns 204 and renames printing slugs when slug changes", async () => {
    mockRepo.getById.mockResolvedValue(dbPromoType);
    mockRepo.getBySlug.mockResolvedValue(undefined);
    mockRepo.update.mockResolvedValue(undefined);
    mockRepo.renamePrintingSlugs.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/promo-types/${dbPromoType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "new-slug" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith(dbPromoType.id, { slug: "new-slug" });
    expect(mockRepo.renamePrintingSlugs).toHaveBeenCalledWith(
      dbPromoType.id,
      ":nexus-night",
      ":new-slug",
    );
  });

  it("does not rename printing slugs when slug is unchanged", async () => {
    mockRepo.getById.mockResolvedValue(dbPromoType);
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/promo-types/${dbPromoType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "nexus-night" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.renamePrintingSlugs).not.toHaveBeenCalled();
  });

  it("returns 404 when promo type not found", async () => {
    mockRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/promo-types/${dbPromoType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when new slug conflicts with existing promo type", async () => {
    mockRepo.getById.mockResolvedValue(dbPromoType);
    mockRepo.getBySlug.mockResolvedValue(dbPromoType2);
    const res = await app.request(`/api/v1/promo-types/${dbPromoType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "shadow-promo" }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("already in use");
  });
});

describe("DELETE /api/v1/promo-types/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful deletion", async () => {
    mockRepo.getById.mockResolvedValue(dbPromoType);
    mockRepo.isInUse.mockResolvedValue(false);
    mockRepo.deleteById.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/promo-types/${dbPromoType.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteById).toHaveBeenCalledWith(dbPromoType.id);
  });

  it("returns 404 when promo type not found", async () => {
    mockRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/promo-types/${dbPromoType.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when promo type is in use", async () => {
    mockRepo.getById.mockResolvedValue(dbPromoType);
    mockRepo.isInUse.mockResolvedValue(true);
    const res = await app.request(`/api/v1/promo-types/${dbPromoType.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("in use");
  });
});
