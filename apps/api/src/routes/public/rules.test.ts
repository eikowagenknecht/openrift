import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { rulesRouter } from "./rules";

const mockRulesRepo = {
  listLatest: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  listAtVersion: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  listVersions: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  listChangesAtVersion: vi.fn(
    () =>
      Promise.resolve(undefined) as Promise<
        | {
            added: string[];
            modifiedPrev: Record<string, string>;
            removed: Record<string, unknown>[];
          }
        | undefined
        | null
      >,
  ),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    rules: mockRulesRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, rulesRouter);

const dbRule = {
  id: "r0000000-0001-4000-a000-000000000001",
  kind: "core",
  version: "1.2.0",
  ruleNumber: "3.4.1",
  sortOrder: 120,
  depth: 2,
  ruleType: "text",
  content: "A player loses the game if they would draw a card from an empty deck.",
  changeType: "added",
};

const dbVersion = {
  kind: "core",
  version: "1.2.0",
  comments: "First public release.",
  importedAt: new Date("2026-02-16T08:30:00Z"),
};

describe("GET /api/v1/rules", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRulesRepo.listLatest.mockResolvedValue([]);
    mockRulesRepo.listAtVersion.mockResolvedValue([]);
    mockRulesRepo.listVersions.mockResolvedValue([]);
    mockRulesRepo.listChangesAtVersion.mockResolvedValue(undefined);
  });

  it("returns the latest rules for a kind when no version is given", async () => {
    mockRulesRepo.listLatest.mockResolvedValue([dbRule]);
    mockRulesRepo.listVersions.mockResolvedValue([dbVersion]);

    const res = await app.request("/api/v1/rules?kind=core");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.kind).toBe("core");
    expect(json.version).toBe("1.2.0");
    expect(json.rules).toHaveLength(1);
    expect(json.rules[0]).toMatchObject({
      id: dbRule.id,
      ruleNumber: "3.4.1",
      ruleType: "text",
      changeType: "added",
    });
    expect(json.changes).toBeUndefined();
    expect(mockRulesRepo.listLatest).toHaveBeenCalledWith("core");
    expect(mockRulesRepo.listAtVersion).not.toHaveBeenCalled();
  });

  it("returns rules at a specific version with changes when version is given", async () => {
    mockRulesRepo.listAtVersion.mockResolvedValue([dbRule]);
    mockRulesRepo.listVersions.mockResolvedValue([dbVersion]);
    mockRulesRepo.listChangesAtVersion.mockResolvedValue({
      added: ["3.4.1"],
      modifiedPrev: { "3.4.2": "old text" },
      removed: [{ ...dbRule, id: "r0000000-0001-4000-a000-000000000002", changeType: "removed" }],
    });

    const res = await app.request("/api/v1/rules?kind=core&version=1.2.0");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.version).toBe("1.2.0");
    expect(json.changes).toBeDefined();
    expect(json.changes.added).toEqual(["3.4.1"]);
    expect(json.changes.modifiedPrev).toEqual({ "3.4.2": "old text" });
    expect(json.changes.removed).toHaveLength(1);
    expect(mockRulesRepo.listAtVersion).toHaveBeenCalledWith("core", "1.2.0");
    expect(mockRulesRepo.listLatest).not.toHaveBeenCalled();
  });

  it("falls back to an empty effective version when no versions exist", async () => {
    mockRulesRepo.listLatest.mockResolvedValue([]);
    mockRulesRepo.listVersions.mockResolvedValue([]);

    const res = await app.request("/api/v1/rules?kind=tournament");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.kind).toBe("tournament");
    expect(json.version).toBe("");
    expect(json.rules).toEqual([]);
  });

  it("rejects an invalid kind with a 400", async () => {
    const res = await app.request("/api/v1/rules?kind=nonsense");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/rules/versions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRulesRepo.listVersions.mockResolvedValue([]);
  });

  it("returns the list of versions for a kind", async () => {
    mockRulesRepo.listVersions.mockResolvedValue([dbVersion]);

    const res = await app.request("/api/v1/rules/versions?kind=core");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.versions).toHaveLength(1);
    expect(json.versions[0]).toEqual({
      kind: "core",
      version: "1.2.0",
      comments: "First public release.",
      importedAt: "2026-02-16T08:30:00.000Z",
    });
  });

  it("returns an empty list when there are no versions", async () => {
    mockRulesRepo.listVersions.mockResolvedValue([]);

    const res = await app.request("/api/v1/rules/versions?kind=tournament");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.versions).toEqual([]);
  });
});

describe("rules route registration", () => {
  it("registers both rules routes", async () => {
    const mountedApp = new Hono<{ Variables: Variables }>();
    mountedApp.use("*", async (c, next) => {
      c.set("repos", {
        rules: mockRulesRepo,
        // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
      } as any);
      await next();
    });
    registerRouterForTest(mountedApp, rulesRouter);

    mockRulesRepo.listLatest.mockResolvedValue([]);
    mockRulesRepo.listVersions.mockResolvedValue([]);

    const listRes = await mountedApp.request("/api/v1/rules?kind=core");
    expect(listRes.status).toBe(200);

    const versionsRes = await mountedApp.request("/api/v1/rules/versions?kind=core");
    expect(versionsRes.status).toBe(200);
  });
});
