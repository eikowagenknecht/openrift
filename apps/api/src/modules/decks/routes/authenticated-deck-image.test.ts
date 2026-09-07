import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { renderImage } from "../../system/services/render-pool.js";
import type * as DeckImageModule from "../services/deck-image.js";
import { deckImageRoute } from "./authenticated-deck-image.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
vi.mock("../services/deck-image.js", async (importOriginal) => ({
  ...(await importOriginal<typeof DeckImageModule>()),
  buildDeckImageCards: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../system/services/render-pool.js", () => ({
  renderImage: vi.fn(() => Promise.resolve(PNG_MAGIC)),
}));

const mockDecksRepo = {
  getByIdForUser: vi.fn(),
};

// 418 sentinel stands in for the oRPC catch-all, distinguishing a 401 from
// this route's auth from a fall-through to a public route.
function buildApp(session: { user: { id: string; name?: string } } | null) {
  return new Hono<{ Variables: Variables }>()
    .onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code }, err.status as 401);
      }
      throw err;
    })
    .use("/api/*", async (c, next) => {
      c.set("auth", { api: { getSession: () => Promise.resolve(session) } } as never);
      c.set("repos", { decks: mockDecksRepo } as never);
      c.set("io", {} as never);
      c.set("config", { corsOrigin: "https://openrift.app" } as never);
      await next();
    })
    .route("/api/v1", deckImageRoute)
    .all("/api/*", (c) => c.text("fell through to oRPC catch-all", 418));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deckImageRoute auth scoping", () => {
  it("does not gate the public deck share-token image path", async () => {
    const res = await buildApp(null).request("/api/v1/decks/share/some-token/image.png");

    expect(res.status).toBe(418);
    expect(mockDecksRepo.getByIdForUser).not.toHaveBeenCalled();
  });

  it("requires auth for the owner-only image download", async () => {
    const res = await buildApp(null).request("/api/v1/decks/abc/image.png");

    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("serves the image to the authenticated owner", async () => {
    mockDecksRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "Azir UNL",
      format: "constructed",
      isPublic: false,
      shareToken: null,
    });

    const res = await buildApp({ user: { id: "user-1", name: "Owner" } }).request(
      "/api/v1/decks/abc/image.png",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockDecksRepo.getByIdForUser).toHaveBeenCalledWith("abc", "user-1");
  });

  it("404s when the caller does not own the deck", async () => {
    mockDecksRepo.getByIdForUser.mockResolvedValue(undefined);

    const res = await buildApp({ user: { id: "user-1" } }).request("/api/v1/decks/abc/image.png");

    expect(res.status).toBe(404);
  });

  it("renders the landscape canvas at 1× by default", async () => {
    mockDecksRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "Deck",
      format: "constructed",
    });

    await buildApp({ user: { id: "user-1" } }).request("/api/v1/decks/abc/image.png");

    expect(renderImage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "deck",
        input: expect.anything(),
        scale: 1,
        aspect: "landscape",
      }),
    );
  });

  it("renders the vertical canvas when aspect=vertical", async () => {
    mockDecksRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "Deck",
      format: "constructed",
    });

    const res = await buildApp({ user: { id: "user-1" } }).request(
      "/api/v1/decks/abc/image.png?aspect=vertical",
    );

    expect(res.status).toBe(200);
    expect(renderImage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "deck",
        input: expect.anything(),
        scale: 1,
        aspect: "vertical",
      }),
    );
  });

  it("drops the share URL when qr=0, so a shared deck renders without a code", async () => {
    mockDecksRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "Deck",
      format: "constructed",
      isPublic: true,
      shareToken: "AbCdEfGhIjKl",
    });

    const res = await buildApp({ user: { id: "user-1" } }).request(
      "/api/v1/decks/abc/image.png?qr=0",
    );

    expect(res.status).toBe(200);
    expect(renderImage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "deck",
        input: expect.objectContaining({ shareUrl: undefined }),
        scale: 1,
        aspect: "landscape",
      }),
    );
  });

  it("keeps the share URL for a shared deck by default", async () => {
    mockDecksRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "Deck",
      format: "constructed",
      isPublic: true,
      shareToken: "AbCdEfGhIjKl",
    });

    await buildApp({ user: { id: "user-1" } }).request("/api/v1/decks/abc/image.png");

    expect(renderImage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "deck",
        input: expect.objectContaining({
          shareUrl: "https://openrift.app/decks/share/AbCdEfGhIjKl",
        }),
        scale: 1,
        aspect: "landscape",
      }),
    );
  });
});
