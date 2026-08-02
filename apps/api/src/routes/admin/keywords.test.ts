import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";

// The discoverTranslations handler calls the discovery service; mock it so no
// real translation discovery runs.
vi.mock("../../services/keyword-translation-discovery.js", () => ({
  discoverKeywordTranslations: vi.fn(),
}));

// eslint-disable-next-line import/first -- imported after vi.mock so the mock applies.
import { discoverKeywordTranslations } from "../../services/keyword-translation-discovery.js";
// eslint-disable-next-line import/first
import { adminKeywordsRouter } from "./keywords";

const discoverMock = vi.mocked(discoverKeywordTranslations);

const mockKeywords = {
  getKeywordCounts: vi.fn(),
  listAll: vi.fn(),
  listAllTranslations: vi.fn(),
  createStyle: vi.fn(),
  upsertStyle: vi.fn(),
  deleteStyle: vi.fn(),
  upsertTranslation: vi.fn(),
  deleteTranslation: vi.fn(),
  recomputeAll: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx/5xx responses carry
// `{ message }`.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    keywords: mockKeywords,
  } as never);
  await next();
});
registerRouterForTest(app, adminKeywordsRouter);

describe("GET /keyword-stats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns counts, styles, and translations", async () => {
    mockKeywords.getKeywordCounts.mockResolvedValue([{ keyword: "Accelerate", count: 4 }]);
    mockKeywords.listAll.mockResolvedValue([
      { name: "Accelerate", color: "#24705f", darkText: false, costKeyword: false },
    ]);
    mockKeywords.listAllTranslations.mockResolvedValue([
      { keywordName: "Accelerate", language: "de", label: "Beschleunigen" },
    ]);

    const res = await app.request("/api/admin/v1/keyword-stats");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.counts).toEqual([{ keyword: "Accelerate", count: 4 }]);
    expect(json.styles).toEqual([
      { name: "Accelerate", color: "#24705f", darkText: false, costKeyword: false },
    ]);
    expect(json.translations).toEqual([
      { keywordName: "Accelerate", language: "de", label: "Beschleunigen" },
    ]);
  });
});

describe("POST /keywords (createStyle)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and calls createStyle with the input", async () => {
    mockKeywords.createStyle.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/keywords", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Accelerate",
        color: "#24705f",
        darkText: false,
        costKeyword: false,
      }),
    });
    expect(res.status).toBe(204);
    expect(mockKeywords.createStyle).toHaveBeenCalledWith({
      name: "Accelerate",
      color: "#24705f",
      darkText: false,
      costKeyword: false,
    });
  });
});

describe("PUT /keywords/:name (updateStyle)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and upserts the style", async () => {
    mockKeywords.upsertStyle.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/keywords/Accelerate", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color: "#112233", darkText: true, costKeyword: true }),
    });
    expect(res.status).toBe(204);
    expect(mockKeywords.upsertStyle).toHaveBeenCalledWith({
      name: "Accelerate",
      color: "#112233",
      darkText: true,
      costKeyword: true,
    });
  });
});

describe("DELETE /keywords/:name (removeStyle)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and deletes the style by name", async () => {
    mockKeywords.deleteStyle.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/keywords/Accelerate", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockKeywords.deleteStyle).toHaveBeenCalledWith("Accelerate");
  });
});

describe("POST /recompute-keywords", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the recompute result", async () => {
    mockKeywords.recomputeAll.mockResolvedValue({ totalCards: 100, updated: 7 });

    const res = await app.request("/api/admin/v1/recompute-keywords", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ totalCards: 100, updated: 7 });
    expect(mockKeywords.recomputeAll).toHaveBeenCalledTimes(1);
  });
});

describe("POST /discover-keyword-translations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the discovery result from the service", async () => {
    discoverMock.mockResolvedValue({
      candidatesExamined: 3,
      discovered: [{ keyword: "Accelerate", language: "de", label: "Beschleunigen" }],
      inserted: 1,
      conflicts: [],
    } as never);

    const res = await app.request("/api/admin/v1/discover-keyword-translations", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.candidatesExamined).toBe(3);
    expect(json.inserted).toBe(1);
    expect(discoverMock).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /keyword-translations/:keywordName/:language (upsertTranslation)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and upserts the translation", async () => {
    mockKeywords.upsertTranslation.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/keyword-translations/Accelerate/de", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Beschleunigen" }),
    });
    expect(res.status).toBe(204);
    expect(mockKeywords.upsertTranslation).toHaveBeenCalledWith({
      keywordName: "Accelerate",
      language: "de",
      label: "Beschleunigen",
    });
  });
});

describe("DELETE /keyword-translations/:keywordName/:language (removeTranslation)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and deletes the translation", async () => {
    mockKeywords.deleteTranslation.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/keyword-translations/Accelerate/de", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockKeywords.deleteTranslation).toHaveBeenCalledWith("Accelerate", "de");
  });
});
