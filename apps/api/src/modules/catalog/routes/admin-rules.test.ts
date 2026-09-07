import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminRulesRouter, parseRulesText } from "./admin-rules";

describe("parseRulesText", () => {
  it("recognises titles, subtitles, and plain text by markdown prefix", () => {
    const input = [
      "000. # Golden and Silver Rules",
      "001. ## Golden Rule",
      "002. Card text supersedes rules text.",
    ].join("\n");

    const rules = parseRulesText(input);

    expect(rules).toEqual([
      {
        ruleNumber: "000",
        ruleType: "title",
        content: "Golden and Silver Rules",
        depth: 0,
        sortOrder: 0,
      },
      { ruleNumber: "001", ruleType: "subtitle", content: "Golden Rule", depth: 0, sortOrder: 1 },
      {
        ruleNumber: "002",
        ruleType: "text",
        content: "Card text supersedes rules text.",
        depth: 0,
        sortOrder: 2,
      },
    ]);
  });

  it("derives depth from the dot-separated rule number, capped at 3", () => {
    const input = [
      "100. Top",
      "100.1. Second",
      "100.1.a. Third",
      "100.1.a.1. Fourth",
      "100.1.a.1.x. Fifth (clamped)",
    ].join("\n");

    const rules = parseRulesText(input);

    expect(rules.map((rule) => [rule.ruleNumber, rule.depth])).toEqual([
      ["100", 0],
      ["100.1", 1],
      ["100.1.a", 2],
      ["100.1.a.1", 3],
      ["100.1.a.1.x", 3],
    ]);
  });

  it("expands the literal two-character backslash-n sequence into real newlines", () => {
    const input = String.raw`103.2. *A Main Deck of at least 40 cards*\n  1 Chosen Champion Unit\n  Units`;

    const rules = parseRulesText(input);

    expect(rules).toHaveLength(1);
    expect(rules[0]!.content).toBe(
      "*A Main Deck of at least 40 cards*\n  1 Chosen Champion Unit\n  Units",
    );
  });

  it("skips blank lines, separator lines, and unparseable lines", () => {
    const input = [
      "",
      "=== version 1.0 ===",
      "not a rule line",
      "001. ## Golden Rule",
      "",
      "002. Card text supersedes rules text.",
    ].join("\n");

    const rules = parseRulesText(input);

    expect(rules.map((rule) => rule.ruleNumber)).toEqual(["001", "002"]);
  });

  it("preserves markdown markers (italics, etc.) in the stored content", () => {
    const input = '052. *Card*, when written in card effects, is shorthand for "Main Deck card."';

    const rules = parseRulesText(input);

    expect(rules[0]!.content).toBe(
      '*Card*, when written in card effects, is shorthand for "Main Deck card."',
    );
  });

  it("strips a leading pipe separator before detecting the markdown prefix", () => {
    const input = [
      "000. | # Golden and Silver Rules",
      "001. | ## Golden Rule",
      "002. | Card text supersedes rules text.",
    ].join("\n");

    const rules = parseRulesText(input);

    expect(rules.map((rule) => [rule.ruleType, rule.content])).toEqual([
      ["title", "Golden and Silver Rules"],
      ["subtitle", "Golden Rule"],
      ["text", "Card text supersedes rules text."],
    ]);
  });
});

const mockRulesRepo = {
  getVersion: vi.fn(),
  listVersions: vi.fn(),
  listLatest: vi.fn(),
  createVersion: vi.fn(),
  insertRules: vi.fn(),
  deleteVersion: vi.fn(),
  updateComments: vi.fn(),
};

const mockTransact = vi.fn(async (cb: (txRepos: { rules: typeof mockRulesRepo }) => unknown) =>
  cb({ rules: mockRulesRepo }),
);

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { rules: mockRulesRepo } as never);
  c.set("transact", mockTransact as never);
  c.set("user", { id: "a0000000-0001-4000-a000-000000000001" } as never);
  await next();
});
registerRouterForTest(app, adminRulesRouter);

describe("POST /api/admin/v1/rules/import", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ rules: mockRulesRepo }));
  });

  it("imports a first version with every rule counted as added (201)", async () => {
    mockRulesRepo.getVersion.mockResolvedValue(null);
    mockRulesRepo.listVersions.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/rules/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "core",
        version: "1.0",
        comments: "Initial import",
        content: ["001. # Title", "002. A rule."].join("\n"),
      }),
    });

    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json).toEqual({
      kind: "core",
      version: "1.0",
      rulesCount: 2,
      added: 2,
      modified: 0,
      removed: 0,
    });
    expect(mockTransact).toHaveBeenCalledOnce();
    expect(mockRulesRepo.createVersion).toHaveBeenCalledWith({
      kind: "core",
      version: "1.0",
      comments: "Initial import",
    });
    expect(mockRulesRepo.insertRules).toHaveBeenCalledOnce();
  });

  it("computes added/modified/removed against the previous version (001 changed, 002 added, 003 removed)", async () => {
    mockRulesRepo.getVersion.mockResolvedValue(null);
    mockRulesRepo.listVersions.mockResolvedValue([{ version: "1.0" }]);
    mockRulesRepo.listLatest.mockResolvedValue([
      { ruleNumber: "001", content: "Old text." },
      { ruleNumber: "003", content: "To be removed." },
    ]);

    const res = await app.request("/api/admin/v1/rules/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "core",
        version: "2.0",
        content: ["001. New text.", "002. Brand new."].join("\n"),
      }),
    });

    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json).toMatchObject({ added: 1, modified: 1, removed: 1 });
  });

  it("409s when the version already exists for the kind", async () => {
    mockRulesRepo.getVersion.mockResolvedValue({ kind: "core", version: "1.0" });

    const res = await app.request("/api/admin/v1/rules/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "core", version: "1.0", content: "001. A rule." }),
    });

    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.message).toContain("already exists");
    expect(mockRulesRepo.createVersion).not.toHaveBeenCalled();
  });

  it("400s when the content holds no parseable rules", async () => {
    mockRulesRepo.getVersion.mockResolvedValue(null);
    mockRulesRepo.listVersions.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/rules/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "core", version: "1.0", content: "not a rule line" }),
    });

    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("No valid rules");
  });

  it("400s when importing a version older than the latest", async () => {
    mockRulesRepo.getVersion.mockResolvedValue(null);
    mockRulesRepo.listVersions.mockResolvedValue([{ version: "2.0" }]);

    const res = await app.request("/api/admin/v1/rules/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "core", version: "1.0", content: "001. A rule." }),
    });

    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("older than");
  });
});

describe("DELETE /api/admin/v1/rules/:kind/versions/:version", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("deletes an existing version (204)", async () => {
    mockRulesRepo.getVersion.mockResolvedValue({ kind: "core", version: "1.0" });

    const res = await app.request("/api/admin/v1/rules/core/versions/1.0", { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(mockRulesRepo.deleteVersion).toHaveBeenCalledWith("core", "1.0");
  });

  it("404s when the version does not exist", async () => {
    mockRulesRepo.getVersion.mockResolvedValue(null);

    const res = await app.request("/api/admin/v1/rules/core/versions/9.9", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(mockRulesRepo.deleteVersion).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/v1/rules/:kind/versions/:version", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates the version comments", async () => {
    mockRulesRepo.updateComments.mockResolvedValue({
      kind: "core",
      version: "1.0",
      comments: "Updated note",
    });

    const res = await app.request("/api/admin/v1/rules/core/versions/1.0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments: "Updated note" }),
    });

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ kind: "core", version: "1.0", comments: "Updated note" });
    expect(mockRulesRepo.updateComments).toHaveBeenCalledWith("core", "1.0", "Updated note");
  });

  it("clears the comments when null is passed", async () => {
    mockRulesRepo.updateComments.mockResolvedValue({
      kind: "tournament",
      version: "1.0",
      comments: null,
    });

    const res = await app.request("/api/admin/v1/rules/tournament/versions/1.0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments: null }),
    });

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ kind: "tournament", version: "1.0", comments: null });
  });

  it("404s when the version does not exist", async () => {
    mockRulesRepo.updateComments.mockResolvedValue(null);

    const res = await app.request("/api/admin/v1/rules/core/versions/9.9", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments: "x" }),
    });

    expect(res.status).toBe(404);
  });
});
