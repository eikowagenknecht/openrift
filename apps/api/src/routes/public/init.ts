import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { InitResponse, KeywordStyleEntry } from "@openrift/shared";
import { initResponseSchema } from "@openrift/shared/response-schemas";

import type { Variables } from "../../types.js";

const getInit = createRoute({
  method: "get",
  path: "/init",
  tags: ["Init"],
  responses: {
    200: {
      content: { "application/json": { schema: initResponseSchema } },
      description: "Bootstrap data: enums and keyword styles",
    },
  },
});

/** Public: GET /init — returns enums + keyword styles in a single request. */
export const initRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(getInit, async (c) => {
  const { enums, keywordStyles } = c.get("repos");
  const [enumData, styleRows, translations] = await Promise.all([
    enums.all(),
    keywordStyles.listAll(),
    keywordStyles.listAllTranslations(),
  ]);

  const styles: Record<string, KeywordStyleEntry> = {};
  for (const row of styleRows) {
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

  // Strip isWellKnown from enum rows before sending
  const strippedEnums = Object.fromEntries(
    Object.entries(enumData).map(([key, rows]) => [
      key,
      rows.map(({ isWellKnown: _, ...rest }) => rest),
    ]),
  ) as InitResponse["enums"];

  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  return c.json({
    enums: strippedEnums,
    keywordStyles: styles,
  } satisfies InitResponse);
});
