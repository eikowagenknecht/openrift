import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runJobAsync } from "../../services/run-job.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminPrintingEventsRouter } from "./printing-events";

// vitest hoists these vi.mock calls above the imports at transform time, so the
// mocked modules are replaced before ./printing-events pulls them in.
vi.mock("../../services/run-job.js", () => ({
  runJobAsync: vi.fn(),
}));
vi.mock("../../services/flush-printing-events.js", () => ({
  flushPendingPrintingEvents: vi.fn(),
}));

const mockRunJobAsync = vi.mocked(runJobAsync);

const mockRepo = {
  listByStatus: vi.fn(),
  retryFailed: vi.fn(),
};

const config = {
  discordWebhooks: {
    newPrintings: "https://discord.example/new",
    printingChanges: "https://discord.example/changes",
  },
  appBaseUrl: "https://openrift.example",
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { printingEvents: mockRepo } as never);
  c.set("config", config as never);
  await next();
});
registerRouterForTest(app, adminPrintingEventsRouter);

const now = new Date("2026-03-17T00:00:00.000Z");
const RUN_ID = "019d4999-4219-72f6-b7bb-64004e1b1bff";

const eventRow = {
  id: "019d4999-4219-72f6-b7bb-64004e1b1c01",
  eventType: "new" as const,
  status: "pending" as const,
  retryCount: 0,
  printingId: "019d4999-4219-72f6-b7bb-64004e1b1c02",
  cardName: "Annie",
  cardSlug: "annie",
  setName: "Origins",
  shortCode: "OGN",
  rarity: "rare",
  finish: "foil",
  finishLabel: "Foil",
  artist: "Artist Name",
  language: "en",
  languageName: "English",
  frontImageId: "019d4999-4219-72f6-b7bb-64004e1b1c03",
  changes: null,
  createdAt: now,
};

describe("POST /printing-events/flush", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 202 with the run handle", async () => {
    mockRunJobAsync.mockResolvedValue({ runId: RUN_ID, status: "running" } as never);
    const res = await app.request("/api/admin/v1/printing-events/flush", { method: "POST" });
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toEqual({ runId: RUN_ID, status: "running" });
    expect(mockRunJobAsync).toHaveBeenCalledTimes(1);
  });
});

describe("GET /printing-events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the pending/failed queue", async () => {
    mockRepo.listByStatus.mockResolvedValue([eventRow]);
    const res = await app.request("/api/admin/v1/printing-events");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toHaveLength(1);
    expect(json.events[0].id).toBe(eventRow.id);
    expect(json.events[0].createdAt).toBe(now.toISOString());
    expect(json.events[0].changes).toBeNull();
    expect(mockRepo.listByStatus).toHaveBeenCalledWith(["pending", "failed"]);
  });

  it("returns an empty array when the queue is empty", async () => {
    mockRepo.listByStatus.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/printing-events");
    expect(res.status).toBe(200);
    const lintBody = await res.json();
    expect(lintBody.events).toEqual([]);
  });
});

describe("POST /printing-events/retry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 and resets the given ids", async () => {
    mockRepo.retryFailed.mockResolvedValue(undefined);
    const ids = ["019d4999-4219-72f6-b7bb-64004e1b1c10", "019d4999-4219-72f6-b7bb-64004e1b1c11"];
    const res = await app.request("/api/admin/v1/printing-events/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    expect(res.status).toBe(200);
    const lintBody = await res.json();
    expect(lintBody.retried).toBe(2);
    expect(mockRepo.retryFailed).toHaveBeenCalledWith(ids);
  });
});
