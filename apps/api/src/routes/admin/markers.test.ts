import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { Hono } from "hono";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appErrorInterceptor } from "../../orpc/app-error-interceptor.js";
import { buildApiContext } from "../../orpc/context.js";
import type { Variables } from "../../types.js";
import { adminMarkersRouter } from "./markers";

const mockRepo = {
  listAll: vi.fn(),
  getById: vi.fn(),
  getBySlug: vi.fn(),
  getMaxSortOrder: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
  isInUse: vi.fn(),
  reorder: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const handler = new OpenAPIHandler(adminMarkersRouter, { interceptors: [appErrorInterceptor] });
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { markers: mockRepo } as never);
  await next();
});
const handle = async (c: Context<{ Variables: Variables }>) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    context: buildApiContext(c),
  });
  if (matched && response) {
    return response;
  }
  return c.notFound();
};
for (const path of [
  "/api/admin/v1/markers",
  "/api/admin/v1/markers/reorder",
  "/api/admin/v1/markers/:id",
]) {
  app.all(path, handle);
}

const now = new Date("2026-03-17T00:00:00.000Z");
const ID_A = "019d4999-4219-72f6-b7bb-64004e1b1bff";
const ID_B = "019d4999-4219-72f6-b7bb-64004e1b1c00";

const markerA = {
  id: ID_A,
  slug: "top-8",
  label: "Top 8",
  description: null,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
};
const markerB = {
  id: ID_B,
  slug: "champion",
  label: "Champion",
  description: "Winner",
  sortOrder: 1,
  createdAt: now,
  updatedAt: now,
};

describe("GET /markers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with markers mapped to ISO timestamps", async () => {
    mockRepo.listAll.mockResolvedValue([markerA, markerB]);
    const res = await app.request("/api/admin/v1/markers");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.markers).toHaveLength(2);
    expect(json.markers[0]).toEqual({
      id: ID_A,
      slug: "top-8",
      label: "Top 8",
      description: null,
      sortOrder: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("returns an empty array when there are no markers", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/markers");
    expect(res.status).toBe(200);
    const lintBody = await res.json();
    expect(lintBody.markers).toEqual([]);
  });
});

describe("PUT /markers/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and reorders", async () => {
    mockRepo.listAll.mockResolvedValue([markerA, markerB]);
    mockRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/markers/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [ID_B, ID_A] }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.reorder).toHaveBeenCalledWith([ID_B, ID_A]);
  });

  it("returns 400 on duplicate ids", async () => {
    const res = await app.request("/api/admin/v1/markers/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [ID_A, ID_A] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Duplicate ids");
  });

  it("returns 400 when the count mismatches", async () => {
    mockRepo.listAll.mockResolvedValue([markerA, markerB]);
    const res = await app.request("/api/admin/v1/markers/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [ID_A] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Expected 2 ids");
  });

  it("returns 400 on unknown ids", async () => {
    mockRepo.listAll.mockResolvedValue([markerA, markerB]);
    const unknownId = "019d4999-4219-72f6-b7bb-64004e1b1cff";
    const res = await app.request("/api/admin/v1/markers/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [ID_A, unknownId] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Unknown marker ids");
  });
});

describe("POST /markers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 and creates with sortOrder = max + 1", async () => {
    mockRepo.getBySlug.mockResolvedValue(undefined);
    mockRepo.getMaxSortOrder.mockResolvedValue(4);
    mockRepo.create.mockResolvedValue({ ...markerB, sortOrder: 5 });
    const res = await app.request("/api/admin/v1/markers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "champion", label: "Champion", description: "Winner" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.marker.slug).toBe("champion");
    expect(mockRepo.create).toHaveBeenCalledWith({
      slug: "champion",
      label: "Champion",
      description: "Winner",
      sortOrder: 5,
    });
  });

  it("returns 409 when the slug already exists", async () => {
    mockRepo.getBySlug.mockResolvedValue(markerA);
    const res = await app.request("/api/admin/v1/markers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "top-8", label: "Top 8" }),
    });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("already exists");
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /markers/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and updates", async () => {
    mockRepo.getById.mockResolvedValue(markerA);
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/markers/${ID_A}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Top Eight" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith(ID_A, {
      slug: undefined,
      label: "Top Eight",
      description: undefined,
    });
  });

  it("returns 404 when the marker does not exist", async () => {
    mockRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/markers/${ID_A}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });
    expect(res.status).toBe(404);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("returns 409 when changing to a slug already in use", async () => {
    mockRepo.getById.mockResolvedValue(markerA);
    mockRepo.getBySlug.mockResolvedValue(markerB);
    const res = await app.request(`/api/admin/v1/markers/${ID_A}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "champion" }),
    });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("already in use");
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /markers/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when not in use", async () => {
    mockRepo.getById.mockResolvedValue(markerA);
    mockRepo.isInUse.mockResolvedValue(false);
    mockRepo.deleteById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/markers/${ID_A}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteById).toHaveBeenCalledWith(ID_A);
  });

  it("returns 404 when the marker does not exist", async () => {
    mockRepo.getById.mockResolvedValue(undefined);
    const res = await app.request(`/api/admin/v1/markers/${ID_A}`, { method: "DELETE" });
    expect(res.status).toBe(404);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.isInUse).not.toHaveBeenCalled();
  });

  it("returns 409 when the marker is in use", async () => {
    mockRepo.getById.mockResolvedValue(markerA);
    mockRepo.isInUse.mockResolvedValue(true);
    const res = await app.request(`/api/admin/v1/markers/${ID_A}`, { method: "DELETE" });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("in use");
    expect(mockRepo.deleteById).not.toHaveBeenCalled();
  });
});
