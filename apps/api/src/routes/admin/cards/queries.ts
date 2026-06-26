import { adminCardQueriesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import {
  buildCandidateCardList,
  buildCardDetail,
  buildExport,
  buildUnmatchedDetail,
} from "../../../services/candidate-queries.js";

const os = implement(adminCardQueriesContract).$context<ApiContext>().use(requireUser);

/**
 * Read-only admin card queries. `providerStats` coerces the `lastUpdated`
 * timestamp (a native `Date` from the driver, despite its `sql<string>` type)
 * to an ISO string for the `z.string()` output schema, and `getCandidateCard`
 * may throw `AppError` (missing alias) which is mapped by the handler's
 * appErrorInterceptor.
 */
export const adminCardQueriesRouter = {
  allCards: os.allCards.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await candidateCards.listAllCards();
  }),

  providerNames: os.providerNames.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await candidateCards.distinctProviderNames();
  }),

  distinctArtists: os.distinctArtists.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await candidateCards.distinctArtists();
  }),

  providerStats: os.providerStats.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    const stats = await candidateCards.providerStats();
    return stats.map((s) => ({ ...s, lastUpdated: new Date(s.lastUpdated).toISOString() }));
  }),

  listCandidates: os.listCandidates.handler(async ({ context }) => {
    const { candidateCards, providerSettings } = context.repos;
    const favoriteProviders = await providerSettings.favoriteProviders();
    return await buildCandidateCardList(candidateCards, favoriteProviders);
  }),

  exportCandidates: os.exportCandidates.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await buildExport(candidateCards);
  }),

  getCandidateCard: os.getCandidateCard.handler(async ({ input, context }) => {
    const { candidateCards, marketplaceMapping } = context.repos;
    return await buildCardDetail(candidateCards, marketplaceMapping, input.cardSlug);
  }),

  getUnmatchedDetail: os.getUnmatchedDetail.handler(async ({ input, context }) => {
    const { candidateCards } = context.repos;
    return await buildUnmatchedDetail(candidateCards, input.name);
  }),
};
