import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { Hono } from "hono";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appErrorInterceptor } from "../../orpc/app-error-interceptor.js";
import { buildApiContext } from "../../orpc/context.js";
import type { Variables } from "../../types.js";
import { adminLanguagesRouter } from "./languages";

const mockRepo = {
  listAll: vi.fn(),
  getByCode: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteByCode: vi.fn(),
  isInUse: vi.fn(),
  reorder: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const handler = new OpenAPIHandler(adminLanguagesRouter, { interceptors: [appErrorInterceptor] });
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { languages: mockRepo } as never);
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
  "/api/admin/v1/languages",
  "/api/admin/v1/languages/reorder",
  "/api/admin/v1/languages/:code",
]) {
  app.all(path, handle);
}

const now = new Date("2026-03-17T00:00:00.000Z");

const enRow = {
  code: "en",
  name: "English",
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
};
const deRow = {
  code: "de",
  name: "German",
  sortOrder: 1,
  createdAt: now,
  updatedAt: now,
};

describe("GET /languages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with languages mapped to ISO timestamps", async () => {
    mockRepo.listAll.mockResolvedValue([enRow, deRow]);
    const res = await app.request("/api/admin/v1/languages");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.languages).toHaveLength(2);
    expect(json.languages[0]).toEqual({
      code: "en",
      name: "English",
      sortOrder: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("returns an empty array when there are no languages", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/languages");
    expect(res.status).toBe(200);
    const lintBody = await res.json();
    expect(lintBody.languages).toEqual([]);
  });
});

describe("PUT /languages/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and reorders", async () => {
    mockRepo.listAll.mockResolvedValue([enRow, deRow]);
    mockRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/languages/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: ["de", "en"] }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.reorder).toHaveBeenCalledWith(["de", "en"]);
  });

  it("returns 400 on duplicate codes", async () => {
    const res = await app.request("/api/admin/v1/languages/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: ["en", "en"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Duplicate language codes");
  });

  it("returns 400 when the count mismatches", async () => {
    mockRepo.listAll.mockResolvedValue([enRow, deRow]);
    const res = await app.request("/api/admin/v1/languages/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: ["en"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Expected 2 language codes");
  });

  it("returns 400 on unknown codes", async () => {
    mockRepo.listAll.mockResolvedValue([enRow, deRow]);
    const res = await app.request("/api/admin/v1/languages/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: ["en", "fr"] }),
    });
    expect(res.status).toBe(400);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("Unknown language codes: fr");
  });
});

describe("POST /languages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 and creates the language", async () => {
    mockRepo.getByCode.mockResolvedValue(undefined);
    mockRepo.create.mockResolvedValue({ ...deRow });
    const res = await app.request("/api/admin/v1/languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "de", name: "German", sortOrder: 1 }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.language).toEqual({
      code: "de",
      name: "German",
      sortOrder: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(mockRepo.create).toHaveBeenCalledWith({ code: "de", name: "German", sortOrder: 1 });
  });

  it("returns 409 when the code already exists", async () => {
    mockRepo.getByCode.mockResolvedValue(enRow);
    const res = await app.request("/api/admin/v1/languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "en", name: "English" }),
    });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("already exists");
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /languages/:code", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and updates", async () => {
    mockRepo.getByCode.mockResolvedValue(enRow);
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/languages/en", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Inglés", sortOrder: 5 }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith("en", { name: "Inglés", sortOrder: 5 });
  });

  it("returns 404 when the language does not exist", async () => {
    mockRepo.getByCode.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/languages/zz", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(res.status).toBe(404);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /languages/:code", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when not in use", async () => {
    mockRepo.getByCode.mockResolvedValue(enRow);
    mockRepo.isInUse.mockResolvedValue(false);
    mockRepo.deleteByCode.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/languages/en", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteByCode).toHaveBeenCalledWith("en");
  });

  it("returns 404 when the language does not exist", async () => {
    mockRepo.getByCode.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/languages/zz", { method: "DELETE" });
    expect(res.status).toBe(404);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("not found");
    expect(mockRepo.isInUse).not.toHaveBeenCalled();
  });

  it("returns 409 when the language is in use", async () => {
    mockRepo.getByCode.mockResolvedValue(enRow);
    mockRepo.isInUse.mockResolvedValue(true);
    const res = await app.request("/api/admin/v1/languages/en", { method: "DELETE" });
    expect(res.status).toBe(409);
    const lintBody = await res.json();
    expect(lintBody.message).toContain("in use");
    expect(mockRepo.deleteByCode).not.toHaveBeenCalled();
  });
});
