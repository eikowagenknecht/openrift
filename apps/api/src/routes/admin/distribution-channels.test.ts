import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { adminDistributionChannelsRoute } from "./distribution-channels";

const mockRepo = {
  listAll: vi.fn(),
  usageCountsByChannel: vi.fn(),
  getById: vi.fn(),
  hasChildren: vi.fn(),
  countInUse: vi.fn(),
  deleteLinksForChannel: vi.fn(),
  deleteById: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { distributionChannels: mockRepo } as never);
    await next();
  })
  .route("/api/v1", adminDistributionChannelsRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

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

describe("GET /api/v1/distribution-channels", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns channels with printingCount merged from usage counts", async () => {
    const otherRow = { ...baseRow, id: "019d4999-4219-72f6-b7bb-64004e1b1c00", slug: "worlds" };
    mockRepo.listAll.mockResolvedValue([baseRow, otherRow]);
    mockRepo.usageCountsByChannel.mockResolvedValue([{ channelId: baseRow.id, count: 7 }]);

    const res = await app.request("/api/v1/distribution-channels");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.distributionChannels).toHaveLength(2);
    expect(json.distributionChannels[0].printingCount).toBe(7);
    expect(json.distributionChannels[1].printingCount).toBe(0);
  });
});

describe("DELETE /api/v1/distribution-channels/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when channel has no children and no printings", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.hasChildren.mockResolvedValue(undefined);
    mockRepo.countInUse.mockResolvedValue(0);
    mockRepo.deleteById.mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/distribution-channels/${baseRow.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteLinksForChannel).not.toHaveBeenCalled();
    expect(mockRepo.deleteById).toHaveBeenCalledWith(baseRow.id);
  });

  it("returns 409 when the channel has child channels", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.hasChildren.mockResolvedValue({ id: "child" });

    const res = await app.request(`/api/v1/distribution-channels/${baseRow.id}?force=true`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("child channels");
    expect(mockRepo.deleteById).not.toHaveBeenCalled();
    expect(mockRepo.deleteLinksForChannel).not.toHaveBeenCalled();
  });

  it("returns 409 when channel is in use without force flag", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.hasChildren.mockResolvedValue(undefined);
    mockRepo.countInUse.mockResolvedValue(3);

    const res = await app.request(`/api/v1/distribution-channels/${baseRow.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("3 printings");
    expect(mockRepo.deleteLinksForChannel).not.toHaveBeenCalled();
    expect(mockRepo.deleteById).not.toHaveBeenCalled();
  });

  it("unlinks printings then deletes when force=true", async () => {
    mockRepo.getById.mockResolvedValue(baseRow);
    mockRepo.hasChildren.mockResolvedValue(undefined);
    mockRepo.countInUse.mockResolvedValue(2);
    mockRepo.deleteLinksForChannel.mockResolvedValue(undefined);
    mockRepo.deleteById.mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/distribution-channels/${baseRow.id}?force=true`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteLinksForChannel).toHaveBeenCalledWith(baseRow.id);
    expect(mockRepo.deleteById).toHaveBeenCalledWith(baseRow.id);
  });

  it("returns 404 when the channel does not exist", async () => {
    mockRepo.getById.mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/distribution-channels/${baseRow.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(mockRepo.hasChildren).not.toHaveBeenCalled();
  });
});
