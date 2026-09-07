import { MAX_STAGE_PRESETS } from "@openrift/shared/contracts/stage-presets";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { stagePresetsRouter } from "./authenticated-stage-presets";

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const PRESET_ID = "80000000-0001-4000-a000-000000000001";
const TIMESTAMP = new Date("2026-08-14T10:30:00.000Z");

function stubPreset(overrides: Record<string, unknown> = {}) {
  return {
    id: PRESET_ID,
    userId: USER_ID,
    name: "Draft night",
    config: { ground: "green", scale: 65 },
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function uniqueViolation(constraint: string): Error {
  return Object.assign(new Error("duplicate key"), {
    code: "23505",
    constraint_name: constraint,
  });
}

const mockRepo = {
  listForUser: vi.fn(),
  findByIdForUser: vi.fn(),
  countForUser: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { stagePresets: mockRepo } as never);
  await next();
});
registerRouterForTest(app, stagePresetsRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

beforeEach(() => vi.resetAllMocks());

describe("GET /api/v1/stage-presets", () => {
  it("returns the user's presets without their owner", async () => {
    mockRepo.listForUser.mockResolvedValue([stubPreset()]);

    const res = await app.request("/api/v1/stage-presets");

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      items: [{ id: PRESET_ID, name: "Draft night", config: { ground: "green", scale: 65 } }],
    });
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID);
  });
});

describe("POST /api/v1/stage-presets", () => {
  async function post(body: unknown): Promise<Response> {
    return await app.request("/api/v1/stage-presets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("creates a preset under the caller", async () => {
    mockRepo.countForUser.mockResolvedValue(2);
    mockRepo.create.mockResolvedValue(stubPreset());

    const res = await post({ name: "  Draft night  ", config: { ground: "green", scale: 65 } });

    expect(res.status).toBe(201);
    expect(mockRepo.create).toHaveBeenCalledWith(USER_ID, {
      name: "Draft night",
      config: { ground: "green", scale: 65 },
    });
  });

  it("refuses a preset past the per-user cap", async () => {
    mockRepo.countForUser.mockResolvedValue(MAX_STAGE_PRESETS);

    const res = await post({ name: "One too many", config: {} });
    const body = await readJson<{ code: string }>(res);

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("turns a duplicate name into a conflict rather than a 500", async () => {
    mockRepo.countForUser.mockResolvedValue(1);
    mockRepo.create.mockRejectedValue(uniqueViolation("uq_stage_presets_user_name"));

    const res = await post({ name: "Draft night", config: {} });
    const body = await readJson<{ code: string }>(res);

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("rejects a blank name before it reaches the repo", async () => {
    mockRepo.countForUser.mockResolvedValue(0);

    const res = await post({ name: "   ", config: {} });

    expect(res.status).toBe(400);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/stage-presets/{id}", () => {
  async function patch(body: unknown): Promise<Response> {
    return await app.request(`/api/v1/stage-presets/${PRESET_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("renames without restating the config", async () => {
    mockRepo.update.mockResolvedValue(stubPreset({ name: "Finals" }));

    const res = await patch({ name: "Finals" });

    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(PRESET_ID, USER_ID, {
      name: "Finals",
      config: undefined,
    });
  });

  it("reads back the current state for an edit that names no field", async () => {
    mockRepo.findByIdForUser.mockResolvedValue(stubPreset());

    const res = await patch({});

    expect(res.status).toBe(200);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("answers 404 for a preset that is not the caller's", async () => {
    mockRepo.update.mockResolvedValue(undefined);

    const res = await patch({ name: "Someone else's" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/stage-presets/{id}", () => {
  it("deletes the caller's preset", async () => {
    mockRepo.remove.mockResolvedValue(true);

    const res = await app.request(`/api/v1/stage-presets/${PRESET_ID}`, { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(mockRepo.remove).toHaveBeenCalledWith(PRESET_ID, USER_ID);
  });

  it("answers 404 when nothing was deleted", async () => {
    mockRepo.remove.mockResolvedValue(false);

    const res = await app.request(`/api/v1/stage-presets/${PRESET_ID}`, { method: "DELETE" });

    expect(res.status).toBe(404);
  });
});
