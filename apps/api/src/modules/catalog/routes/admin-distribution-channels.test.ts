import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminDistributionChannelsRouter } from "./admin-distribution-channels";

const mockRepo = {
  listAll: vi.fn(),
  usageCountsByChannel: vi.fn(),
  getById: vi.fn(),
  getBySlug: vi.fn(),
  getMaxSortOrderForParent: vi.fn(),
  update: vi.fn(),
  hasChildren: vi.fn(),
  countInUse: vi.fn(),
  deleteLinksForChannel: vi.fn(),
  deleteById: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { distributionChannels: mockRepo } as never);
  await next();
});
registerRouterForTest(app, adminDistributionChannelsRouter);

const baseRow = {
  id: "019d4999-4219-72f6-b7bb-64004e1b1bff",
  slug: "nexus-night-2025",
  label: "Nexus Night 2025",
  description: null,
  kind: "event" as const,
  sortOrder: 0,
  parentId: null,
  childrenLabel: null,
  createdAt: new Date("2026-04-01T10:00:00.000Z"),
  updatedAt: new Date("2026-04-01T10:00:00.000Z"),
};

describe("GET /distribution-channels", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns channels with printingCount merged from usage counts", async () => {
    const otherRow = { ...baseRow, id: "019d4999-4219-72f6-b7bb-64004e1b1c00", slug: "worlds" };
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    mockRepo.usageCountsByChannel.mockResolvedValue([{ channelId: baseRow.id, count: 7 }]);

    const res = await app.request("/api/admin/v1/distribution-channels");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.distributionChannels).toHaveLength(2);
    expect(json.distributionChannels[0].printingCount).toBe(7);
    expect(json.distributionChannels[1].printingCount).toBe(0);
  });
});

const PARENT_ID = "019d4999-4219-72f6-b7bb-64004e1b1d00";

async function patchChannel(body: Record<string, unknown>): Promise<Response> {
  return await app.request(`/api/admin/v1/distribution-channels/${baseRow.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /distribution-channels/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("leaves the parent alone when the body omits parentId", async () => {
    mockRepo.getById.mockResolvedValue({ ...baseRow, parentId: PARENT_ID });
    mockRepo.update.mockResolvedValue(undefined);

    const res = await patchChannel({ label: "Nexus Night 2026" });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith(baseRow.id, { label: "Nexus Night 2026" });
    expect(mockRepo.getMaxSortOrderForParent).not.toHaveBeenCalled();
  });

  it("moves the channel to the root when parentId is explicitly null", async () => {
    mockRepo.getById.mockResolvedValue({ ...baseRow, parentId: PARENT_ID });
    mockRepo.getMaxSortOrderForParent.mockResolvedValue(4);
    mockRepo.update.mockResolvedValue(undefined);

    const res = await patchChannel({ parentId: null });
    expect(res.status).toBe(204);
    expect(mockRepo.getMaxSortOrderForParent).toHaveBeenCalledWith(null);
    expect(mockRepo.update).toHaveBeenCalledWith(baseRow.id, { parentId: null, sortOrder: 5 });
  });

  it("appends to the new sibling group when the parent changes", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.getMaxSortOrderForParent.mockResolvedValue(1);
    mockRepo.update.mockResolvedValue(undefined);

    const res = await patchChannel({ parentId: PARENT_ID });
    expect(res.status).toBe(204);
    expect(mockRepo.getMaxSortOrderForParent).toHaveBeenCalledWith(PARENT_ID);
    expect(mockRepo.update).toHaveBeenCalledWith(baseRow.id, {
      parentId: PARENT_ID,
      sortOrder: 2,
    });
  });

  it("writes nothing when the body carries no fields", async () => {
    mockRepo.getById.mockResolvedValue({ ...baseRow, parentId: PARENT_ID });

    const res = await patchChannel({});
    expect(res.status).toBe(204);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the hierarchy trigger rejects the move", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.getMaxSortOrderForParent.mockResolvedValue(0);
    mockRepo.update.mockRejectedValue(
      Object.assign(new Error("Cycle detected in distribution channel hierarchy"), {
        code: "P0001",
      }),
    );

    const res = await patchChannel({ parentId: PARENT_ID });
    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.message).toContain("Cycle detected");
  });

  it("returns 404 when the channel does not exist", async () => {
    mockRepo.getById.mockResolvedValue(undefined);

    const res = await patchChannel({ label: "Nexus Night 2026" });
    expect(res.status).toBe(404);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /distribution-channels/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when channel has no children and no printings", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.hasChildren.mockResolvedValue(undefined);
    mockRepo.countInUse.mockResolvedValue(0);
    mockRepo.deleteById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/distribution-channels/${baseRow.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteLinksForChannel).not.toHaveBeenCalled();
    expect(mockRepo.deleteById).toHaveBeenCalledWith(baseRow.id);
  });

  it("returns 409 when the channel has child channels", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.hasChildren.mockResolvedValue({ id: "child" });

    const res = await app.request(`/api/admin/v1/distribution-channels/${baseRow.id}?force=true`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.message).toContain("child channels");
    expect(mockRepo.deleteById).not.toHaveBeenCalled();
    expect(mockRepo.deleteLinksForChannel).not.toHaveBeenCalled();
  });

  it("returns 409 when channel is in use without force flag", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.hasChildren.mockResolvedValue(undefined);
    mockRepo.countInUse.mockResolvedValue(3);

    const res = await app.request(`/api/admin/v1/distribution-channels/${baseRow.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.message).toContain("3 printings");
    expect(mockRepo.deleteLinksForChannel).not.toHaveBeenCalled();
    expect(mockRepo.deleteById).not.toHaveBeenCalled();
  });

  it("unlinks printings then deletes when force=true", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.hasChildren.mockResolvedValue(undefined);
    mockRepo.countInUse.mockResolvedValue(2);
    mockRepo.deleteLinksForChannel.mockResolvedValue(undefined);
    mockRepo.deleteById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/distribution-channels/${baseRow.id}?force=true`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteLinksForChannel).toHaveBeenCalledWith(baseRow.id);
    expect(mockRepo.deleteById).toHaveBeenCalledWith(baseRow.id);
  });

  it("returns 404 when the channel does not exist", async () => {
    mockRepo.getById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/distribution-channels/${baseRow.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(mockRepo.hasChildren).not.toHaveBeenCalled();
  });
});
