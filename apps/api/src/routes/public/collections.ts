import { createRoute } from "@hono/zod-openapi";
import type { PublicCollectionDetailResponse } from "@openrift/shared";
import { publicCollectionDetailResponseSchema } from "@openrift/shared/response-schemas";
import { copiesQuerySchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
import { buildCopiesCursor, clampCopiesLimit } from "../../repositories/copies.js";
import { assertFound } from "../../utils/assertions.js";
import { toPublicCollection, toPublicCopy } from "../../utils/mappers.js";
import { getFavoriteMarketplace } from "../../utils/preferences.js";

const shareTokenParamSchema = z.object({
  token: z.string().min(1),
});

const getPublicCollectionByShareToken = createRoute({
  method: "get",
  path: "/collections/share/{token}",
  tags: ["Collections"],
  request: { params: shareTokenParamSchema, query: copiesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: publicCollectionDetailResponseSchema } },
      description: "Shared collection",
    },
    ...errorResponses(400, 404),
  },
});

/** Public: GET /collections/share/{token} — anonymous view of a shared collection.
 *  Copies are paginated cursor-style, same shape as the authenticated copies endpoint.
 *  Value is computed using the owner's favorite marketplace, matching the figure
 *  the owner sees when sharing. 404 if the token does not match a public collection. */
export const publicCollectionsRoute = createApiApp().openapi(
  getPublicCollectionByShareToken,
  async (c) => {
    const repos = c.get("repos");
    const { collections, copies, marketplace } = repos;
    const { token } = c.req.valid("param");
    const { cursor, limit } = c.req.valid("query");

    const found = await collections.findByShareToken(token);
    assertFound(found, "Not found");

    const favMarketplace = await getFavoriteMarketplace(repos, found.collection.userId);
    const value = await marketplace.singleCollectionValue(found.collection.id, favMarketplace);

    const effectiveLimit = clampCopiesLimit(limit);
    const rows = await copies.listForCollection(found.collection.id, effectiveLimit, cursor);
    const hasMore = rows.length > effectiveLimit;
    const items = rows.slice(0, effectiveLimit);
    const lastItem = items.at(-1);

    const response: PublicCollectionDetailResponse = {
      collection: toPublicCollection(found.collection, value),
      items: items.map((row) => toPublicCopy(row)),
      nextCursor: hasMore && lastItem ? buildCopiesCursor(lastItem.createdAt, lastItem.id) : null,
      owner: { displayName: found.ownerName ?? "Anonymous" },
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(response, 200);
  },
);
