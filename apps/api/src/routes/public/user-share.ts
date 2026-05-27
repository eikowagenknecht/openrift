import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { PublicListDetailResponse, PublicUserBundleResponse } from "@openrift/shared";
import {
  publicListDetailResponseSchema,
  publicUserBundleResponseSchema,
} from "@openrift/shared/response-schemas";
import { z } from "zod";

import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { loadSession } from "../../middleware/load-session.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { toListEntryDetail, toPublicList } from "../../utils/mappers.js";

const tokenParamSchema = z.object({
  token: z.string().min(1),
});

const tokenAndListParamSchema = z.object({
  token: z.string().min(1),
  listId: z.string().min(1),
});

const getUserBundle = createRoute({
  method: "get",
  path: "/users/share/{token}",
  tags: ["UserShare"],
  request: { params: tokenParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: publicUserBundleResponseSchema } },
      description: "Bundle index: owner profile + their wish/trade lists (ADR-018)",
    },
  },
});

const getUserBundleList = createRoute({
  method: "get",
  path: "/users/share/{token}/lists/{listId}",
  tags: ["UserShare"],
  request: { params: tokenAndListParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: publicListDetailResponseSchema } },
      description: "Detail of a single list inside the bundle",
    },
  },
});

const publicUserShareApp = new OpenAPIHono<{ Variables: Variables }>();
publicUserShareApp.use("/users/share/*", loadSession);

/**
 * Public endpoints for the user share bundle (ADR-018). The bundle token
 * resolves to the owner; per-list visibility additionally requires either a
 * per-list share token or a friend-group share with the viewer's groups. The
 * `loadSession` middleware is opt-in here so authenticated viewers can see
 * their group-shared lists; anonymous viewers see public-only.
 */
export const publicUserShareRoute = publicUserShareApp
  // ── GET /users/share/:token ─────────────────────────────────────────────
  .openapi(getUserBundle, async (c) => {
    const { userShares } = c.get("repos");
    const { token } = c.req.valid("param");
    const viewerUserId = c.get("user")?.id ?? null;

    const owner = await userShares.findOwnerByShareToken(token);
    assertFound(owner, "Not found");

    const lists = await userShares.listsForOwner(owner.userId, viewerUserId);

    const response: PublicUserBundleResponse = {
      owner: {
        displayName: owner.displayName ?? "Anonymous",
        gravatarHash: gravatarHashForEmail(owner.email),
      },
      lists: lists.map(({ list, entryCount }) => ({
        id: list.id,
        name: list.name,
        intent: list.intent,
        kind: list.kind,
        entryCount,
        createdAt: list.createdAt.toISOString(),
        updatedAt: list.updatedAt.toISOString(),
      })),
    };

    c.header(
      "Cache-Control",
      viewerUserId
        ? "private, max-age=60, stale-while-revalidate=300"
        : "public, max-age=60, stale-while-revalidate=300",
    );
    return c.json(response);
  })

  // ── GET /users/share/:token/lists/:listId ───────────────────────────────
  .openapi(getUserBundleList, async (c) => {
    const { userShares, lists } = c.get("repos");
    const { token, listId } = c.req.valid("param");
    const viewerUserId = c.get("user")?.id ?? null;

    const list = await userShares.findListInBundle(token, listId, viewerUserId);
    assertFound(list, "Not found");

    const owner = await userShares.findOwnerByShareToken(token);
    assertFound(owner, "Not found");

    const entries = await lists.entriesWithDetailsAnon(list.id, list.kind);

    const response: PublicListDetailResponse = {
      list: toPublicList(list),
      entries: entries.map((row) => toListEntryDetail(row)),
      owner: { displayName: owner.displayName ?? "Anonymous" },
    };

    c.header(
      "Cache-Control",
      viewerUserId
        ? "private, max-age=60, stale-while-revalidate=300"
        : "public, max-age=60, stale-while-revalidate=300",
    );
    return c.json(response);
  });
