import type { CustomTag, DistributionChannel, InitResponse, KeywordEntry } from "@openrift/shared";
import { initContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(initContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the public init contract.
 * `GET /api/v1/init` — enums + keywords + distribution channels + custom tags
 * in a single request. Logic unchanged; only the routing layer moved.
 */
export const initRouter = {
  get: os.get.handler(async ({ context }): Promise<InitResponse> => {
    const { enums, keywords, distributionChannels, customTags, catalog } = context.repos;
    const [
      enumData,
      keywordRows,
      translations,
      channelRows,
      customTagRows,
      championIdentifierTags,
    ] = await Promise.all([
      enums.all(),
      keywords.listAll(),
      keywords.listAllTranslations(),
      distributionChannels.listAll(),
      customTags.listAll(),
      catalog.championIdentifierTags(),
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

    return {
      enums: strippedEnums,
      keywords: keywordsMap,
      distributionChannels: channelsResponse,
      customTags: customTagsResponse,
      championIdentifierTags,
    };
  }),
};
