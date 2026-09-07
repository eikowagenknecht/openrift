import { adminKeywordsContract } from "@openrift/shared/contracts/admin/keywords";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { discoverKeywordTranslations } from "../../services/keyword-translation-discovery.js";

const os = implement(adminKeywordsContract).$context<ApiContext>().use(requireAuthedUser);

export const adminKeywordsRouter = {
  stats: os.stats.handler(async ({ context }) => {
    const { keywords } = context.repos;
    const [counts, allStyles, translations] = await Promise.all([
      keywords.getKeywordCounts(),
      keywords.listAll(),
      keywords.listAllTranslations(),
    ]);
    const styles = allStyles.map((s) => ({
      name: s.name,
      color: s.color,
      darkText: s.darkText,
      costKeyword: s.costKeyword,
    }));
    return { counts, styles, translations };
  }),

  createStyle: os.createStyle.handler(async ({ input, context }): Promise<void> => {
    await context.repos.keywords.createStyle(input);
  }),

  updateStyle: os.updateStyle.handler(async ({ input, context }): Promise<void> => {
    const { name, color, darkText, costKeyword } = input;
    await context.repos.keywords.upsertStyle({ name, color, darkText, costKeyword });
  }),

  removeStyle: os.removeStyle.handler(async ({ input, context }): Promise<void> => {
    await context.repos.keywords.deleteStyle(input.name);
  }),

  recompute: os.recompute.handler(({ context }) => context.repos.keywords.recomputeAll()),

  discoverTranslations: os.discoverTranslations.handler(async ({ context }) => {
    const repos = context.repos;
    return await discoverKeywordTranslations(repos);
  }),

  upsertTranslation: os.upsertTranslation.handler(async ({ input, context }): Promise<void> => {
    const { keywordName, language, label } = input;
    await context.repos.keywords.upsertTranslation({ keywordName, language, label });
  }),

  removeTranslation: os.removeTranslation.handler(async ({ input, context }): Promise<void> => {
    const { keywordName, language } = input;
    await context.repos.keywords.deleteTranslation(keywordName, language);
  }),
};
