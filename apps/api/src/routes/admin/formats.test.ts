import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminFormatsRouter } from "./formats";

const mockCardBans = {
  listFormats: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx/5xx responses carry `{ message }`.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { cardBans: mockCardBans } as never);
  await next();
});
registerRouterForTest(app, adminFormatsRouter);

describe("GET /formats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the formats from the card-bans repo", async () => {
    mockCardBans.listFormats.mockResolvedValue([
      { id: "019cfc3b-0369-7000-8000-000000000002", name: "Constructed" },
      { id: "019cfc3b-0369-7000-8000-000000000003", name: "Limited" },
    ]);

    const res = await app.request("/api/admin/v1/formats");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.formats).toHaveLength(2);
    expect(json.formats[0]).toEqual({
      id: "019cfc3b-0369-7000-8000-000000000002",
      name: "Constructed",
    });
    expect(mockCardBans.listFormats).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when there are no formats", async () => {
    mockCardBans.listFormats.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/formats");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ formats: [] });
  });
});
