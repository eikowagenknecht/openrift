import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { PublicListDetailResponse } from "@openrift/shared";
import { publicListDetailResponseSchema } from "@openrift/shared/response-schemas";
import { z } from "zod";

import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { toListEntryDetail, toPublicList } from "../../utils/mappers.js";

const shareTokenParamSchema = z.object({
  token: z.string().min(1),
});

const getPublicListByShareToken = createRoute({
  method: "get",
  path: "/lists/share/{token}",
  tags: ["Lists"],
  request: { params: shareTokenParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: publicListDetailResponseSchema } },
      description: "Shared list",
    },
  },
});

/** Public: GET /lists/share/{token} — anonymous view of a shared list.
 *  Returns 404 if the token does not match or the list isn't public. */
export const publicListsRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getPublicListByShareToken,
  async (c) => {
    const { lists } = c.get("repos");
    const { token } = c.req.valid("param");

    const found = await lists.findByShareToken(token);
    assertFound(found, "Not found");

    const entries = await lists.entriesWithDetailsAnon(found.list.id, found.list.kind);

    const response: PublicListDetailResponse = {
      list: toPublicList(found.list),
      entries: entries.map((row) => toListEntryDetail(row)),
      owner: { displayName: found.ownerName ?? "Anonymous" },
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(response);
  },
);
