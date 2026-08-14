import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Variables } from "../../types.js";
import { createPublicChatRoute } from "./chat";

const CARDS = [
  {
    id: "c1",
    slug: "viktor-herald-of-change",
    name: "Viktor, Herald of Change",
    superTypes: ["legend", "champion"],
    types: ["unit"],
    domains: ["fury"],
    energy: 3,
    might: 4,
    power: 2,
  },
  {
    id: "c2",
    slug: "mecha-jinx",
    name: "Mecha Jinx",
    superTypes: [],
    types: ["unit"],
    domains: ["chaos"],
    energy: 5,
    might: 6,
    power: null,
  },
];

const CODES = [
  { cardId: "c1", shortCode: "OGN-202", publicCode: "OGN-202/298" },
  { cardId: "c2", shortCode: "OGN-045", publicCode: "OGN-045/298" },
];

const ENUMS = {
  cardTypes: [{ slug: "unit", label: "Unit" }],
  superTypes: [
    { slug: "legend", label: "Legend" },
    { slug: "champion", label: "Champion" },
  ],
  domains: [
    { slug: "fury", label: "Fury" },
    { slug: "chaos", label: "Chaos" },
  ],
};

const mockCatalogRepo = {
  cards: vi.fn(),
  printingCodes: vi.fn(),
  catalogContentVersion: vi.fn(),
};
const mockEnumsRepo = {
  all: vi.fn(),
  contentVersion: vi.fn(),
};

const DEFAULT_CORS_ORIGIN = "https://openrift.app,https://preview.example";

/**
 * A fresh app per test: the route's index memo is scoped to one app instance.
 * `config` is passed whole rather than as an optional string so a test can
 * assert the unset-`CORS_ORIGIN` path (`{}`) instead of getting the default.
 *
 * @returns A Hono app with the chat route mounted.
 */
function makeApp(config: { corsOrigin?: string } = { corsOrigin: DEFAULT_CORS_ORIGIN }) {
  return new Hono<{ Variables: Variables }>()
    .use("*", async (c, next) => {
      c.set("repos", { catalog: mockCatalogRepo, enums: mockEnumsRepo } as never);
      c.set("config", config as never);
      await next();
    })
    .route("/api/v1", createPublicChatRoute());
}

async function lookup(
  query: string | undefined,
  app: ReturnType<typeof makeApp> = makeApp(),
): Promise<Response> {
  const path = query === undefined ? "/api/v1/chat/card" : `/api/v1/chat/card?q=${query}`;
  return await app.request(path);
}

/** @returns The response body of a lookup, which is all most cases assert on. */
async function lookupText(
  query: string | undefined,
  app: ReturnType<typeof makeApp> = makeApp(),
): Promise<string> {
  const res = await lookup(query, app);
  return await res.text();
}

beforeEach(() => {
  mockCatalogRepo.cards.mockReset().mockResolvedValue(CARDS);
  mockCatalogRepo.printingCodes.mockReset().mockResolvedValue(CODES);
  mockCatalogRepo.catalogContentVersion.mockReset().mockResolvedValue("catalog-v1");
  mockEnumsRepo.all.mockReset().mockResolvedValue(ENUMS);
  mockEnumsRepo.contentVersion.mockReset().mockResolvedValue("enums-v1");
});

describe("GET /api/v1/chat/card", () => {
  it("answers a name lookup with one line of plain text", async () => {
    const res = await lookup("viktor");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body).toBe(
      "Viktor, Herald of Change — Legend Champion Unit · Fury · Energy 3 · Might 4 · Power 2 — https://openrift.app/cards/viktor-herald-of-change",
    );
    expect(body).not.toContain("\n");
  });

  it("resolves a printing code with the dashes left out", async () => {
    expect(await lookupText("ogn045")).toContain("https://openrift.app/cards/mecha-jinx");
  });

  it("answers a miss with friendly text and a 200, not a 404", async () => {
    const res = await lookup("teemo");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      'No Riftbound card found for "teemo". Try https://openrift.app/cards?search=teemo',
    );
  });

  it("answers a missing query with usage text instead of a miss", async () => {
    const res = await lookup(undefined);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Look up a Riftbound card by name or code");
  });

  it("treats a whitespace-only query as a missing one", async () => {
    expect(await lookupText("%20%20")).toContain("Look up a Riftbound card");
  });

  it("links the deployment's own origin, taking the first CORS entry", async () => {
    const app = makeApp({ corsOrigin: "https://preview.openrift.app,https://openrift.app" });
    expect(await lookupText("viktor", app)).toContain("https://preview.openrift.app/cards/");
  });

  it("still answers the card when no origin is configured, just without a link", async () => {
    const body = await lookupText("viktor", makeApp({}));
    expect(body).toContain("Viktor, Herald of Change");
    expect(body).not.toContain("http");
  });

  it("caches a lookup answer so a popular chat command need not reach the origin", async () => {
    const res = await lookup("viktor");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("builds the index once and reuses it while the content version holds", async () => {
    const app = makeApp();
    await lookup("viktor", app);
    await lookup("jinx", app);

    expect(mockCatalogRepo.cards).toHaveBeenCalledTimes(1);
    expect(mockCatalogRepo.catalogContentVersion).toHaveBeenCalledTimes(2);
  });

  it("rebuilds the index when the catalog content version rolls", async () => {
    const app = makeApp();
    await lookup("viktor", app);
    mockCatalogRepo.catalogContentVersion.mockResolvedValue("catalog-v2");
    await lookup("viktor", app);

    expect(mockCatalogRepo.cards).toHaveBeenCalledTimes(2);
  });

  it("rebuilds the index when only an enum label changes", async () => {
    const app = makeApp();
    await lookup("viktor", app);
    mockEnumsRepo.contentVersion.mockResolvedValue("enums-v2");
    await lookup("viktor", app);

    expect(mockCatalogRepo.cards).toHaveBeenCalledTimes(2);
  });

  it("bounds an absurdly long query before it reaches the ranking", async () => {
    const res = await lookup("z".repeat(5000));

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("No Riftbound card found");
    expect(body.length).toBeLessThanOrEqual(400);
  });

  it("answers a catalog failure with friendly uncached text, not a JSON error", async () => {
    mockCatalogRepo.cards.mockRejectedValue(new Error("db down"));

    const res = await lookup("viktor");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("temporarily unavailable");
  });
});
