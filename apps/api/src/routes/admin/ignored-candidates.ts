import { adminIgnoredCandidatesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminIgnoredCandidatesContract).$context<ApiContext>().use(requireUser);

/**
 * Admin ignored-candidates controls. Any thrown `AppError` is mapped by the
 * handler's appErrorInterceptor.
 */
export const adminIgnoredCandidatesRouter = {
  list: os.list.handler(async ({ context }) => {
    const { ignoredCandidates } = context.repos;

    const [cards, printings] = await Promise.all([
      ignoredCandidates.listIgnoredCards(),
      ignoredCandidates.listIgnoredPrintings(),
    ]);

    return {
      cards: cards.map((r) => ({
        id: r.id,
        provider: r.provider,
        externalId: r.externalId,
        createdAt: r.createdAt.toISOString(),
      })),
      printings: printings.map((r) => ({
        id: r.id,
        provider: r.provider,
        externalId: r.externalId,
        finish: r.finish,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }),

  ignoreCard: os.ignoreCard.handler(async ({ input, context }): Promise<void> => {
    const { ignoredCandidates } = context.repos;
    const { provider, externalId } = input;
    await ignoredCandidates.ignoreCard({ provider, externalId });
  }),

  unignoreCard: os.unignoreCard.handler(async ({ input, context }): Promise<void> => {
    const { ignoredCandidates } = context.repos;
    const { provider, externalId } = input;
    await ignoredCandidates.unignoreCard(provider, externalId);
  }),

  ignorePrinting: os.ignorePrinting.handler(async ({ input, context }): Promise<void> => {
    const { ignoredCandidates } = context.repos;
    const { provider, externalId, finish } = input;
    await ignoredCandidates.ignorePrinting({ provider, externalId, finish: finish ?? null });
  }),

  unignorePrinting: os.unignorePrinting.handler(async ({ input, context }): Promise<void> => {
    const { ignoredCandidates } = context.repos;
    const { provider, externalId, finish } = input;
    await ignoredCandidates.unignorePrinting(provider, externalId, finish);
  }),
};
