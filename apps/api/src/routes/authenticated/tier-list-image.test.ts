import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import type * as TierListImageModule from "../../services/tier-list-image.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { tierListImageRoute } from "./tier-list-image.js";

// Only the heavy renderer is mocked; the route's auth scoping and data flow run
// for real. `buildTierListImageRows` reads repos, so stub it too.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
vi.mock("../../services/tier-list-image.js", async (importOriginal) => ({
  ...(await importOriginal<typeof TierListImageModule>()),
  buildTierListImageRows: vi.fn(() => Promise.resolve([])),
  renderTierListImage: vi.fn(() => Promise.resolve(PNG_MAGIC)),
}));

const { renderTierListImage } = await import("../../services/tier-list-image.js");

const mockTierListsRepo = {
  getByIdForUser: vi.fn(),
};

/**
 * Mounts {@link tierListImageRoute} the way `app.ts` does, with a 418 sentinel
 * fall-through standing in for the oRPC catch-all, so we can tell "the image
 * route's auth gated this request" (401) apart from "fell through to a public
 * route" (418) — the public `/tier-lists/share/{token}` og:image must never be
 * gated.
 * @returns A configured Hono app for the test.
 */
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
      c.set("repos", { tierLists: mockTierListsRepo } as never);
      c.set("io", {} as never);
      c.set("config", { corsOrigin: "https://openrift.app" } as never);
      await next();
    })
    .route("/api/v1", tierListImageRoute)
    .all("/api/*", (c) => c.text("fell through to oRPC catch-all", 418));
}

function sharedList(overrides: Record<string, unknown> = {}) {
  return {
    id: "abc",
    title: "Origins — best commons",
    tiers: [{ label: "S", cardIds: [] }],
    isPublic: true,
    shareToken: "AbCdEfGhIjKl",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tierListImageRoute auth scoping", () => {
  it("does not gate the public share-token image path", async () => {
    const res = await buildApp(null).request("/api/v1/tier-lists/share/some-token/image.png");

    expect(res.status).toBe(418);
    expect(mockTierListsRepo.getByIdForUser).not.toHaveBeenCalled();
  });

  it("requires auth for the owner-only image download", async () => {
    const res = await buildApp(null).request("/api/v1/tier-lists/abc/image.png");

    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("404s when the caller does not own the list", async () => {
    mockTierListsRepo.getByIdForUser.mockResolvedValue(undefined);

    const res = await buildApp({ user: { id: "user-1" } }).request(
      "/api/v1/tier-lists/abc/image.png",
    );

    expect(res.status).toBe(404);
  });
});

describe("tierListImageRoute rendering", () => {
  it("serves the image to the authenticated owner", async () => {
    mockTierListsRepo.getByIdForUser.mockResolvedValue(sharedList());

    const res = await buildApp({ user: { id: "user-1", name: "Owner" } }).request(
      "/api/v1/tier-lists/abc/image.png",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mockTierListsRepo.getByIdForUser).toHaveBeenCalledWith("abc", "user-1");
  });

  it("encodes the share URL in the QR for a shared list", async () => {
    mockTierListsRepo.getByIdForUser.mockResolvedValue(sharedList());

    await buildApp({ user: { id: "user-1" } }).request("/api/v1/tier-lists/abc/image.png");

    expect(renderTierListImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        shareUrl: "https://openrift.app/tier-lists/share/AbCdEfGhIjKl",
      }),
      1,
    );
  });

  it("omits the QR for a list that is not shared", async () => {
    mockTierListsRepo.getByIdForUser.mockResolvedValue(
      sharedList({ isPublic: false, shareToken: null }),
    );

    await buildApp({ user: { id: "user-1" } }).request("/api/v1/tier-lists/abc/image.png");

    expect(renderTierListImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shareUrl: undefined }),
      1,
    );
  });

  it("renders at 2x for the hq download", async () => {
    mockTierListsRepo.getByIdForUser.mockResolvedValue(sharedList());

    await buildApp({ user: { id: "user-1" } }).request("/api/v1/tier-lists/abc/image.png?size=hq");

    expect(renderTierListImage).toHaveBeenCalledWith(expect.anything(), expect.anything(), 2);
  });
});
