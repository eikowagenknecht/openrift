import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { PublicTradeListDetailResponse } from "@openrift/shared";
import { publicTradeListDetailResponseSchema } from "@openrift/shared/response-schemas";
import { z } from "zod";

import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { toPublicTradeList, toTradeListItemDetail } from "../../utils/mappers.js";

const shareTokenParamSchema = z.object({
  token: z.string().min(1),
});

const getPublicTradeListByShareToken = createRoute({
  method: "get",
  path: "/trade-lists/share/{token}",
  tags: ["Trade Lists"],
  request: { params: shareTokenParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: publicTradeListDetailResponseSchema } },
      description: "Shared trade list",
    },
  },
});

/** Public: GET /trade-lists/share/{token} — anonymous view of a shared trade list.
 *  404 if the token does not match. */
export const publicTradeListsRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getPublicTradeListByShareToken,
  async (c) => {
    const { tradeLists } = c.get("repos");
    const { token } = c.req.valid("param");

    const found = await tradeLists.findByShareToken(token);
    assertFound(found, "Not found");

    const itemRows = await tradeLists.itemsWithDetailsAnon(found.tradeList.id);

    const response: PublicTradeListDetailResponse = {
      tradeList: toPublicTradeList(found.tradeList),
      items: itemRows.map((row) => toTradeListItemDetail(row)),
      owner: { displayName: found.ownerName ?? "Anonymous" },
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(response);
  },
);
