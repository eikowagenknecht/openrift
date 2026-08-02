import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicOembedRoute } from "./oembed";

const mockDecksRepo = {
  findByShareToken: vi.fn(),
};
const mockCollectionsRepo = {
  findByShareToken: vi.fn(),
};
const mockListsRepo = {
  findByShareToken: vi.fn(),
};
const mockUserSharesRepo = {
  findOwnerByShareToken: vi.fn(),
  listsForOwner: vi.fn(),
};

const app = new Hono<{ Variables: Variables }>()
  .use("*", async (c, next) => {
    c.set("repos", {
      decks: mockDecksRepo,
      collections: mockCollectionsRepo,
      lists: mockListsRepo,
      userShares: mockUserSharesRepo,
    } as never);
    c.set("config", { corsOrigin: "https://openrift.app,https://preview.openrift.app" } as never);
    await next();
  })
  .route("/api/v1", publicOembedRoute);

const NOW = new Date("2026-04-20T00:00:00Z");
const NOW_MS = NOW.getTime();

async function request(query: Record<string, string>): Promise<Response> {
  const params = new URLSearchParams(query).toString();
  return await app.request(`/api/v1/oembed?${params}`);
}

beforeEach(() => {
  mockDecksRepo.findByShareToken.mockReset();
  mockCollectionsRepo.findByShareToken.mockReset();
  mockListsRepo.findByShareToken.mockReset();
  mockUserSharesRepo.findOwnerByShareToken.mockReset();
  mockUserSharesRepo.listsForOwner.mockReset();
});

describe("GET /api/v1/oembed", () => {
  it("resolves a deck share URL to a photo response with the versioned image", async () => {
    mockDecksRepo.findByShareToken.mockResolvedValue({
      deck: { name: "Best of Diana", format: "constructed", updatedAt: NOW },
      ownerName: "drawphasetcg",
      ownerEmail: "owner@example.test",
    });

    const res = await request({ url: "https://openrift.app/decks/share/tok-deck" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/u);
    const body = await readJson(res);
    expect(body).toMatchObject({
      version: "1.0",
      type: "photo",
      title: "Best of Diana (Constructed deck)",
      author_name: "drawphasetcg",
      provider_name: "OpenRift",
      provider_url: "https://openrift.app",
      url: `https://openrift.app/api/v1/decks/share/tok-deck/image.png?v=${NOW_MS}`,
      width: 1200,
      height: 630,
    });
    expect(mockDecksRepo.findByShareToken).toHaveBeenCalledWith("tok-deck");
  });

  it("folds copyCount into the collection image version", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: { name: "My Binder", updatedAt: NOW, copyCount: 7 },
      ownerName: "Bob",
      ownerEmail: "bob@example.test",
    });

    const res = await request({ url: "https://openrift.app/collections/share/tok-col" });

    const body = await readJson(res);
    expect(body.type).toBe("photo");
    expect(body.title).toBe("My Binder (collection)");
    expect(body.url).toBe(
      `https://openrift.app/api/v1/collections/share/tok-col/image.png?v=${NOW_MS}-7`,
    );
  });

  it("resolves a list share URL with the list intent in the title", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue({
      list: { name: "Holiday Targets", intent: "trade", updatedAt: NOW },
      ownerName: "Alice",
      ownerEmail: "alice@example.test",
    });

    const res = await request({ url: "https://openrift.app/lists/share/tok-list" });

    const body = await readJson(res);
    expect(body.title).toBe("Holiday Targets (trade list)");
    expect(body.url).toBe(`https://openrift.app/api/v1/lists/share/tok-list/image.png?v=${NOW_MS}`);
  });

  it("resolves a user bundle URL, folding the list count into the version", async () => {
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue({
      userId: "u1",
      displayName: "Alice",
    });
    mockUserSharesRepo.listsForOwner.mockResolvedValue([
      { list: { updatedAt: NOW }, entryCount: 2 },
      { list: { updatedAt: new Date("2026-04-19T00:00:00Z") }, entryCount: 1 },
    ]);

    const res = await request({ url: "https://openrift.app/users/share/tok-bundle" });

    const body = await readJson(res);
    expect(body.title).toBe("Alice's wish & tradelists");
    // Latest of the two list updates, folded with the list count (2).
    expect(body.url).toBe(
      `https://openrift.app/api/v1/users/share/tok-bundle/image.png?v=${NOW_MS}-2`,
    );
    expect(mockUserSharesRepo.listsForOwner).toHaveBeenCalledWith("u1", null);
  });

  it("scales the reported dimensions down to honor maxwidth", async () => {
    mockDecksRepo.findByShareToken.mockResolvedValue({
      deck: { name: "Deck", format: "standard", updatedAt: NOW },
      ownerName: null,
      ownerEmail: "x@example.test",
    });

    const res = await request({
      url: "https://openrift.app/decks/share/tok-deck",
      maxwidth: "600",
    });

    const body = await readJson(res);
    expect(body.width).toBe(600);
    expect(body.height).toBe(315);
    // No owner name → author_name omitted.
    expect(body.author_name).toBeUndefined();
  });

  it("returns 404 for an unknown token without leaking which resource", async () => {
    mockDecksRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await request({ url: "https://openrift.app/decks/share/nope" });

    expect(res.status).toBe(404);
  });

  it("returns 404 for a URL whose origin is not in the allow-list", async () => {
    const res = await request({ url: "https://evil.example.com/decks/share/tok" });

    expect(res.status).toBe(404);
    expect(mockDecksRepo.findByShareToken).not.toHaveBeenCalled();
  });

  it("returns 404 for a same-origin path that is not a share surface", async () => {
    const res = await request({ url: "https://openrift.app/cards/lux" });

    expect(res.status).toBe(404);
    expect(mockDecksRepo.findByShareToken).not.toHaveBeenCalled();
  });

  it("returns 404 for a share sub-page with extra path segments", async () => {
    const res = await request({
      url: "https://openrift.app/users/share/tok/lists/list-1",
    });

    expect(res.status).toBe(404);
    expect(mockUserSharesRepo.findOwnerByShareToken).not.toHaveBeenCalled();
  });

  it("returns 400 when the url parameter is missing", async () => {
    const res = await app.request("/api/v1/oembed");

    expect(res.status).toBe(400);
  });

  it("returns 501 for a non-json format", async () => {
    const res = await request({
      url: "https://openrift.app/decks/share/tok-deck",
      format: "xml",
    });

    expect(res.status).toBe(501);
    expect(mockDecksRepo.findByShareToken).not.toHaveBeenCalled();
  });
});
