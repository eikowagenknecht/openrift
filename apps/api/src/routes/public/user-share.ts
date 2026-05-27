import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { PublicListDetailResponse, PublicUserBundleResponse } from "@openrift/shared";
import {
  publicListDetailResponseSchema,
  publicUserBundleResponseSchema,
} from "@openrift/shared/response-schemas";
import { z } from "zod";

import { gravatarHashForEmail } from "../../lib/gravatar.js";
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

/**
 * Public endpoints for the user share bundle (ADR-018). The bundle is the
 * authorization scope: any of the owner's wish/trade lists are readable via
 * the bundle token, without needing per-list share tokens.
 */
export const publicUserShareRoute = new OpenAPIHono<{ Variables: Variables }>()
  // ── GET /users/share/:token ─────────────────────────────────────────────
  .openapi(getUserBundle, async (c) => {
    const { userShares } = c.get("repos");
    const { token } = c.req.valid("param");

    const owner = await userShares.findOwnerByShareToken(token);
    assertFound(owner, "Not found");

    const lists = await userShares.listsForOwner(owner.userId);

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

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(response);
  })

  // ── GET /users/share/:token/lists/:listId ───────────────────────────────
  .openapi(getUserBundleList, async (c) => {
    const { userShares, lists } = c.get("repos");
    const { token, listId } = c.req.valid("param");

    const list = await userShares.findListInBundle(token, listId);
    assertFound(list, "Not found");

    const owner = await userShares.findOwnerByShareToken(token);
    assertFound(owner, "Not found");

    const entries = await lists.entriesWithDetailsAnon(list.id, list.kind);

    const response: PublicListDetailResponse = {
      list: toPublicList(list),
      entries: entries.map((row) => toListEntryDetail(row)),
      owner: { displayName: owner.displayName ?? "Anonymous" },
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(response);
  });
