import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { KeywordStylesResponse } from "@openrift/shared";
import { keywordStylesResponseSchema } from "@openrift/shared/response-schemas";

import type { Variables } from "../../types.js";

const getKeywordStyles = createRoute({
  method: "get",
  path: "/keyword-styles",
  tags: ["Keyword Styles"],
  responses: {
    200: {
      content: { "application/json": { schema: keywordStylesResponseSchema } },
      description: "Keyword styles map",
    },
  },
});

/** Public: GET /keyword-styles — returns `{ name: { color, darkText } }` map for keyword badge rendering. */
export const keywordStylesRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getKeywordStyles,
  async (c) => {
    const { keywordStyles } = c.get("repos");
    const rows = await keywordStyles.listAll();

    const styles: Record<string, { color: string; darkText: boolean }> = {};
    for (const row of rows) {
      styles[row.name] = { color: row.color, darkText: row.darkText };
    }
    c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return c.json({ items: styles } satisfies KeywordStylesResponse);
  },
);
