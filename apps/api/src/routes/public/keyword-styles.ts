import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { KeywordStyleEntry, KeywordStylesResponse } from "@openrift/shared";
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

/** Public: GET /keyword-styles — returns styles and translations for keyword badge rendering. */
export const keywordStylesRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getKeywordStyles,
  async (c) => {
    const { keywordStyles } = c.get("repos");
    const [rows, translations] = await Promise.all([
      keywordStyles.listAll(),
      keywordStyles.listAllTranslations(),
    ]);

    const styles: Record<string, KeywordStyleEntry> = {};
    for (const row of rows) {
      styles[row.name] = { color: row.color, darkText: row.darkText };
    }

    // Attach translations to their parent keyword style
    for (const translation of translations) {
      const style = styles[translation.keywordName];
      if (style) {
        style.translations ??= {};
        style.translations[translation.language] = translation.label;
      }
    }

    c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return c.json({ items: styles } satisfies KeywordStylesResponse);
  },
);
