import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { contactMethodsRouter } from "./contact-methods";

const mockContactMethodsRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  create: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  delete: vi.fn(() => Promise.resolve(false)),
  reorder: vi.fn(() => Promise.resolve()),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { userContactMethods: mockContactMethodsRepo } as never);
  await next();
});
registerRouterForTest(app, contactMethodsRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

const METHOD_ID = "a0000000-0001-4000-a000-000000000020";
const OTHER_ID = "a0000000-0001-4000-a000-000000000021";

const discordMethod = { id: METHOD_ID, type: "discord", value: "alice#1234" };
const emailMethod = { id: OTHER_ID, type: "email", value: "alice@example.com" };

beforeEach(() => vi.resetAllMocks());

describe("GET /api/v1/contact-methods", () => {
  it("returns 200 with the user's contact methods", async () => {
    mockContactMethodsRepo.listForUser.mockResolvedValue([discordMethod, emailMethod]);
    const res = await app.request("/api/v1/contact-methods");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items).toHaveLength(2);
    expect(json.items[0].type).toBe("discord");
    expect(mockContactMethodsRepo.listForUser).toHaveBeenCalledWith(USER_ID);
  });
});

describe("POST /api/v1/contact-methods", () => {
  it("returns 200 with the refreshed list after creating", async () => {
    mockContactMethodsRepo.listForUser.mockResolvedValue([discordMethod]);
    const res = await app.request("/api/v1/contact-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "discord", value: "alice#1234" }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items).toHaveLength(1);
    expect(mockContactMethodsRepo.create).toHaveBeenCalledWith(USER_ID, "discord", "alice#1234");
  });

  it("returns 400 when the value is empty", async () => {
    const res = await app.request("/api/v1/contact-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "discord", value: "" }),
    });
    expect(res.status).toBe(400);
    expect(mockContactMethodsRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/contact-methods/:id", () => {
  it("returns 200 with the refreshed list after updating", async () => {
    mockContactMethodsRepo.update.mockResolvedValue(discordMethod);
    mockContactMethodsRepo.listForUser.mockResolvedValue([
      { ...discordMethod, value: "alice#9999" },
    ]);
    const res = await app.request(`/api/v1/contact-methods/${METHOD_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "discord", value: "alice#9999" }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items[0].value).toBe("alice#9999");
    expect(mockContactMethodsRepo.update).toHaveBeenCalledWith(
      METHOD_ID,
      USER_ID,
      "discord",
      "alice#9999",
    );
  });

  it("returns 404 when the method does not exist", async () => {
    mockContactMethodsRepo.update.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/contact-methods/${METHOD_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "discord", value: "alice#9999" }),
    });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toBe("Contact method not found");
  });
});

describe("DELETE /api/v1/contact-methods/:id", () => {
  it("returns 200 with the refreshed list after deleting", async () => {
    mockContactMethodsRepo.delete.mockResolvedValue(true);
    mockContactMethodsRepo.listForUser.mockResolvedValue([]);
    const res = await app.request(`/api/v1/contact-methods/${METHOD_ID}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items).toEqual([]);
    expect(mockContactMethodsRepo.delete).toHaveBeenCalledWith(METHOD_ID, USER_ID);
  });

  it("returns 404 when the method does not exist", async () => {
    mockContactMethodsRepo.delete.mockResolvedValue(false);
    const res = await app.request(`/api/v1/contact-methods/${METHOD_ID}`, { method: "DELETE" });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toBe("Contact method not found");
  });
});

describe("POST /api/v1/contact-methods/reorder", () => {
  it("returns 200 with the refreshed list after reordering", async () => {
    mockContactMethodsRepo.listForUser.mockResolvedValue([emailMethod, discordMethod]);
    const ids = [OTHER_ID, METHOD_ID];
    const res = await app.request("/api/v1/contact-methods/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items[0].id).toBe(OTHER_ID);
    expect(mockContactMethodsRepo.reorder).toHaveBeenCalledWith(USER_ID, ids);
  });
});
