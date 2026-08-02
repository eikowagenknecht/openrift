import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import type * as ListImageModule from "../../services/list-image.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { listImageRoute } from "./list-image.js";

// Only the heavy renderer is mocked; the route's auth scoping and data flow run
// for real.
vi.mock("../../services/list-image.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ListImageModule>()),
  renderListImage: vi.fn(() =>
    Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ),
}));

const mockListsRepo = {
  getByIdForUser: vi.fn(),
  entriesWithDetailsAnon: vi.fn(() => Promise.resolve([])),
};

/**
 * Builds a Hono app mounting {@link listImageRoute} the same way `app.ts` does
 * (`.route("/api/v1", listImageRoute)`), with a fall-through that stands in for
 * the oRPC catch-all so we can tell "the image route's auth gated this request"
 * (401) apart from "the request fell through to the public handler" (418, a
 * sentinel no real route uses). `getSession` returns `session`, mirroring the
 * real auth resolution that `requireAuth` performs.
 * @returns A configured Hono app for the test.
 */
function buildApp(session: { user: { id: string; name?: string } } | null) {
  return (
    new Hono<{ Variables: Variables }>()
      .onError((err, c) => {
        if (err instanceof AppError) {
          return c.json({ error: err.message, code: err.code }, err.status as 401);
        }
        throw err;
      })
      .use("/api/*", async (c, next) => {
        c.set("auth", { api: { getSession: () => Promise.resolve(session) } } as never);
        c.set("repos", { lists: mockListsRepo, canonicalPrintings: {} } as never);
        c.set("io", {} as never);
        c.set("config", { corsOrigin: "https://openrift.app" } as never);
        await next();
      })
      .route("/api/v1", listImageRoute)
      // Stand-in for the oRPC catch-all: any path the image route does not own
      // reaches here. The public `GET /api/v1/lists/share/{token}` share view
      // lives in the oRPC router, so it must reach this fall-through, never 401.
      .all("/api/*", (c) => c.text("fell through to oRPC catch-all", 418))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listImageRoute auth scoping", () => {
  it("does not gate the public share-token path (regression: every shared list 401'd)", async () => {
    const res = await buildApp(null).request("/api/v1/lists/share/some-token");

    // Before the fix, `.use(requireAuth)` on the whole `/lists` sub-app threw
    // 401 here; the request must instead fall through to the oRPC catch-all.
    expect(res.status).toBe(418);
    expect(mockListsRepo.getByIdForUser).not.toHaveBeenCalled();
  });

  it("still requires auth for the owner-only image download", async () => {
    const res = await buildApp(null).request("/api/v1/lists/abc/image.png");

    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("serves the image to the authenticated owner", async () => {
    mockListsRepo.getByIdForUser.mockResolvedValue({
      id: "abc",
      name: "My wishlist",
      intent: "buy",
      kind: "card",
    });

    const res = await buildApp({ user: { id: "user-1", name: "Owner" } }).request(
      "/api/v1/lists/abc/image.png",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(mockListsRepo.getByIdForUser).toHaveBeenCalledWith("abc", "user-1");
  });
});
