import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildKeysetCursor } from "../../repositories/query-helpers.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminAuditEventsRouter } from "./audit-events";

const mockRepo = {
  list: vi.fn(),
  listActors: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate).
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { adminEvents: mockRepo } as never);
  await next();
});
registerRouterForTest(app, adminAuditEventsRouter);

function eventRow(id: string, createdAt: Date) {
  return {
    id,
    actorUserId: "actor-1",
    actorName: "Helper",
    actorEmail: "helper@test.com",
    action: "card.accept-field",
    entityType: "card",
    entityId: "card-1",
    entityLabel: "Fireball",
    cardSlug: "fireball",
    oldValues: { energy: 2 },
    newValues: { energy: 3 },
    createdAt,
  };
}

describe("GET /audit-events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns events with ISO createdAt and null nextCursor when no more pages", async () => {
    const createdAt = new Date("2026-07-08T10:00:00.000Z");
    mockRepo.list.mockResolvedValue([eventRow("00000000-0000-7000-a000-000000000001", createdAt)]);

    const res = await app.request("/api/admin/v1/audit-events");
    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].createdAt).toBe(createdAt.toISOString());
    expect(json.items[0].oldValues).toEqual({ energy: 2 });
    expect(json.nextCursor).toBeNull();
    expect(mockRepo.list).toHaveBeenCalledWith(
      { actorUserId: undefined, action: undefined, search: undefined },
      50,
      undefined,
    );
  });

  it("passes filters, limit, and cursor through to the repo", async () => {
    mockRepo.list.mockResolvedValue([]);
    const cursor = buildKeysetCursor(
      new Date("2026-07-08T09:00:00.000Z"),
      "00000000-0000-7000-a000-000000000009",
    );

    const res = await app.request(
      `/api/admin/v1/audit-events?actorUserId=actor-1&action=card.rename&search=fire&limit=10&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(res.status).toBe(200);
    expect(mockRepo.list).toHaveBeenCalledWith(
      { actorUserId: "actor-1", action: "card.rename", search: "fire" },
      10,
      cursor,
    );
  });

  it("computes nextCursor from the last row of a full page", async () => {
    const t1 = new Date("2026-07-08T10:00:00.000Z");
    const t2 = new Date("2026-07-08T09:00:00.000Z");
    const t3 = new Date("2026-07-08T08:00:00.000Z");
    mockRepo.list.mockResolvedValue([
      eventRow("00000000-0000-7000-a000-000000000001", t1),
      eventRow("00000000-0000-7000-a000-000000000002", t2),
      eventRow("00000000-0000-7000-a000-000000000003", t3),
    ]);

    const res = await app.request("/api/admin/v1/audit-events?limit=2");
    const json = await readJson(res);

    expect(json.items).toHaveLength(2);
    expect(json.nextCursor).toBe(buildKeysetCursor(t2, "00000000-0000-7000-a000-000000000002"));
  });
});

describe("GET /audit-events/actors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the distinct actors", async () => {
    mockRepo.listActors.mockResolvedValue([
      { userId: "actor-1", name: "Helper", email: "helper@test.com" },
      { userId: "actor-2", name: null, email: null },
    ]);

    const res = await app.request("/api/admin/v1/audit-events/actors");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.actors).toHaveLength(2);
    expect(json.actors[1]).toEqual({ userId: "actor-2", name: null, email: null });
  });
});
