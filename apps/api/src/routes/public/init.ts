import { initContract } from "@openrift/shared/contracts/init";
import type { InitResponse } from "@openrift/shared/types/api/init";
import type { KeywordEntry } from "@openrift/shared/types/api/keyword";
import type { CustomTag, DistributionChannel } from "@openrift/shared/types/catalog";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(initContract).$context<ApiContext>().use(requireUser);

function stripInternal<T extends { isWellKnown: boolean }>(rows: T[]): Omit<T, "isWellKnown">[] {
  return rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest);
}

/**
 * Public init read.
 * `GET /api/v1/init` — enums + keywords + distribution channels + custom tags
 * in a single request.
 */
export const initRouter = {
  get: os.get.handler(async ({ context }): Promise<InitResponse> => {
    const {
      enums,
      keywords,
      distributionChannels,
      customTags,
      catalog,
      tagCategories,
      tagDefinitions,
    } = context.repos;
    const [
      enumData,
      keywordRows,
      translations,
      channelRows,
      customTagRows,
      championIdentifierTags,
      tagCategoryRows,
      tagDefinitionRows,
    ] = await Promise.all([
      enums.all(),
      keywords.listAll(),
      keywords.listAllTranslations(),
      distributionChannels.listAll(),
      customTags.listAll(),
      catalog.championIdentifierTags(),
      tagCategories.listAll(),
      tagDefinitions.listAll(),
    ]);

    const keywordsMap: Record<string, KeywordEntry> = {};
    for (const row of keywordRows) {
      keywordsMap[row.name] = {
        color: row.color,
        darkText: row.darkText,
        costKeyword: row.costKeyword,
      };
    }

    for (const translation of translations) {
      const entry = keywordsMap[translation.keywordName];
      if (entry) {
        entry.translations ??= {};
        entry.translations[translation.language] = translation.label;
      }
    }

    // Listing keys explicitly keeps this checked against InitResponse["enums"];
    // folding over Object.entries would need an index-signature cast.
    const strippedEnums: InitResponse["enums"] = {
      cardTypes: stripInternal(enumData.cardTypes),
      rarities: stripInternal(enumData.rarities),
      domains: stripInternal(enumData.domains),
      superTypes: stripInternal(enumData.superTypes),
      finishes: stripInternal(enumData.finishes),
      artVariants: stripInternal(enumData.artVariants),
      cardSizes: stripInternal(enumData.cardSizes),
      deckFormats: stripInternal(enumData.deckFormats),
      deckZones: stripInternal(enumData.deckZones),
      conditions: stripInternal(enumData.conditions),
      graders: stripInternal(enumData.graders),
      languages: stripInternal(enumData.languages),
      markers: enumData.markers,
    };

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
      tagCategories: tagCategoryRows.map((row) => ({
        slug: row.slug,
        label: row.label,
        sortOrder: row.sortOrder,
      })),
      tagCategoryMap: Object.fromEntries(tagDefinitionRows.map((row) => [row.tag, row.category])),
    };
  }),
};
