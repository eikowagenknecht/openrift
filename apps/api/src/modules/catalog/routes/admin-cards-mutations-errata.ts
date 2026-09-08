import { adminCardMutationsContract } from "@openrift/shared/contracts/admin/card-mutations";
import { extractKeywords } from "@openrift/shared/keywords";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";

const os = implement(adminCardMutationsContract).$context<ApiContext>().use(requireAuthedUser);

export const adminCardMutationsErrataRouter = {
  upsertErrata: os.upsertErrata.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut, cardErrata } = context.repos;
    const { cardId, correctedRulesText, correctedEffectText, source, sourceUrl, effectiveDate } =
      input;

    const [errataBefore] = await cardErrata.getByCardIds([cardId]);
    const card = await mut.getCardById(cardId);

    await cardErrata.upsert(cardId, {
      correctedRulesText,
      correctedEffectText,
      source,
      sourceUrl,
      effectiveDate,
    });

    const printingTexts = await mut.getPrintingTextsForCardId(cardId);
    const keywords = [
      ...extractKeywords(correctedRulesText ?? ""),
      ...extractKeywords(correctedEffectText ?? ""),
      ...printingTexts.flatMap((pt) => [
        ...extractKeywords(pt.printedRulesText ?? ""),
        ...extractKeywords(pt.printedEffectText ?? ""),
      ]),
    ].filter((v, i, a) => a.indexOf(v) === i);

    await mut.updateCardById(cardId, { keywords });

    // Errata text can add or remove a token reference just like printing text.
    await context.repos.cardTokens.recomputeForCard(cardId);
    await context.repos.catalog.refreshCardAggregates();

    await recordAdminEvent(context.repos, context.userId, {
      action: "errata.upsert",
      entityType: "errata",
      entityId: cardId,
      entityLabel: card?.name ?? null,
      cardSlug: card?.slug ?? null,
      oldValues: errataBefore ?? null,
      newValues: { correctedRulesText, correctedEffectText, source, sourceUrl, effectiveDate },
    });
  }),

  deleteErrata: os.deleteErrata.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut, cardErrata } = context.repos;
    const { cardId } = input;

    const [errataBefore] = await cardErrata.getByCardIds([cardId]);
    const card = await mut.getCardById(cardId);

    await cardErrata.deleteByCardId(cardId);

    const printingTexts = await mut.getPrintingTextsForCardId(cardId);
    const keywords = printingTexts
      .flatMap((pt) => [
        ...extractKeywords(pt.printedRulesText ?? ""),
        ...extractKeywords(pt.printedEffectText ?? ""),
      ])
      .filter((v, i, a) => a.indexOf(v) === i);

    await mut.updateCardById(cardId, { keywords });

    // Dropping errata can drop the only text that referenced a token.
    await context.repos.cardTokens.recomputeForCard(cardId);
    await context.repos.catalog.refreshCardAggregates();

    await recordAdminEvent(context.repos, context.userId, {
      action: "errata.delete",
      entityType: "errata",
      entityId: cardId,
      entityLabel: card?.name ?? null,
      cardSlug: card?.slug ?? null,
      oldValues: errataBefore ?? null,
    });
  }),

  uploadErrata: os.uploadErrata.handler(async ({ input, context }) => {
    const { importErrata } = context.services;
    const result = await importErrata(context.transact, {
      entries: input.entries,
      dryRun: input.dryRun,
    });

    if (!input.dryRun) {
      await recordAdminEvent(context.repos, context.userId, {
        action: "errata.upload",
        entityType: "upload",
        newValues: {
          newCount: result.newCount,
          updatedCount: result.updatedCount,
          unchangedCount: result.unchangedCount,
          errors: result.errors.length,
        },
      });
    }

    return result;
  }),
};
