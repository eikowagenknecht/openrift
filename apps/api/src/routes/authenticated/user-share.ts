import { createRoute } from "@hono/zod-openapi";
import type { UserShareStateResponse } from "@openrift/shared";
import { userShareStateResponseSchema } from "@openrift/shared/response-schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { cookieAuth, errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
import { assertFound } from "../../utils/assertions.js";
import { generateShareToken } from "../../utils/share-token.js";

const getShareState = createRoute({
  method: "get",
  path: "/",
  tags: ["User Share"],
  security: cookieAuth,
  responses: {
    200: {
      content: { "application/json": { schema: userShareStateResponseSchema } },
      description: "Current bundle share state for the signed-in user",
    },
    ...errorResponses(401),
  },
});

const enableShare = createRoute({
  method: "post",
  path: "/",
  tags: ["User Share"],
  security: cookieAuth,
  responses: {
    200: {
      content: { "application/json": { schema: userShareStateResponseSchema } },
      description: "Bundle share enabled (idempotent — returns the existing token if already on)",
    },
    ...errorResponses(401, 404),
  },
});

const disableShare = createRoute({
  method: "delete",
  path: "/",
  tags: ["User Share"],
  security: cookieAuth,
  responses: {
    204: { description: "No Content" },
    ...errorResponses(401, 404),
  },
});

const rotateShare = createRoute({
  method: "post",
  path: "/rotate",
  tags: ["User Share"],
  security: cookieAuth,
  responses: {
    200: {
      content: { "application/json": { schema: userShareStateResponseSchema } },
      description: "Bundle share token rotated",
    },
    ...errorResponses(401, 404),
  },
});

const userShareApp = createApiApp().basePath("/users/me/share");
userShareApp.use(requireAuth);

/**
 * Endpoints for the signed-in user to manage their bundle share token
 * (see ADR-018). The token gates `/users/share/:token` and resolves to the
 * user's wish + trade lists.
 */
export const userShareRoute = userShareApp
  // ── GET /users/me/share ─────────────────────────────────────────────────
  .openapi(getShareState, async (c) => {
    const { userShares } = c.get("repos");
    const row = await userShares.getShareToken(getUserId(c));
    return c.json({ shareToken: row?.shareToken ?? null } satisfies UserShareStateResponse, 200);
  })

  // ── POST /users/me/share ────────────────────────────────────────────────
  // Idempotent enable: if a token already exists, return it; otherwise mint
  // one. Rotation is a separate endpoint to avoid surprise token churn.
  .openapi(enableShare, async (c) => {
    const { userShares } = c.get("repos");
    const userId = getUserId(c);
    const current = await userShares.getShareToken(userId);
    if (current?.shareToken) {
      return c.json({ shareToken: current.shareToken } satisfies UserShareStateResponse, 200);
    }
    const updated = await userShares.setShareToken(userId, generateShareToken());
    assertFound(updated, "User not found");
    return c.json({ shareToken: updated.shareToken } satisfies UserShareStateResponse, 200);
  })

  // ── DELETE /users/me/share ──────────────────────────────────────────────
  .openapi(disableShare, async (c) => {
    const { userShares } = c.get("repos");
    const updated = await userShares.setShareToken(getUserId(c), null);
    assertFound(updated, "User not found");
    return c.body(null, 204);
  })

  // ── POST /users/me/share/rotate ─────────────────────────────────────────
  // Overwrites the existing token. The previous URL stops resolving
  // immediately; the new URL is returned.
  .openapi(rotateShare, async (c) => {
    const { userShares } = c.get("repos");
    const updated = await userShares.setShareToken(getUserId(c), generateShareToken());
    assertFound(updated, "User not found");
    return c.json({ shareToken: updated.shareToken } satisfies UserShareStateResponse, 200);
  });
