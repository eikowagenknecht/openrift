import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { CustomTag, DistributionChannel, InitResponse, KeywordEntry } from "@openrift/shared";
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
  const { enums, keywords, distributionChannels, customTags } = c.get("repos");
  const [enumData, keywordRows, translations, channelRows, customTagRows] = await Promise.all([
    enums.all(),
    keywords.listAll(),
    keywords.listAllTranslations(),
    distributionChannels.listAll(),
    customTags.listAll(),
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

  const channelsResponse: DistributionChannel[] = channelRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    kind: row.kind,
    parentId: row.parentId,
    childrenLabel: row.childrenLabel,
  }));

  const customTagsResponse: CustomTag[] = customTagRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    category: row.category,
    categoryLabel: row.categoryLabel,
    description: row.description,
    sortOrder: row.sortOrder,
  }));

  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  return c.json({
    enums: strippedEnums,
    keywords: keywordsMap,
    distributionChannels: channelsResponse,
    customTags: customTagsResponse,
  } satisfies InitResponse);
});
