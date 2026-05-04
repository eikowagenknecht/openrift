import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { InitResponse, KeywordEntry } from "@openrift/shared";
import { initResponseSchema } from "@openrift/shared/response-schemas";

import type { Variables } from "../../types.js";

const getInit = createRoute({
  method: "get",
  path: "/init",
  tags: ["Init"],
  responses: {
    200: {
      content: { "application/json": { schema: initResponseSchema } },
      description: "Bootstrap data: enums and keywords",
    },
  },
});

/** Public: GET /init — returns enums + keywords in a single request. */
export const initRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(getInit, async (c) => {
  const { enums, keywords } = c.get("repos");
  const [enumData, keywordRows, translations] = await Promise.all([
    enums.all(),
    keywords.listAll(),
    keywords.listAllTranslations(),
  ]);

  const keywordsMap: Record<string, KeywordEntry> = {};
  for (const row of keywordRows) {
    keywordsMap[row.name] = { color: row.color, darkText: row.darkText };
  }

  for (const translation of translations) {
    const entry = keywordsMap[translation.keywordName];
    if (entry) {
      entry.translations ??= {};
      entry.translations[translation.language] = translation.label;
    }
  }

  const strippedEnums = Object.fromEntries(
    Object.entries(enumData).map(([key, rows]) => [
      key,
      rows.map((row) => {
        const { isWellKnown: _isWellKnown, ...rest } = row as { isWellKnown?: boolean } & Record<
          string,
          unknown
        >;
        return rest;
      }),
    ]),
  ) as unknown as InitResponse["enums"];

  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  return c.json({
    enums: strippedEnums,
    keywords: keywordsMap,
  } satisfies InitResponse);
});
