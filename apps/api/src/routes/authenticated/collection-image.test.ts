import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { buildCollectionShareInput } from "../../services/collection-image.js";
import { renderImage } from "../../services/render-pool.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { collectionImageRoute } from "./collection-image.js";

// Only the heavy renderer is mocked; the route's auth scoping, ownership check
// and param parsing run for real.
vi.mock("../../services/collection-image.js", () => ({
  buildCollectionShareInput: vi.fn(() => Promise.resolve({ cards: [], totalCount: 0 })),
}));
vi.mock("../../services/render-pool.js", () => ({
  renderImage: vi.fn(() =>
    Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ),
}));

const mockCollectionsRepo = {
  getByIdForUser: vi.fn(),
};

// 418 is a sentinel no real route uses, so a fall-through distinguishes "the
// image route's auth gated this" (401) from "fell through to the oRPC catch-all".
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
      c.set("repos", { collections: mockCollectionsRepo, copies: {} } as never);
      c.set("io", {} as never);
      c.set("config", { corsOrigin: "https://openrift.app" } as never);
      await next();
    })
    .route("/api/v1", collectionImageRoute)
    .all("/api/*", (c) => c.text("fell through to oRPC catch-all", 418));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectionImageRoute", () => {
  it("does not gate the public share-token path", async () => {
    const res = await buildApp(null).request("/api/v1/collections/share/some-token");

    expect(res.status).toBe(418);
    expect(mockCollectionsRepo.getByIdForUser).not.toHaveBeenCalled();
  });

  it("requires auth for the owner-only image download", async () => {
    const res = await buildApp(null).request("/api/v1/collections/abc/image.png");

    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("404s a collection the caller does not own", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(undefined);

    const res = await buildApp({ user: { id: "user-1" } }).request(
      "/api/v1/collections/abc/image.png",
    );

    expect(res.status).toBe(404);
    expect(vi.mocked(renderImage)).not.toHaveBeenCalled();
  });

  it("serves the image to the authenticated owner, with no QR for a private collection", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "My Binder",
      isPublic: false,
      shareToken: null,
    });

    const res = await buildApp({ user: { id: "user-1", name: "Owner" } }).request(
      "/api/v1/collections/abc/image.png",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockCollectionsRepo.getByIdForUser).toHaveBeenCalledWith("abc", "user-1");
    const data = vi.mocked(buildCollectionShareInput).mock.calls[0]?.[0];
    const job = vi.mocked(renderImage).mock.calls[0]?.[0];
    const scale = job?.scale;
    const options = job?.kind === "share" ? job.options : undefined;
    expect(data).toMatchObject({
      collectionId: "abc",
      collectionName: "My Binder",
      ownerName: "Owner",
      siteHost: "openrift.app",
    });
    // Private collection: `findByShareToken` requires is_public, so there is no
    // viewable link to encode.
    expect(data?.shareUrl).toBeUndefined();
    expect(scale).toBe(1);
    expect(options).toEqual({ aspect: "landscape", qr: true });
  });

  it("encodes the share link when the collection is public", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "My Binder",
      isPublic: true,
      shareToken: "tok-col",
    });

    await buildApp({ user: { id: "user-1", name: "Owner" } }).request(
      "/api/v1/collections/abc/image.png",
    );

    const data = vi.mocked(buildCollectionShareInput).mock.calls[0]?.[0];
    expect(data?.shareUrl).toBe("https://openrift.app/collections/share/tok-col");
  });

  it("passes the scale, aspect and qr params through", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "My Binder",
      isPublic: true,
      shareToken: "tok-col",
    });

    await buildApp({ user: { id: "user-1", name: "Owner" } }).request(
      "/api/v1/collections/abc/image.png?size=hq&aspect=vertical&qr=0",
    );

    const job = vi.mocked(renderImage).mock.calls[0]?.[0];
    const scale = job?.scale;
    const options = job?.kind === "share" ? job.options : undefined;
    expect(scale).toBe(2);
    expect(options).toEqual({ aspect: "vertical", qr: false });
  });

  it("honors an explicit 3x scale on the owner-only download", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "My Binder",
      isPublic: false,
      shareToken: null,
    });

    await buildApp({ user: { id: "user-1", name: "Owner" } }).request(
      "/api/v1/collections/abc/image.png?scale=3",
    );

    const scale = vi.mocked(renderImage).mock.calls[0]?.[0].scale;
    expect(scale).toBe(3);
  });
});
